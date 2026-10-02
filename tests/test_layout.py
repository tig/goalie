"""A new seat can find code, tests, and architecture decision records."""

from __future__ import annotations

import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

COMMANDS = (
    "npm ci --prefix server",
    "npm run lint --prefix server",
    "npm run typecheck --prefix server",
    "python -m unittest discover -s server/tests -v",
    "python -m unittest discover -s tests -v",
    "python -m unittest discover -s guidance/tests -v",
    "python .github/scripts/agent_forms.py check",
)

SPEC_SYNC = (
    "A behavior change and the SPEC.md change must land in the same pull request."
)

# Root tests/ is shared tests and shared test infrastructure.
SHARED_TESTS = (
    "test_adrs.py",
    "test_ci.py",
    "test_conformance.py",
    "test_layout.py",
    "test_spec_collaboration.py",
    "test_spec_human_session.py",
)


class LayoutTests(unittest.TestCase):
    def test_contributing_names_commands_places_and_spec_sync(self) -> None:
        text = (REPO / "CONTRIBUTING.md").read_text(encoding="utf-8")
        for command in COMMANDS:
            self.assertIn(command, text)
        self.assertIn("server/", text)
        self.assertIn("tests/", text)
        self.assertIn("guidance/", text)
        self.assertIn("docs/adr/", text)
        self.assertIn(SPEC_SYNC, text)

    def test_root_tests_are_shared_or_infrastructure(self) -> None:
        names = sorted(path.name for path in (REPO / "tests").glob("test_*.py"))
        self.assertEqual(names, sorted(SHARED_TESTS))
        guidance = REPO / "guidance" / "tests"
        self.assertTrue(guidance.is_dir())
        self.assertTrue(any(guidance.glob("test_*.py")))

    def test_language_and_runtime_record_exists(self) -> None:
        path = REPO / "docs" / "adr" / "0001-language-and-runtime.md"
        self.assertTrue(path.is_file())

    def test_claude_md_does_not_exist(self) -> None:
        self.assertFalse((REPO / "CLAUDE.md").exists())


if __name__ == "__main__":
    unittest.main()
