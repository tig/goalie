#!/usr/bin/env python3
"""Regenerate an agent form from its full text with the Cursor CLI.

Every top-level directory with a prompts/agent-form.md is a collection.
The system prompt lives in <dir>/prompts/agent-form.md so it can be tuned
without touching code. <dir>/agent-forms.lock.json records, per source file,
the hashes of the inputs (source, prompt, model) and of the generated output.

By default the agent form is <dir>/<name>.agent.md. An optional
<dir>/prompts/output.json maps a source file name to a repo-root relative
path. With no map, the output path and the input hash match a collection
that has never had one, so this file can be copied into excaliwire/operations
without regenerating its forms. A mapped path is part of the input hash.

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
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Empty means the Cursor account default. Set AGENT_FORMS_MODEL to pin a model.
MODEL = os.environ.get("AGENT_FORMS_MODEL", "")
PROMPT_MARKER = "\n---\n"


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def collections() -> list[Path]:
    return sorted(p.parents[1] for p in ROOT.glob("*/prompts/agent-form.md"))


def sources(collection: Path) -> list[Path]:
    return sorted(p for p in collection.glob("*.md") if not p.name.endswith(".agent.md"))


def output_map(collection: Path) -> dict[str, str]:
    path = collection / "prompts" / "output.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in data.items()):
        sys.exit(f"{path}: output map must be an object of strings")
    return data


def agent_path(source: Path) -> Path:
    rel = output_map(source.parent).get(source.name)
    if not rel:
        return source.with_name(source.stem + ".agent.md")
    root = ROOT.resolve()
    dest = (root / rel).resolve()
    if Path(os.path.commonpath([dest, root])) != root:
        sys.exit(f"{source.name}: output path escapes the repo: {rel}")
    return dest


def lock_path(collection: Path) -> Path:
    return collection / "agent-forms.lock.json"


def system_prompt(collection: Path) -> str:
    text = (collection / "prompts" / "agent-form.md").read_text(encoding="utf-8")
    # Only the text after the first horizontal rule is sent to the model.
    return text.split(PROMPT_MARKER, 1)[1].strip()


def input_hash(source: Path) -> str:
    body = f"{MODEL}\n{system_prompt(source.parent)}\n{source.read_text(encoding='utf-8')}"
    rel = output_map(source.parent).get(source.name)
    if rel:
        body = f"{rel}\n{body}"
    return sha(body)


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


def generate(source: Path) -> str:
    target = agent_path(source)
    prompt = (
        f"{system_prompt(source.parent)}\n\n<name>{source.stem}</name>\n"
        f"<full_text>\n{source.read_text(encoding='utf-8')}\n</full_text>"
    )
    if target.exists():
        prompt += f"\n<current_agent_form>\n{target.read_text(encoding='utf-8')}\n</current_agent_form>"

    cmd = ["cursor-agent", "--print", "--trust", "--output-format", "text"]
    if MODEL:
        cmd += ["--model", MODEL]
    result = subprocess.run(cmd + [prompt], capture_output=True, text=True, encoding="utf-8", timeout=600)
    if result.returncode != 0:
        sys.exit(f"{source.name}: cursor-agent exited {result.returncode}\n{result.stderr}")
    match = re.search(r"<agent_form>\s*(.*?)\s*</agent_form>", result.stdout, re.S)
    if not match:
        sys.exit(f"{source.name}: no <agent_form> block in model output\n{result.stdout}")
    return match.group(1) + "\n"


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
