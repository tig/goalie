"""docs/layout.md tells a seat where code, tests, and ADRs go."""

from __future__ import annotations

import unittest
from pathlib import Path

LAYOUT = Path(__file__).resolve().parents[1] / "docs" / "layout.md"


class Layout(unittest.TestCase):
    def test_names_places_and_refuses_a_second_agent_guide(self) -> None:
        self.assertTrue(LAYOUT.is_file())
        text = LAYOUT.read_text(encoding="utf-8")
        for needle in (
            "goalie/",
            "docs/adr/",
            "tests/conformance/",
            "SPEC.md",
            "goalie/health.py",
            "AGENTS.md",
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, text)
        self.assertTrue("no CLAUDE.md" in text or "Do not add CLAUDE.md" in text)
