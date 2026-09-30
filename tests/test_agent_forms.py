"""Behavior of .github/scripts/agent_forms.py.

A collection with no prompts/output.json must keep the operations contract:
the agent form is the sibling <name>.agent.md, and the input hash is
model, system prompt, source. A map is opt-in, repo-root relative, and part
of that hash. generate calls cursor-agent the same way operations does.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / ".github" / "scripts" / "agent_forms.py"
spec = importlib.util.spec_from_file_location("agent_forms", SCRIPT)
agent_forms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent_forms)

PROMPT = "Human notes.\n\n---\n\nCompress the full text.\n"


def operations_hash(model: str, prompt: str, source_text: str) -> str:
    """The input hash excaliwire/operations records when a collection has no map."""
    body = f"{model}\n{prompt}\n{source_text}"
    return hashlib.sha256(body.encode()).hexdigest()


def write_collection(root: Path, source_text: str, output_map: dict | None = None) -> Path:
    collection = root / "guidance"
    prompts = collection / "prompts"
    prompts.mkdir(parents=True)
    (prompts / "agent-form.md").write_text(PROMPT, encoding="utf-8", newline="\n")
    source = collection / "agents.md"
    source.write_text(source_text, encoding="utf-8", newline="\n")
    if output_map is not None:
        (prompts / "output.json").write_text(
            json.dumps(output_map, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
    return source


class CollectionLayout(unittest.TestCase):
    def setUp(self) -> None:
        self._root = agent_forms.ROOT
        self.tmp = TemporaryDirectory()
        agent_forms.ROOT = Path(self.tmp.name)

    def tearDown(self) -> None:
        agent_forms.ROOT = self._root
        self.tmp.cleanup()

    def test_no_map_writes_the_sibling_agent_form(self) -> None:
        source = write_collection(agent_forms.ROOT, "full\n")
        self.assertEqual(agent_forms.agent_path(source), source.with_name("agents.agent.md"))

    def test_no_map_keeps_the_operations_input_hash(self) -> None:
        source = write_collection(agent_forms.ROOT, "full\n")
        prompt = agent_forms.system_prompt(source.parent)
        expected = operations_hash(agent_forms.MODEL, prompt, source.read_text(encoding="utf-8"))
        self.assertEqual(agent_forms.input_hash(source), expected)

    def test_map_sends_the_paid_file_to_the_repo_root(self) -> None:
        source = write_collection(agent_forms.ROOT, "full\n", {"agents.md": "AGENTS.md"})
        self.assertEqual(agent_forms.agent_path(source), agent_forms.ROOT / "AGENTS.md")

    def test_map_is_part_of_the_input_hash(self) -> None:
        source = write_collection(agent_forms.ROOT, "full\n", {"agents.md": "AGENTS.md"})
        first = agent_forms.input_hash(source)
        (source.parent / "prompts" / "output.json").write_text(
            json.dumps({"agents.md": "OTHER.md"}, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        self.assertNotEqual(agent_forms.input_hash(source), first)
        prompt = agent_forms.system_prompt(source.parent)
        mapped = f"AGENTS.md\n{agent_forms.MODEL}\n{prompt}\n{source.read_text(encoding='utf-8')}"
        (source.parent / "prompts" / "output.json").write_text(
            json.dumps({"agents.md": "AGENTS.md"}, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        self.assertEqual(
            agent_forms.input_hash(source),
            hashlib.sha256(mapped.encode()).hexdigest(),
        )

    def test_a_path_that_escapes_the_repo_is_rejected(self) -> None:
        source = write_collection(agent_forms.ROOT, "full\n", {"agents.md": "../outside.md"})
        with self.assertRaises(SystemExit):
            agent_forms.agent_path(source)

    def test_changing_the_map_makes_a_current_form_stale(self) -> None:
        source = write_collection(agent_forms.ROOT, "full\n", {"agents.md": "AGENTS.md"})
        target = agent_forms.agent_path(source)
        target.write_text("short\n", encoding="utf-8", newline="\n")
        lock = {
            source.name: {
                "model": "hand-applied",
                "input": agent_forms.input_hash(source),
                "output": agent_forms.sha(target.read_text(encoding="utf-8")),
            }
        }
        self.assertIsNone(agent_forms.stale(source, lock))
        (source.parent / "prompts" / "output.json").write_text(
            json.dumps({"agents.md": "OTHER.md"}, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        (agent_forms.ROOT / "OTHER.md").write_text("short\n", encoding="utf-8", newline="\n")
        self.assertIsNotNone(agent_forms.stale(source, lock))


class GenerateCommand(unittest.TestCase):
    def setUp(self) -> None:
        self._root = agent_forms.ROOT
        self.tmp = TemporaryDirectory()
        agent_forms.ROOT = Path(self.tmp.name)

    def tearDown(self) -> None:
        agent_forms.ROOT = self._root
        self.tmp.cleanup()

    def test_generate_calls_cursor_agent_with_the_operations_flags(self) -> None:
        source = write_collection(agent_forms.ROOT, "full text\n", {"agents.md": "AGENTS.md"})
        from subprocess import CompletedProcess

        def fake_run(argv, **kwargs):
            self.assertEqual(
                argv[:5],
                ["cursor-agent", "--print", "--trust", "--output-format", "text"],
            )
            self.assertEqual(len(argv), 6 if not agent_forms.MODEL else 8)
            self.assertNotIn("--mode", argv)
            self.assertNotIn("ask", argv)
            self.assertNotIn("node.exe", " ".join(argv))
            self.assertIn("<full_text>", argv[-1])
            self.assertIn("full text", argv[-1])
            return CompletedProcess(argv, 0, stdout="<agent_form>\nshort\n</agent_form>\n", stderr="")

        with patch.object(agent_forms.subprocess, "run", fake_run):
            output = agent_forms.generate(source)
        self.assertEqual(output, "short\n")


class ThisRepo(unittest.TestCase):
    def test_goalie_agents_md_is_the_paid_file(self) -> None:
        source = REPO / "guidance" / "agents.md"
        self.assertEqual(agent_forms.agent_path(source).resolve(), (REPO / "AGENTS.md").resolve())

    def test_the_committed_lock_is_fresh(self) -> None:
        source = REPO / "guidance" / "agents.md"
        lock = agent_forms.load_lock(source.parent)
        self.assertIsNone(agent_forms.stale(source, lock))

    def test_check_command_passes(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr), patch("sys.argv", ["agent_forms.py", "check"]):
            code = agent_forms.main()
        self.assertEqual(code, 0, stdout.getvalue() + stderr.getvalue())
