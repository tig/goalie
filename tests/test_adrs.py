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

    def test_server_language_is_typescript_and_hono(self) -> None:
        decision = _decision("0001-language-and-runtime.md")
        self.assertIn("TypeScript", decision)
        self.assertIn("Hono", decision)
        self.assertIn("Node.js 24", decision)
        self.assertNotIn("Starlette", decision)
        self.assertNotIn("uvicorn", decision)

    def test_store_uses_node_sqlite(self) -> None:
        decision = _decision("0002-storage.md")
        self.assertIn("node:sqlite", decision)
        self.assertNotIn("sqlite3", decision)

    def test_auth_federates_with_entra(self) -> None:
        decision = _decision("0005-auth-and-identity.md")
        self.assertIn("Entra", decision)
        self.assertIn("oauth2-proxy", decision)
        self.assertIn("8136e28b-aee3-4d34-ab49-c0da1a468e3a", decision)
        self.assertNotIn("Argon2id", decision)
        self.assertNotIn("must not add an external identity provider", decision)

    def test_markdown_crdt_is_yjs_on_the_server(self) -> None:
        decision = _decision("0008-concurrent-markdown.md")
        self.assertIn("`yjs`", decision)
        self.assertNotIn("pycrdt", decision)
        self.assertNotIn("json-joy", decision)


def _decision(name: str) -> str:
    text = (ADR / name).read_text(encoding="utf-8")
    return text.split("## Decision", 1)[1].split("\n## ", 1)[0]


if __name__ == "__main__":
    unittest.main()
