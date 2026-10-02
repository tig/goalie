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
        ".github/scripts/deploy_server.sh",
    ],
    "tests": [
        "tests/**",
        "SPEC.md",
        "USERS_MANUAL.md",
        "CONTRIBUTING.md",
        ".github/workflows/server.yml",
        ".github/workflows/tests.yml",
        ".github/workflows/guidance.yml",
        ".github/scripts/ci_affected.py",
        ".github/scripts/deploy_server.sh",
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
DOCS = "A change only under `docs/` is not code. It runs no CI commands and needs no test first."
AFFECTED = "needs.changes.outputs.affected == 'true'"
# A skipped required job reports success. Run the check when detection fails.
DETECTOR = "always() && (needs.changes.result != 'success' || needs.changes.outputs.affected == 'true')"
REQUIRED_DETECTORS = {"server": 3, "tests": 1, "guidance": 1}


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
            self.assertIn("git diff --name-only --no-renames ", text)
            self.assertEqual(text.count(f"if: {DETECTOR}\n"), REQUIRED_DETECTORS[name])
            self.assertEqual(text.count("run: exit 1\n"), REQUIRED_DETECTORS[name])
            self.assertIn("if: needs.changes.result != 'success'\n", text)
            for path in expected:
                if path.endswith("/**"):
                    self.assertTrue((REPO / path[:-3]).is_dir(), path)
            for command in RUNS[name]:
                gate = _if_before_run(text, command)
                self.assertIn(AFFECTED, gate, command)
                if command != "python .github/scripts/agent_forms.py check":
                    self.assertIn(DETECTOR, gate, command)

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
        self.assertIn(DOCS, contributing)
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
        for component in COMPONENTS:
            self.assertFalse(module.affected(component, ["docs/adr/0006-deployment-target.md"]), component)
        self.assertFalse(module.affected("tests", ["server/src/server.ts"]))
        self.assertTrue(module.affected("guidance", [".github/scripts/agent_forms.py"]))
        self.assertFalse(module.affected("guidance", ["server/package.json"]))
        self.assertFalse(module.affected("server", []))
        self.assertTrue(module.affected("server", [".github/scripts/deploy_server.sh"]))
        self.assertTrue(module.affected("tests", [".github/scripts/deploy_server.sh"]))
        self.assertFalse(module.affected("guidance", [".github/scripts/deploy_server.sh"]))

    def test_the_publish_names_no_host(self) -> None:
        server = (WORKFLOWS / "server.yml").read_text(encoding="utf-8")
        script_path = REPO / ".github" / "scripts" / "deploy_server.sh"
        self.assertTrue(script_path.is_file())
        script = script_path.read_text(encoding="utf-8")
        installer = "/usr/local/sbin/excaliwire-goalie-install"
        self.assertIn(installer, server)
        self.assertIn(installer, script)
        for text in (server, script):
            self.assertNotIn("goalie.excaliwire.com", text)
            self.assertNotIn("129.212.164.158", text)
        deploy = server.split("\n  deploy:", 1)[1]
        header = deploy.split("\n    steps:", 1)[0]
        self.assertIn(AFFECTED, header)
        self.assertNotIn("always()", header)
        self.assertIn("github.ref == 'refs/heads/main'", header)
        self.assertIn("github.event_name == 'push'", header)
        self.assertIn("github.event_name == 'workflow_dispatch'", header)
        self.assertNotIn("pull_request", header)
        changes = server.split("\n  lint:", 1)[0]
        self.assertLess(changes.index('= "workflow_dispatch"'), changes.index('= "pull_request"'))
        contributing = (REPO / "CONTRIBUTING.md").read_text(encoding="utf-8")
        self.assertIn("Host configuration lives in excaliwire/operations.", contributing)
        self.assertNotIn("goalie.excaliwire.com", contributing)
        self.assertNotIn("129.212.164.158", contributing)

    def test_required_checks_have_unique_names(self) -> None:
        # The ruleset on main requires these contexts. The job name is the check name.
        expected = {
            "server": ["server / lint", "server / typecheck", "server / test"],
            "tests": ["tests / test"],
            "guidance": ["guidance / test"],
        }
        for workflow, names in expected.items():
            text = (WORKFLOWS / f"{workflow}.yml").read_text(encoding="utf-8")
            for name in names:
                self.assertIn(f"name: {name}\n", text, workflow)


def _if_before_run(text: str, command: str) -> str:
    """The job-level if for the first step that runs command. Step ifs are deeper."""
    lines = text.splitlines()
    target = f"run: {command}"
    index = next(i for i, line in enumerate(lines) if line.strip() in (target, f"- {target}"))
    found = ""
    for line in reversed(lines[:index]):
        if re.match(r"^    if:", line):
            found = line.strip()
            break
        if line.startswith("  ") and not line.startswith("    ") and line.strip().endswith(":"):
            break
    return found


if __name__ == "__main__":
    unittest.main()
