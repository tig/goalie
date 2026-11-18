"""GOALIE keeps what GitHub last said about each issue and pull request in scope (issue #109, part 1).

A signed `issues` or `pull_request` notice for a repository in github_repos fills the cache. A read of a
reference uses the cache when it is less than five minutes old, and reads GitHub otherwise. An older notice
does not replace a newer one. A push to an issue drops that issue from the cache. A reference says whether it
is an issue or a pull request, whether it is merged, and whether it is a draft. The cache is not an entity and
not an Event.

Prediction before the implementation: every test here fails. There is no github_ref table, a notice other than
a close is ignored, every read calls GitHub, and a reference answers only title and state.
"""

from __future__ import annotations

import json
import sqlite3
import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from urllib.parse import urlencode

from goalie_cli import create, update
from live_server import Reply, get, post, running_server, signed
from test_github_push import GOAL, ISSUE, REPO, PushTests, set_scope
from test_github_webhook import SECRET, sign

PULL_URL = f"https://github.com/{REPO}/pull/202"
EARLY = "2026-11-18T09:00:00Z"
LATE = "2026-11-18T10:00:00Z"


def issue_notice(number: int, title: str, *, updated: str = LATE, repo: str = REPO, state: str = "open", action: str = "edited") -> bytes:
    payload = {
        "action": action,
        "issue": {"number": number, "title": title, "state": state, "state_reason": None, "updated_at": updated, "html_url": "https://github.com/evil/nope/issues/5"},
        "repository": {"full_name": repo},
        "sender": {"login": "octocat"},
    }
    return json.dumps(payload, separators=(",", ":")).encode()


def pull_notice(number: int, title: str, *, merged: bool, draft: bool = False, state: str = "closed", updated: str = LATE) -> bytes:
    payload = {
        "action": "closed" if state == "closed" else "edited",
        "pull_request": {"number": number, "title": title, "state": state, "merged": merged, "draft": draft, "updated_at": updated},
        "repository": {"full_name": REPO},
        "sender": {"login": "octocat"},
    }
    return json.dumps(payload, separators=(",", ":")).encode()


