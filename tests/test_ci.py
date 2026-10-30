"""CI matches the folder, and one component must not run another's CI."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import textwrap
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
        "docs/specs/SPEC.md",
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
        "npm run build --prefix server",
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
RULES = [
    "main is the release branch.",
    "develop is the in-development branch and the primary branch.",
    "A pull request for in-development work targets develop.",
    "A release is a pull request from develop into main.",
    "develop runs the same workflows and does not require them to merge.",
    "The server publishes on a push to develop, or when an operator dispatches the server workflow on a branch.",
    "Test-first does not apply to documentation or to configuration.",
    "README.md and docs/ are pure docs, except docs/specs/SPEC.md.",
    "They run no CI commands and need no test.",
    "docs/specs/SPEC.md and USERS_MANUAL.md stay inputs of the shared tests.",
    "A seat must pick up only an issue or a pull request assigned to the GitHub user named by harness-gh-user.",
    "harness-gh-user is config outside this repo.",
    "When harness-gh-user is empty, a seat must pick up nothing.",
]
AFFECTED = "needs.changes.outputs.affected == 'true'"
# A skipped required job reports success. Run the check when detection fails.
DETECTOR = "always() && (needs.changes.result != 'success' || needs.changes.outputs.affected == 'true')"
REQUIRED_DETECTORS = {"server": 3, "tests": 1, "guidance": 1}
DEPLOY = "needs.changes.outputs.affected == 'true' && ((github.event_name == 'push' && github.ref == 'refs/heads/develop') || github.event_name == 'workflow_dispatch')"


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
            self.assertIn("branches: [main, develop]\n", text)
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
        guides = [
            REPO / "CONTRIBUTING.md",
            REPO / "AGENTS.md",
            REPO / "guidance" / "agents.md",
        ]
        contributing = guides[0].read_text(encoding="utf-8")
        self.assertIn(REPORTS, contributing)
        self.assertIn(COMMANDS_WHEN, contributing)
        for guide in guides:
            text = guide.read_text(encoding="utf-8")
            self.assertIn(TENET, text, guide.name)
            for rule in RULES:
                self.assertIn(rule, text, guide.name)
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
        self.assertTrue(module.affected("tests", ["docs/specs/SPEC.md"]))
        self.assertFalse(module.affected("tests", ["SPEC.md"]))
        self.assertFalse(module.affected("server", ["docs/specs/SPEC.md"]))
        self.assertFalse(module.affected("guidance", ["docs/specs/SPEC.md"]))
        docs_patterns = [
            pattern
            for patterns in COMPONENTS.values()
            for pattern in patterns
            if pattern.startswith("docs/")
        ]
        self.assertEqual(docs_patterns, ["docs/specs/SPEC.md"])
        for component, patterns in COMPONENTS.items():
            self.assertFalse(
                any(
                    pattern == "README.md" or (pattern.startswith("docs/") and pattern != "docs/specs/SPEC.md")
                    for pattern in patterns
                )
            )
            for path in (
                "README.md",
                "docs/adr/0006-deployment-target.md",
                "docs/testing.md",
                "docs/specs/README.md",
            ):
                self.assertFalse(module.affected(component, [path]), f"{component} {path}")
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
        # Every merged pull request publishes: a push publishes only from develop. main does not publish, so an older main cannot overwrite a newer develop.
        # An operator's dispatch publishes the branch it names. A pull request never publishes.
        self.assertIn(f"    if: {DEPLOY}\n", header)
        # Two installs never overlap.
        self.assertIn("\n    concurrency:\n      group: goalie-deploy\n      cancel-in-progress: false\n", header)
        # The job group does not keep push order: a deploy queues when its tests finish. TipStep pins what the tip step decides.
        steps = deploy.split("\n    steps:", 1)[1]
        self.assertIn("\n        id: tip\n", steps)
        tip = steps.index("\n        id: tip\n")
        publish = steps.index("\n      - name: Publish\n")
        self.assertLess(steps.index("run: npm ci --omit=dev"), tip)
        self.assertLess(tip, publish)
        check = steps[tip:publish]
        self.assertIn('if [ "$EVENT" = "push" ]; then', check)
        self.assertIn("EVENT: ${{ github.event_name }}\n", check)
        self.assertIn("SHA: ${{ github.sha }}\n", check)
        self.assertIn("\n        if: steps.tip.outputs.publish == 'true'\n", steps[publish:])
        self.assertNotIn("pull_request", header)
        changes = server.split("\n  lint:", 1)[0]
        self.assertLess(changes.index('= "workflow_dispatch"'), changes.index('= "pull_request"'))
        contributing = (REPO / "CONTRIBUTING.md").read_text(encoding="utf-8")
        self.assertIn("Host configuration lives in excaliwire/operations.", contributing)
        self.assertNotIn("goalie.excaliwire.com", contributing)
        self.assertNotIn("129.212.164.158", contributing)
        # Review E8: a deployment's identity tenant lives with its host configuration.
        self.assertNotIn("login.microsoftonline.com/", contributing)

    def test_the_publish_carries_the_built_web_app(self) -> None:
        # ADR 0010: the same Node process serves the built React app, so a publish without server/web/dist is refused.
        server = (WORKFLOWS / "server.yml").read_text(encoding="utf-8")
        test = server.split("\n  test:", 1)[1].split("\n  deploy:", 1)[0]
        self.assertLess(test.index("run: npm run build --prefix server\n"), test.index("run: python -m unittest discover -s server/tests -v\n"))
        deploy = server.split("\n  deploy:", 1)[1]
        self.assertLess(deploy.index("run: npm run build --prefix server\n"), deploy.index("run: npm ci --omit=dev"))
        self.assertLess(deploy.index("run: npm ci --omit=dev"), deploy.index("deploy_server.sh"))
        script = (REPO / ".github" / "scripts" / "deploy_server.sh").read_text(encoding="utf-8")
        self.assertIn("web/dist/index.html", script)
        self.assertIn('cp -a "$server/web/dist/." "$stage/web/dist/"', script)

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


def _tip_script() -> str:
    """The run block of the deploy job's tip step."""
    server = (WORKFLOWS / "server.yml").read_text(encoding="utf-8")
    step = server.split("\n        id: tip\n", 1)[1].split("\n      - name: Publish\n", 1)[0]
    block = step.split("        run: |\n", 1)[1]
    return textwrap.dedent(block)


