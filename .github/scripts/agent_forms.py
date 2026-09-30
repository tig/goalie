#!/usr/bin/env python3
"""Regenerate an agent form from its full text with the Cursor CLI.

Every top-level directory with a prompts/agent-form.md is a collection.
The system prompt lives in <dir>/prompts/agent-form.md so it can be tuned
without touching code. <dir>/agent-forms.lock.json records, per source file,
the hashes of the inputs (source, prompt, model) and of the generated output.

By default the agent form is <dir>/<name>.agent.md. A line in the prompt
header, above the first horizontal rule, sends a source somewhere else:

    agents.md -> ../AGENTS.md

Only the text below that rule is sent to the model. The header line is how
this repo writes the paid file at the root. Agents load AGENTS.md, not a
sibling they will never open.

  generate          Regenerate every agent form whose inputs changed.
                    Needs `cursor-agent` on PATH and CURSOR_API_KEY set.
  generate --force  Regenerate every agent form.
  check             Exit 1 if any agent form is stale or was edited by hand.
                    Makes no API call.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Empty means the Cursor account default. Set AGENT_FORMS_MODEL to pin a model.
MODEL = os.environ.get("AGENT_FORMS_MODEL", "")
PROMPT_MARKER = "\n---\n"
OUTPUT_LINE = re.compile(r"^(\S+\.md) -> (\S+)$")


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def collections() -> list[Path]:
    return sorted(p.parents[1] for p in ROOT.glob("*/prompts/agent-form.md"))


def sources(collection: Path) -> list[Path]:
    return sorted(p for p in collection.glob("*.md") if not p.name.endswith(".agent.md"))


def prompt_header(collection: Path) -> str:
    text = (collection / "prompts" / "agent-form.md").read_text(encoding="utf-8")
    return text.split(PROMPT_MARKER, 1)[0]


def agent_path(source: Path) -> Path:
    for line in prompt_header(source.parent).splitlines():
        match = OUTPUT_LINE.match(line.strip())
        if match and match.group(1) == source.name:
            return (source.parent / match.group(2)).resolve()
    return source.with_name(source.stem + ".agent.md")


def lock_path(collection: Path) -> Path:
    return collection / "agent-forms.lock.json"


def system_prompt(collection: Path) -> str:
    text = (collection / "prompts" / "agent-form.md").read_text(encoding="utf-8")
    # Only the text after the first horizontal rule is sent to the model.
    return text.split(PROMPT_MARKER, 1)[1].strip()


def input_hash(source: Path) -> str:
    return sha(f"{MODEL}\n{system_prompt(source.parent)}\n{source.read_text(encoding='utf-8')}")


def load_lock(collection: Path) -> dict:
    path = lock_path(collection)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def stale(source: Path, lock: dict) -> str | None:
    entry = lock.get(source.name)
    target = agent_path(source)
    if entry is None:
        return "not in lock file"
    if entry["input"] != input_hash(source):
        return "source, prompt, or model changed"
    if not target.exists():
        return f"{target.name} missing"
    if entry["output"] != sha(target.read_text(encoding="utf-8")):
        return f"{target.name} edited by hand"
    return None


def cursor_agent_argv(prompt: str) -> list[str]:
    """Build the cursor-agent invocation.

    On Linux, `cursor-agent` is a binary and the prompt is an argument.
    On Windows the PATH entry is a .cmd that relaunches through cmd.exe,
    which cannot carry a prompt of this size. Resolve that wrapper to the
    versioned node binary and pass the prompt to it directly.
    """
    found = shutil.which("cursor-agent")
    if not found:
        sys.exit("cursor-agent not on PATH")
    # ask: return text. The default print mode has write tools and will go
    # read the repo instead of compressing the text it was given.
    flags = ["--print", "--trust", "--mode", "ask", "--output-format", "text"]
    if MODEL:
        flags += ["--model", MODEL]
    if os.name != "nt" or not found.lower().endswith((".cmd", ".bat", ".ps1")):
        return [found, *flags, prompt]
    root = Path(found).resolve().parent
    versions = sorted(
        (p for p in (root / "versions").iterdir() if (p / "node.exe").is_file() and (p / "index.js").is_file()),
        reverse=True,
    )
    if not versions:
        sys.exit(f"no cursor-agent version under {root / 'versions'}")
    version = versions[0]
    return [str(version / "node.exe"), str(version / "index.js"), *flags, prompt]


def generate(source: Path) -> str:
    target = agent_path(source)
    prompt = f"{system_prompt(source.parent)}\n\n<name>{source.stem}</name>\n<full_text>\n{source.read_text(encoding='utf-8')}\n</full_text>"
    if target.exists():
        prompt += f"\n<current_agent_form>\n{target.read_text(encoding='utf-8')}\n</current_agent_form>"

    result = subprocess.run(
        cursor_agent_argv(prompt),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )
    if result.returncode != 0:
        sys.exit(f"{source.name}: cursor-agent exited {result.returncode}\n{result.stderr}")
    match = re.search(r"<agent_form>\s*(.*?)\s*</agent_form>", result.stdout, re.S)
    if not match:
        sys.exit(f"{source.name}: no <agent_form> block in model output\n{result.stdout}")
    return match.group(1).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["generate", "check"])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    problems = []
    for collection in collections():
        lock = load_lock(collection)
        if args.command == "check":
            problems += [(s, r) for s in sources(collection) if (r := stale(s, lock))]
            continue

        for source in sources(collection):
            reason = "forced" if args.force else stale(source, lock)
            if not reason:
                continue
            print(f"{source.relative_to(ROOT)}: regenerating ({reason})")
            output = generate(source)
            agent_path(source).write_text(output, encoding="utf-8", newline="\n")
            lock[source.name] = {"model": MODEL or "cursor-default", "input": input_hash(source), "output": sha(output)}

        lock = {k: lock[k] for k in sorted(lock) if (collection / k).exists()}
        lock_path(collection).write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8", newline="\n")

    for source, reason in problems:
        print(f"::error file={source.relative_to(ROOT)}::agent form is stale: {reason}")
    if problems:
        print("Run the 'Agent forms' workflow, or tune <dir>/prompts/agent-form.md.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
