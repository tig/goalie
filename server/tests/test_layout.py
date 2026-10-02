"""The server folder is the server component."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]


class ServerLayoutTests(unittest.TestCase):
    def test_server_defines_create_app_and_listen(self) -> None:
        server = SERVER / "src" / "server.ts"
        self.assertTrue(server.is_file())
        text = server.read_text(encoding="utf-8")
        self.assertIn("function createApp", text)
        self.assertIn("function listen", text)

    def test_server_tests_sit_with_the_server(self) -> None:
        tests = SERVER / "tests"
        self.assertTrue(tests.is_dir())
        self.assertTrue(any(tests.glob("test_*.py")))
        self.assertEqual(list(SERVER.glob("test_*.py")), [])

    def test_package_json_targets_node_24_and_npm_scripts(self) -> None:
        package = json.loads((SERVER / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package["engines"]["node"], ">=24")
        scripts = package["scripts"]
        self.assertEqual(scripts["lint"], "eslint src")
        self.assertEqual(scripts["typecheck"], "tsc --noEmit")


if __name__ == "__main__":
    unittest.main()