class GitHubRefCacheTests(unittest.TestCase, PushTests):
    @classmethod
    def setUpClass(cls) -> None:
        cls.start()
        cls.env = {**cls.env, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET}
        row = cls.store.read("actor", "tig")
        if row.get("subject") != "sub-tig":
            wrote = cls.store.write("tig", update("actor", "tig", row["version"], {"subject": "sub-tig"}))
            assert wrote["ok"], wrote

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stop()

    def setUp(self) -> None:
        self.github.calls.clear()
        self.github.fail_issue_get = False
        self.github.issue = {"body": "Keep this.", "title": "Ship the gate", "state": "open", "state_reason": None, "labels": []}
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        db = sqlite3.connect(self.store.path)
        try:
            db.execute("DELETE FROM github_ref")
            db.commit()
        except sqlite3.OperationalError:
            pass
        finally:
            db.close()

    @contextmanager
    def server(self) -> Iterator[tuple[Any, int, dict[str, str]]]:
        token, issuers = signed("sub-tig")
        with running_server(self.store.path, {**self.env, **issuers}) as (proc, port):
            ready = get(proc, port, "/health")
            self.assertEqual(ready.status, 200, ready.body)
            self.github.calls.clear()
            yield proc, port, {"Authorization": f"Bearer {token}"}

    def ref(self, proc: Any, port: int, headers: dict[str, str], url: str) -> Reply:
        return get(proc, port, "/api/github/ref?" + urlencode({"goal": GOAL, "url": url}), headers)

    def deliver(self, proc: Any, port: int, body: bytes, event: str) -> Reply:
        return post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": event, "X-Hub-Signature-256": sign(SECRET, body)})

    def reads_of(self, number: int) -> list[str]:
        return [call for call in self.github.calls if call == f"GET /repos/{REPO}/issues/{number}"]

    def cached(self, repo: str, number: int) -> Any:
        db = sqlite3.connect(self.store.path)
        try:
            return db.execute("SELECT title FROM github_ref WHERE repo = ? AND number = ?", (repo.lower(), number)).fetchone()
        finally:
            db.close()

    def test_a_signed_issue_notice_fills_the_reference_without_a_read(self) -> None:
        url = f"https://github.com/{REPO}/issues/201"
        with self.server() as (proc, port, headers):
            delivered = self.deliver(proc, port, issue_notice(201, "From the notice"), "issues")
            self.assertEqual(delivered.status, 200, delivered.body)
            reply = self.ref(proc, port, headers, url)
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(json.loads(reply.body), {"title": "From the notice", "state": "open", "kind": "issue", "merged": False, "draft": False})
        self.assertEqual(self.reads_of(201), [])

    def test_a_merged_pull_request_notice_shows_merged(self) -> None:
        with self.server() as (proc, port, headers):
            delivered = self.deliver(proc, port, pull_notice(202, "Ship the cache", merged=True), "pull_request")
            self.assertEqual(delivered.status, 200, delivered.body)
            reply = self.ref(proc, port, headers, PULL_URL)
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(json.loads(reply.body), {"title": "Ship the cache", "state": "closed", "kind": "pull", "merged": True, "draft": False})
        self.assertEqual(self.reads_of(202), [])

    def test_a_draft_pull_request_notice_shows_draft(self) -> None:
        with self.server() as (proc, port, headers):
            self.deliver(proc, port, pull_notice(203, "Try the cache", merged=False, draft=True, state="open"), "pull_request")
            reply = self.ref(proc, port, headers, f"https://github.com/{REPO}/pull/203")
        self.assertEqual(json.loads(reply.body), {"title": "Try the cache", "state": "open", "kind": "pull", "merged": False, "draft": True})

    def test_an_older_notice_does_not_replace_a_newer_one(self) -> None:
        url = f"https://github.com/{REPO}/issues/204"
        with self.server() as (proc, port, headers):
            self.deliver(proc, port, issue_notice(204, "Newer", updated=LATE), "issues")
            late = self.deliver(proc, port, issue_notice(204, "Older", updated=EARLY), "issues")
            self.assertEqual(late.status, 200, late.body)
            reply = self.ref(proc, port, headers, url)
        self.assertEqual(json.loads(reply.body)["title"], "Newer")

    def test_a_notice_outside_github_repos_stores_nothing(self) -> None:
        with self.server() as (proc, port, _headers):
            delivered = self.deliver(proc, port, issue_notice(205, "Not ours", repo="excaliwire/factory"), "issues")
        self.assertEqual(delivered.status, 200, delivered.body)
        self.assertIsNone(self.cached("excaliwire/factory", 205))

    def test_an_unsigned_notice_stores_nothing(self) -> None:
        body = issue_notice(206, "Forged")
        with self.server() as (proc, port, _headers):
            refused = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": "sha256=00"})
        self.assertEqual(refused.status, 401, refused.body)
        self.assertIsNone(self.cached(REPO, 206))

    def test_a_second_read_uses_the_cache(self) -> None:
        with self.server() as (proc, port, headers):
            first = self.ref(proc, port, headers, ISSUE)
            second = self.ref(proc, port, headers, ISSUE)
        self.assertEqual(json.loads(first.body), {"title": "Ship the gate", "state": "open", "kind": "issue", "merged": False, "draft": False})
        self.assertEqual(json.loads(second.body), json.loads(first.body))
        self.assertEqual(len(self.reads_of(72)), 1, self.github.calls)

    def test_a_reference_older_than_five_minutes_is_read_again(self) -> None:
        with self.server() as (proc, port, headers):
            self.ref(proc, port, headers, ISSUE)
            db = sqlite3.connect(self.store.path)
            db.execute("UPDATE github_ref SET fetched_at = fetched_at - 301000")
            db.commit()
            db.close()
            self.github.issue["title"] = "Ship the gate again"
            again = self.ref(proc, port, headers, ISSUE)
        self.assertEqual(json.loads(again.body)["title"], "Ship the gate again")
        self.assertEqual(len(self.reads_of(72)), 2, self.github.calls)

    def test_a_pull_request_read_reports_kind_merged_and_draft(self) -> None:
        self.github.issue = {**self.github.issue, "state": "closed", "pull_request": {"merged_at": "2026-11-18T08:00:00Z"}, "draft": False}
        with self.server() as (proc, port, headers):
            reply = self.ref(proc, port, headers, f"https://github.com/{REPO}/pull/72")
        self.assertEqual(json.loads(reply.body), {"title": "Ship the gate", "state": "closed", "kind": "pull", "merged": True, "draft": False})

    def test_a_failed_read_stores_nothing(self) -> None:
        self.github.fail_issue_get = True
        with self.server() as (proc, port, headers):
            reply = self.ref(proc, port, headers, ISSUE)
        self.assertNotIn("state", json.loads(reply.body))
        self.assertIsNone(self.cached(REPO, 72))

    def test_a_push_to_the_issue_drops_it_from_the_cache(self) -> None:
        with self.server() as (proc, port, headers):
            self.ref(proc, port, headers, ISSUE)
        self.assertIsNotNone(self.cached(REPO, 72))
        created = self.write(create("work_item", "WI-9201", self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertIsNone(self.cached(REPO, 72))


if __name__ == "__main__":
    unittest.main()
