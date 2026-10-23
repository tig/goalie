"""The server serves the built React app from GOALIE_WEB_DIST, only to a verified actor (ADR 0005, ADR 0010)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from goalie_cli import Store, create
from live_server import get, running_server, signed

INDEX = b"<!doctype html><title>Goalie</title><div id=root></div><!-- stub build -->"
SCRIPT = b"console.log('stub');"


class AppServingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        assert cls.store.write("tig", create("actor", "tig", {"kind": "human", "display_name": "Tig", "subject": "sub-tig"}))["ok"]
        cls.scratch = tempfile.TemporaryDirectory()
        dist = Path(cls.scratch.name) / "dist"
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_bytes(INDEX)
        (dist / "assets" / "app.js").write_bytes(SCRIPT)
        (Path(cls.scratch.name) / "secret.txt").write_text("outside the build")
        token, env = signed("sub-tig")
        auth = {"Authorization": f"Bearer {token}"}
        with running_server(cls.store.path, {**env, "GOALIE_WEB_DIST": str(dist)}) as (proc, port):
            cls.home = get(proc, port, "/", auth)
            cls.deep = get(proc, port, "/goals/XW-0001", auth)
            cls.script = get(proc, port, "/assets/app.js", auth)
            cls.missing_asset = get(proc, port, "/assets/nope.js", auth)
            cls.escape = get(proc, port, "/assets/..%2f..%2fsecret.txt", auth)
            cls.unknown_api = get(proc, port, "/api/nope", auth)
            cls.anonymous_home = get(proc, port, "/")
            cls.anonymous_script = get(proc, port, "/assets/app.js")
            cls.health = get(proc, port, "/health")
        with running_server(cls.store.path, {**env, "GOALIE_WEB_DIST": str(Path(cls.scratch.name) / "no-build")}) as (proc, port):
            cls.no_build = get(proc, port, "/", auth)
            cls.no_build_health = get(proc, port, "/health")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.scratch.cleanup()
        cls.store.close()

    def test_home_is_the_built_index(self) -> None:
        self.assertEqual(self.home.status, 200)
        self.assertTrue(self.home.content_type.startswith("text/html"), self.home.content_type)
        self.assertEqual(self.home.body, INDEX)

    def test_any_page_path_is_the_built_index(self) -> None:
        self.assertEqual(self.deep.status, 200)
        self.assertEqual(self.deep.body, INDEX)

    def test_assets_are_the_built_files(self) -> None:
        self.assertEqual(self.script.status, 200)
        self.assertIn("javascript", self.script.content_type)
        self.assertEqual(self.script.body, SCRIPT)

    def test_a_missing_asset_is_404(self) -> None:
        self.assertEqual(self.missing_asset.status, 404)

    def test_an_asset_path_must_not_leave_the_build(self) -> None:
        self.assertEqual(self.escape.status, 404)
        self.assertNotIn(b"outside the build", self.escape.body)

    def test_an_unknown_api_path_is_404_json(self) -> None:
        self.assertEqual(self.unknown_api.status, 404)
        self.assertEqual(set(json.loads(self.unknown_api.body)), {"error", "reason"})

    def test_without_a_verified_actor_the_page_is_the_sign_in_page(self) -> None:
        self.assertEqual(self.anonymous_home.status, 401)
        self.assertIn(b"Sign in to Goalie", self.anonymous_home.body)
        self.assertNotIn(b"stub build", self.anonymous_home.body)

    def test_without_a_verified_actor_assets_are_refused(self) -> None:
        self.assertEqual(self.anonymous_script.status, 401)
        self.assertNotEqual(self.anonymous_script.body, SCRIPT)

    def test_health_needs_no_actor(self) -> None:
        self.assertEqual(self.health.status, 200)
        self.assertEqual(self.no_build_health.status, 200)

    def test_a_missing_build_is_503_with_a_plain_message(self) -> None:
        self.assertEqual(self.no_build.status, 503)
        self.assertTrue(self.no_build.content_type.startswith("text/plain"), self.no_build.content_type)
        self.assertIn(b"npm run build --prefix server", self.no_build.body)


if __name__ == "__main__":
    unittest.main()
