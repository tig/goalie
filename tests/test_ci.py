"""CI matches the folder, and one component must not run another's CI."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORKFLOWS = REPO / ".github" / "workflows"

# Paths outside the component folder are inputs. The workflow file lists them.
COMPONENTS = {
    "server": [
        "server/**",
        ".github/workflows/server.yml",
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
    ],
    "guidance": [
        "guidance/**",
        "AGENTS.md",
        "tests/test_agent_forms.py",
        ".github/scripts/agent_forms.py",
        ".github/workflows/guidance.yml",
    ],
}

RUNS = {
    "server": [
        "npm ci --prefix server",
        "npm run lint --prefix server",
        "npm run typecheck --prefix server",
        "python -m unittest server/test_layout.py",
    ],
    "tests": [
        "python -m unittest discover -s tests -v",
    ],
    "guidance": [
        "python -m unittest tests/test_agent_forms.py",
        "python .github/scripts/agent_forms.py check",
    ],
}

TENET = "A change in one component must not run another component's CI."


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
        for name, expected in COMPONENTS.items():
            text = (WORKFLOWS / f"{name}.yml").read_text(encoding="utf-8")
            self.assertIn(f"name: {name}\n", text)
            events = _paths(text)
            self.assertEqual(events["pull_request"], expected, name)
            self.assertEqual(events["push"], expected, name)
            for path in expected:
                if path.endswith("/**"):
                    self.assertTrue((REPO / path[:-3]).is_dir(), path)

    def test_a_component_does_not_list_another_components_folder(self) -> None:
        server = set(COMPONENTS["server"])
        tests = set(COMPONENTS["tests"])
        guidance = set(COMPONENTS["guidance"])
        self.assertFalse(any(path.startswith("tests/") or path.startswith("guidance/") for path in server))
        self.assertFalse(any(path.startswith("server/") or path.startswith("guidance/") for path in tests))
        self.assertFalse(any(path.startswith("server/") for path in guidance))
        self.assertIn("tests/test_agent_forms.py", guidance)
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
        for commands in RUNS.values():
            for command in commands:
                self.assertIn(f"`{command}`", contributing)


if __name__ == "__main__":
    unittest.main()
