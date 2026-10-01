"""A new seat can find code, tests, and architecture decision records."""

from __future__ import annotations

import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

COMMANDS = (
    "npm ci --prefix server",
    "npm run lint --prefix server",
    "npm run typecheck --prefix server",
    "python -m unittest server/test_layout.py",
    "python -m unittest discover -s tests -v",
    "python -m unittest tests/test_agent_forms.py",
    "python .github/scripts/agent_forms.py check",
)

SPEC_SYNC = (
    "A behavior change and the SPEC.md change must land in the same pull request."
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

    def test_language_and_runtime_record_exists(self) -> None:
        path = REPO / "docs" / "adr" / "0001-language-and-runtime.md"
        self.assertTrue(path.is_file())

    def test_claude_md_does_not_exist(self) -> None:
        self.assertFalse((REPO / "CLAUDE.md").exists())


if __name__ == "__main__":
    unittest.main()
