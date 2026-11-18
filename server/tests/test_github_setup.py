"""Create GitHub App sets GitHub up with no pasted key (issue #109).

The GOALIE owner presses Create GitHub App. GOALIE answers a manifest and the GitHub address to post it to.
GitHub creates the App and sends the browser back to /github/created with a one-time code and the state GOALIE
gave. GOALIE trades the code for the app id, the private key, and the webhook secret, stores them, and sends the
browser to the App's install page. GitHub sends the browser back to /github/installed with the installation id.
GOALIE stores it only when GitHub says that installation belongs to the App. A signed notice uses the stored
webhook secret. Only the GOALIE owner can do any of this. A state that is wrong, used, or older than an hour
stores nothing.

Prediction before the implementation: every test here fails. There is no setup route, /github/created and
/github/installed are the web app, and the notice reads its secret only from GOALIE_GITHUB_WEBHOOK_SECRET.
"""

from __future__ import annotations

import hashlib
import hmac
import http.client
import json
import sqlite3
import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

from goalie_cli import update
from live_server import Reply, get, post, running_server, signed_many
from test_github_push import PushTests, private_key, set_scope

ORIGIN = "http://localhost:4000"
PUBLIC = "https://goalie.example.test"
WEB = "https://github.example.test"
SECRET = "whsec-from-github"


@contextmanager
def no_env_app(env: dict[str, str]) -> Iterator[dict[str, str]]:
    """The process names nothing about the App, so only the stored values count."""
    yield {**env, "GOALIE_GITHUB_APP_ID": "", "GOALIE_GITHUB_INSTALLATION_ID": "", "GOALIE_GITHUB_PRIVATE_KEY_FILE": "", "GOALIE_PUBLIC_URL": "", "GOALIE_GITHUB_WEBHOOK_SECRET": "", "GOALIE_GITHUB_WEB": WEB}