@unittest.skipUnless(shutil.which("git") and shutil.which("bash") and shutil.which("python3"), "needs git, bash, and python3")
class TipStep(unittest.TestCase):
    """A push that is not the develop tip skips the publish only when the newer commits change server inputs."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.origin = root / "origin"
        self.work = root / "work"
        self.git(root, "init", "--quiet", "--initial-branch=develop", str(self.origin))
        scripts = self.origin / ".github" / "scripts"
        scripts.mkdir(parents=True)
        shutil.copy(REPO / ".github" / "scripts" / "ci_affected.py", scripts / "ci_affected.py")
        self.pushed = self.commit("server/src/server.ts")
        self.git(root, "clone", "--quiet", "--depth=1", "--branch=develop", self.origin.as_uri(), str(self.work))

    def git(self, cwd: Path, *args: str) -> str:
        command = ["git", "-c", "user.name=test", "-c", "user.email=test@example.com", *args]
        return subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()

    def commit(self, path: str) -> str:
        file = self.origin / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(f"{path} {file.read_text(encoding='utf-8') if file.exists() else ''}\n", encoding="utf-8")
        self.git(self.origin, "add", "--all")
        self.git(self.origin, "commit", "--quiet", "--message", path)
        return self.git(self.origin, "rev-parse", "HEAD")

    def decide(self, event: str = "push") -> str:
        output = Path(self.tmp.name) / "output"
        output.write_text("", encoding="utf-8")
        env = {**os.environ, "EVENT": event, "SHA": self.pushed, "GITHUB_OUTPUT": str(output)}
        subprocess.run(["bash", "-c", _tip_script()], cwd=self.work, env=env, capture_output=True, text=True, check=True)
        return output.read_text(encoding="utf-8").strip()

    def test_the_tip_publishes(self) -> None:
        self.assertEqual(self.decide(), "publish=true")

    def test_a_newer_tip_that_changes_server_inputs_skips(self) -> None:
        self.commit("docs/notes.md")
        self.commit("server/src/rules.ts")
        self.assertEqual(self.decide(), "publish=false")

    def test_a_newer_tip_that_changes_only_docs_publishes(self) -> None:
        self.commit("docs/notes.md")
        self.commit("README.md")
        self.assertEqual(self.decide(), "publish=true")

    def test_a_dispatch_publishes_whatever_the_tip(self) -> None:
        self.commit("server/src/rules.ts")
        self.assertEqual(self.decide("workflow_dispatch"), "publish=true")


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
