"""CI matches the folder, and one component must not run another's CI."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORKFLOWS = REPO / ".github" / "workflows"

# Paths outside the component folder are inputs. ci_affected.py lists them.
COMPONENTS = {
    "server": [
        "server/**",
        ".github/workflows/server.yml",
        ".github/scripts/ci_affected.py",
    ],
    "tests": [
        "tests/**",
        "SPEC.md",
        "USERS_MANUAL.md",
        "docs/**",
        "CONTRIBUTING.md",
        ".github/workflows/server.yml",
        ".github/workflows/tests.yml",
        ".github/workflows/guidance.yml",
        ".github/scripts/ci_affected.py",
    ],
    "guidance": [
        "guidance/**",
        "AGENTS.md",
        ".github/scripts/agent_forms.py",
        ".github/workflows/guidance.yml",
        ".github/scripts/ci_affected.py",
    ],
}

RUNS = {
    "server": [
        "npm ci --prefix server",
        "npm run lint --prefix server",
        "npm run typecheck --prefix server",
        "python -m unittest discover -s server/tests -v",
    ],
    "tests": [
        "python -m unittest discover -s tests -v",
    ],
    "guidance": [
        "python -m unittest discover -s guidance/tests -v",
        "python .github/scripts/agent_forms.py check",
    ],
}

TENET = "A change in one component must not run another component's CI."
REPORTS = "The workflow starts on every pull request so its check can report."
COMMANDS_WHEN = "The component's commands run only when its inputs changed."
AFFECTED = "needs.changes.outputs.affected == 'true'"


def _paths(text: str) -> dict[str, list[str] | None]:
    """Path lists for each event under on:. None means the event has no path filter."""
    events: dict[str, list[str] | None] = {}
    current: str | None = None
    collecting = False
    for line in text.splitlines():
        event = re.match(r"^  ([A-Za-z_][\w]*):\s*$", line)
        if event:
            current = event.group(1)
            events[current] = None
            collecting = False
            continue
        if current and re.match(r"^    paths:\s*$", line):
            events[current] = []
            collecting = True
            continue
        if not collecting or current is None:
            continue
        item = re.match(r"^      - ['\"](.+)['\"]\s*$", line)
        if item:
            events[current].append(item.group(1))
            continue
        collecting = False
    return events


class CiTenets(unittest.TestCase):
    def test_each_component_has_its_own_workflow(self) -> None:
        names = sorted(path.name for path in WORKFLOWS.glob("*.yml"))
        self.assertEqual(names, ["guidance.yml", "server.yml", "tests.yml"])

    def test_path_filter_is_the_component_and_its_inputs(self) -> None:
        script = REPO / ".github" / "scripts" / "ci_affected.py"
        self.assertTrue(script.is_file())
        for name, expected in COMPONENTS.items():
            text = (WORKFLOWS / f"{name}.yml").read_text(encoding="utf-8")
            self.assertIn(f"name: {name}\n", text)
            events = _paths(text)
            self.assertIsNone(events["pull_request"], name)
            self.assertIsNone(events["push"], name)
            self.assertIn("python .github/scripts/ci_affected.py ${{ github.workflow }}\n", text)
            self.assertIn(f"if: {AFFECTED}\n", text)
            for path in expected:
                if path.endswith("/**"):
                    self.assertTrue((REPO / path[:-3]).is_dir(), path)
            for command in RUNS[name]:
                self.assertIn(AFFECTED, _if_before_run(text, command), command)

    def test_a_component_does_not_list_another_components_folder(self) -> None:
        server = set(COMPONENTS["server"])
        tests = set(COMPONENTS["tests"])
        guidance = set(COMPONENTS["guidance"])
        self.assertFalse(any(path.startswith("tests/") or path.startswith("guidance/") for path in server))
        self.assertFalse(any(path.startswith("server/") or path.startswith("guidance/") for path in tests))
        self.assertFalse(any(path.startswith("tests/") or path.startswith("server/") for path in guidance))
        self.assertNotIn("tests/**", guidance)

    def test_each_workflow_runs_only_its_commands(self) -> None:
        for name, commands in RUNS.items():
            text = (WORKFLOWS / f"{name}.yml").read_text(encoding="utf-8")
            for command in commands:
                self.assertIn(f"run: {command}\n", text, name)
        server = (WORKFLOWS / "server.yml").read_text(encoding="utf-8")
        tests = (WORKFLOWS / "tests.yml").read_text(encoding="utf-8")
        guidance = (WORKFLOWS / "guidance.yml").read_text(encoding="utf-8")
        self.assertNotIn("discover -s tests", server)
        self.assertNotIn("npm ", tests)
        self.assertNotIn("npm ", guidance)
        self.assertNotIn("discover -s tests", guidance)

    def test_the_guides_state_the_tenet(self) -> None:
        for path in (
            REPO / "CONTRIBUTING.md",
            REPO / "AGENTS.md",
            REPO / "guidance" / "agents.md",
        ):
            self.assertIn(TENET, path.read_text(encoding="utf-8"), path.name)
        contributing = (REPO / "CONTRIBUTING.md").read_text(encoding="utf-8")
        self.assertIn(REPORTS, contributing)
        self.assertIn(COMMANDS_WHEN, contributing)
        for commands in RUNS.values():
            for command in commands:
                self.assertIn(f"`{command}`", contributing)

    def test_affected_script_uses_the_component_inputs(self) -> None:
        import importlib.util

        path = REPO / ".github" / "scripts" / "ci_affected.py"
        spec = importlib.util.spec_from_file_location("ci_affected", path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.COMPONENTS, COMPONENTS)
        self.assertTrue(module.affected("server", ["server/src/server.ts"]))
        self.assertFalse(module.affected("server", ["tests/test_ci.py"]))
        self.assertTrue(module.affected("tests", ["SPEC.md"]))
        self.assertTrue(module.affected("tests", ["docs/adr/0006-deployment-target.md"]))
        self.assertFalse(module.affected("tests", ["server/src/server.ts"]))
        self.assertTrue(module.affected("guidance", [".github/scripts/agent_forms.py"]))
        self.assertFalse(module.affected("guidance", ["server/package.json"]))
        self.assertFalse(module.affected("server", []))


def _if_before_run(text: str, command: str) -> str:
    lines = text.splitlines()
    target = f"run: {command}"
    index = next(i for i, line in enumerate(lines) if line.strip() in (target, f"- {target}"))
    found = ""
    for line in reversed(lines[:index]):
        stripped = line.strip()
        if stripped.endswith(":") and line.startswith("  ") and not line.startswith("    "):
            break
        if stripped.startswith("if:"):
            found = stripped
            break
    return found


if __name__ == "__main__":
    unittest.main()