def raw_get(port: int, path: str, headers: dict[str, str]) -> tuple[int, str]:
    """GET without following a redirect. The answer is the status and the Location header."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request("GET", path, headers=headers)
        reply = conn.getresponse()
        reply.read()
        return reply.status, reply.getheader("Location") or ""
    finally:
        conn.close()


class GitHubSetupTests(unittest.TestCase, PushTests):
    @classmethod
    def setUpClass(cls) -> None:
        cls.start()
        for actor, subject in (("tig", "sub-tig"), ("chelsea", "sub-chelsea")):
            row = cls.store.read("actor", actor)
            if row.get("subject") != subject:
                wrote = cls.store.write("tig", update("actor", actor, row["version"], {"subject": subject}))
                assert wrote["ok"], wrote
        cls.key = private_key()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stop()

    def setUp(self) -> None:
        self.github.calls.clear()
        self.github.conversions = {}
        self.github.installations = {}
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        db = sqlite3.connect(self.store.path)
        try:
            for table in ("github_config", "github_setup"):
                try:
                    db.execute(f"DELETE FROM {table}")
                except sqlite3.OperationalError:
                    pass
            db.commit()
        finally:
            db.close()

    @contextmanager
    def server(self) -> Iterator[tuple[Any, int, dict[str, str], dict[str, str]]]:
        tokens, issuers = signed_many("sub-tig", "sub-chelsea")
        with no_env_app(self.env) as env, running_server(self.store.path, {**env, **issuers}) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            self.github.calls.clear()
            yield proc, port, {"Authorization": f"Bearer {tokens['sub-tig']}"}, {"Authorization": f"Bearer {tokens['sub-chelsea']}"}

    def start_setup(self, proc: Any, port: int, headers: dict[str, str], body: dict[str, str] | None = None) -> Reply:
        return post(proc, port, "/api/github/setup", body if body is not None else {"org": "", "publicUrl": PUBLIC}, {**headers, "Origin": ORIGIN, "Host": "localhost:4000"})

    def config(self) -> dict[str, Any] | None:
        db = sqlite3.connect(self.store.path)
        db.row_factory = sqlite3.Row
        try:
            row = db.execute("SELECT * FROM github_config WHERE id = 'config'").fetchone()
            return None if row is None else dict(row)
        finally:
            db.close()

    def app_answer(self) -> dict[str, Any]:
        return {"id": 4242, "slug": "goalie-example", "pem": self.key, "webhook_secret": SECRET, "client_id": "Iv1.abc", "client_secret": "shh", "html_url": f"{WEB}/apps/goalie-example"}

    def created(self, port: int, headers: dict[str, str], state: str, code: str = "code-1") -> tuple[int, str]:
        return raw_get(port, "/github/created?" + urlencode({"code": code, "state": state}), headers)

    def test_the_owner_gets_a_manifest_for_their_account(self) -> None:
        with self.server() as (proc, port, tig, _chelsea):
            reply = self.start_setup(proc, port, tig)
        self.assertEqual(reply.status, 200, reply.body)
        answer = json.loads(reply.body)
        action = urlparse(answer["action"])
        self.assertEqual(f"{action.scheme}://{action.netloc}{action.path}", f"{WEB}/settings/apps/new")
        self.assertEqual(len(parse_qs(action.query)["state"][0]), 48)
        manifest = json.loads(answer["manifest"])
        self.assertEqual(manifest["url"], PUBLIC)
        self.assertEqual(manifest["hook_attributes"], {"url": f"{PUBLIC}/api/github/webhook", "active": True})
        self.assertEqual(manifest["redirect_url"], f"{ORIGIN}/github/created")
        self.assertEqual(manifest["setup_url"], f"{ORIGIN}/github/installed")
        self.assertEqual(manifest["default_permissions"], {"issues": "write", "pull_requests": "read", "metadata": "read"})
        self.assertEqual(manifest["default_events"], ["issues", "pull_request"])
        self.assertFalse(manifest["public"])
        self.assertLessEqual(len(manifest["name"]), 34)

    def test_an_organization_gets_its_own_address(self) -> None:
        with self.server() as (proc, port, tig, _chelsea):
            reply = self.start_setup(proc, port, tig, {"org": "excaliwire", "publicUrl": PUBLIC})
            bad = self.start_setup(proc, port, tig, {"org": "no spaces/here", "publicUrl": PUBLIC})
            no_url = self.start_setup(proc, port, tig, {"org": "", "publicUrl": "ftp://nope"})
        self.assertTrue(json.loads(reply.body)["action"].startswith(f"{WEB}/organizations/excaliwire/settings/apps/new?state="), reply.body)
        self.assertEqual(bad.status, 400, bad.body)
        self.assertEqual(no_url.status, 400, no_url.body)

    def test_a_public_url_github_cannot_reach_is_refused_here(self) -> None:
        """GitHub refuses a localhost notice address on its own page. GOALIE says so first, and stores no state."""
        hosts = ["http://localhost:4000", "http://127.0.0.1:3100", "http://goalie.localhost", "http://10.0.0.5", "http://192.168.1.9", "http://172.20.0.1", "http://[::1]:3100"]
        with self.server() as (proc, port, tig, _chelsea):
            replies = [self.start_setup(proc, port, tig, {"org": "", "publicUrl": url}) for url in hosts]
            public = self.start_setup(proc, port, tig, {"org": "", "publicUrl": "https://abc.ngrok-free.app"})
        for url, reply in zip(hosts, replies):
            self.assertEqual(reply.status, 400, (url, reply.body))
            self.assertIn("GitHub cannot reach", json.loads(reply.body)["reason"], url)
        self.assertEqual(public.status, 200, public.body)

    def test_only_the_goalie_owner_can_set_up(self) -> None:
        with self.server() as (proc, port, _tig, chelsea):
            started = self.start_setup(proc, port, chelsea)
            back = self.created(port, chelsea, "anything")
            installed = raw_get(port, "/github/installed?installation_id=9", chelsea)
        self.assertEqual(started.status, 403, started.body)
        self.assertEqual(back[0], 403)
        self.assertEqual(installed[0], 403)
        self.assertIsNone(self.config())
        self.assertEqual(self.github.calls, [])

    def test_the_code_is_traded_and_the_app_is_stored(self) -> None:
        self.github.conversions["code-1"] = self.app_answer()
        with self.server() as (proc, port, tig, _chelsea):
            state = parse_qs(urlparse(json.loads(self.start_setup(proc, port, tig).body)["action"]).query)["state"][0]
            status, location = self.created(port, tig, state)
            again = self.created(port, tig, state)
            view = json.loads(get(proc, port, "/api/github/status", tig).body)
        self.assertEqual((status, location), (302, f"{WEB}/apps/goalie-example/installations/new"))
        self.assertEqual(self.github.calls.count("POST /app-manifests/code-1/conversions"), 1, self.github.calls)
        stored = self.config()
        assert stored is not None
        self.assertEqual((stored["app_id"], stored["public_url"], stored["webhook_secret"], stored["app_slug"]), ("4242", PUBLIC, SECRET, "goalie-example"))
        self.assertEqual(stored["private_key"], self.key)
        self.assertEqual((stored["client_id"], stored["client_secret"]), ("Iv1.abc", "shh"))
        self.assertIsNone(stored["installation_id"])
        self.assertEqual(again[0], 302)
        self.assertEqual(again[1], "/github")
        self.assertEqual(view["installUrl"], f"{WEB}/apps/goalie-example/installations/new")
        self.assertEqual(view["appSlug"], "goalie-example")
        self.assertTrue(view["webhookSecretSet"])
        self.assertNotIn(SECRET, json.dumps(view))
        self.assertNotIn("shh", json.dumps(view))
        self.assertIn("used", view["setupError"])

    def test_a_wrong_state_stores_nothing(self) -> None:
        self.github.conversions["code-1"] = self.app_answer()
        with self.server() as (proc, port, tig, _chelsea):
            self.start_setup(proc, port, tig)
            status, location = self.created(port, tig, "f" * 48)
        self.assertEqual((status, location), (302, "/github"))
        self.assertIsNone(self.config())
        self.assertNotIn("POST /app-manifests/code-1/conversions", self.github.calls)

    def test_a_state_older_than_an_hour_stores_nothing(self) -> None:
        self.github.conversions["code-1"] = self.app_answer()
        with self.server() as (proc, port, tig, _chelsea):
            state = parse_qs(urlparse(json.loads(self.start_setup(proc, port, tig).body)["action"]).query)["state"][0]
            db = sqlite3.connect(self.store.path)
            db.execute("UPDATE github_setup SET until = until - 3600001")
            db.commit()
            db.close()
            self.created(port, tig, state)
        self.assertIsNone(self.config())

    def test_a_failed_trade_says_why(self) -> None:
        with self.server() as (proc, port, tig, _chelsea):
            state = parse_qs(urlparse(json.loads(self.start_setup(proc, port, tig).body)["action"]).query)["state"][0]
            status, location = self.created(port, tig, state, code="gone")
            view = json.loads(get(proc, port, "/api/github/status", tig).body)
        self.assertEqual((status, location), (302, "/github"))
        self.assertIsNone(self.config())
        self.assertIn("404", view["setupError"])

    def install(self, installation: str, belongs: bool) -> tuple[tuple[int, str], dict[str, Any] | None]:
        self.github.conversions["code-1"] = self.app_answer()
        if belongs:
            self.github.installations[installation] = {"id": int(installation), "app_id": 4242}
        with self.server() as (proc, port, tig, _chelsea):
            state = parse_qs(urlparse(json.loads(self.start_setup(proc, port, tig).body)["action"]).query)["state"][0]
            self.created(port, tig, state)
            back = raw_get(port, "/github/installed?" + urlencode({"installation_id": installation, "setup_action": "install"}), tig)
        return back, self.config()

    def test_an_installation_github_confirms_is_stored(self) -> None:
        back, stored = self.install("555", belongs=True)
        self.assertEqual(back, (302, "/github"))
        assert stored is not None
        self.assertEqual(stored["installation_id"], "555")
        self.assertIn("GET /app/installations/555", self.github.calls)

    def test_an_installation_github_does_not_confirm_is_not_stored(self) -> None:
        back, stored = self.install("556", belongs=False)
        self.assertEqual(back, (302, "/github"))
        assert stored is not None
        self.assertIsNone(stored["installation_id"])

    def test_a_notice_signed_with_the_stored_secret_is_taken(self) -> None:
        self.github.conversions["code-1"] = self.app_answer()
        body = json.dumps({"action": "edited", "repository": {"full_name": "tig/goalie"}, "issue": {"number": 301, "title": "Signed with the stored secret", "state": "open", "updated_at": "2026-11-18T10:00:00Z"}}).encode()
        good = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        with self.server() as (proc, port, tig, _chelsea):
            state = parse_qs(urlparse(json.loads(self.start_setup(proc, port, tig).body)["action"]).query)["state"][0]
            self.created(port, tig, state)
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": good})
        self.assertEqual(reply.status, 200, reply.body)
        db = sqlite3.connect(self.store.path)
        try:
            self.assertIsNotNone(db.execute("SELECT 1 FROM github_ref WHERE number = 301").fetchone())
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
