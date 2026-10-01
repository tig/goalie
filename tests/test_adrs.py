"""The Stage 0.1 records exist, and each one states a decision."""

from __future__ import annotations

import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ADR = REPO / "docs" / "adr"

REQUIRED = (
    "0001-language-and-runtime.md",
    "0002-storage.md",
    "0003-api-style.md",
    "0004-mcp-hosting.md",
    "0005-auth-and-identity.md",
    "0006-deployment-target.md",
    "0007-live-update.md",
    "0008-concurrent-markdown.md",
    "0009-presence.md",
    "0010-app-shape.md",
    "0011-owner-and-user-settings.md",
)


class AdrTests(unittest.TestCase):
    def test_each_record_states_a_decision(self) -> None:
        readme = (ADR / "README.md").read_text(encoding="utf-8")
        for name in REQUIRED:
            text = (ADR / name).read_text(encoding="utf-8")
            self.assertIn(name, readme)
            parts = text.split("## Decision", 1)
            self.assertEqual(len(parts), 2, name)
            body = parts[1].split("\n## ", 1)[0].strip()
            self.assertTrue(body, name)
            lowered = body.lower()
            self.assertNotIn("tbd", lowered, name)
            self.assertNotIn("to be decided", lowered, name)
            self.assertNotIn("does not pick", lowered, name)


if __name__ == "__main__":
    unittest.main()
