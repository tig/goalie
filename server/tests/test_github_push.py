"""A committed status change pushes the work item's status to its linked GitHub issue (issue #72, phase 1).

The push sets one status label, keeps a body trailer that links back to the work item, and closes the issue
when the status is Completed or Deleted. The push is not an Event. A failed push leaves the work item committed
and shows on the work item. Reopen is out: a later open status does not open a closed issue.

Prediction before the implementation: every test here fails, because a status change never calls GitHub.
"""

from __future__ import annotations

import json
import os
import re
import socket
import sqlite3
import subprocess
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, unquote, urlencode, urlparse

from goalie_cli import SERVER, Store, create, update
from live_server import Reply, get, post, running_server, signed

REPO = "tig/goalie"
ISSUE = f"https://github.com/{REPO}/issues/72"
PULL = f"https://github.com/{REPO}/pull/80"
OTHER = "https://github.com/excaliwire/factory/issues/3"
PUBLIC = "http://goalie.test"
ITEM = "WI-9001"
GOAL = "XW-0007"
LATER = "WI-9080"

# Commit the create and stop. The request has to be on disk, because this process does not drain.
COMMITTED_CREATE = r"""
import { openStore } from "./src/store.ts";
import { runCommands } from "./src/commands.ts";

const db = openStore(process.env.GOALIE_DB);
const answer = runCommands(db, "tig", {
  commands: [{
    op: "create",
    kind: "work_item",
    id: "WI-9080",
    ref: "$item",
    reason: "Filed",
    github_repo: "tig/goalie",
    fields: { goal: "XW-0007", title: "Ship the issue", owner: "tig", status: "Backlog" },
  }],
}, "2026-10-23");
const id = answer.body.ok ? answer.body.ids["$item"] : undefined;
if (!answer.body.ok || typeof id !== "string") {
  process.stdout.write(JSON.stringify(answer.body));
  db.close();
  process.exit(1);
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();
process.stdout.write(id);
"""

# The next process only drains. It is the one that opens the issue.
DRAIN_ONLY = r"""
import { openStore } from "./src/store.ts";
import { drainGitHub } from "./src/github.ts";

const db = openStore(process.env.GOALIE_DB);
await drainGitHub(db);
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();
process.stdout.write("ok");
"""


class GitHub(ThreadingHTTPServer):
    """A stand-in for the GitHub API. It records one issue and the calls made on it."""

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), Handler)
        self.issue: dict[str, Any] = {"body": "Keep this.", "state": "open", "state_reason": None, "labels": ["pinned"]}
        self.calls: list[str] = []
        self.fail_token = False
        self.fail_issue = False
        self.fail_search = False
        self.fail_search_repos: set[str] = set()
        self.installation_id = 77
        self.token = "ghs_test"
        self.opened: dict[str, Any] | None = None
        self.issue_url: str | None = None
        self.opened_issue: dict[str, Any] | None = None
        self.opened_path: str | None = None
        self.added_issue: dict[str, Any] | None = None
        self.added_path: str | None = None
        self.label_body: dict[str, Any] | None = None
        self.before_issue: Callable[[], None] | None = None
        self.during_search: Callable[[], None] | None = None
        self.fail_label = False
        self.drop_label = False
        self.search: list[dict[str, Any]] = []
        self.queries: list[str] = []
        self.issue_fields: list[dict[str, Any]] | None = None
        self.fail_issue_fields = False
        self.forbid_issue_fields = False
        self.fail_issue_get = False
        self.field_values: list[dict[str, Any]] = []


class Handler(BaseHTTPRequestHandler):
    server: GitHub

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        self._call()
        path = self._path()
        if path == "/search/issues":
            self._search()
            return
        if path == f"/repos/{REPO}/installation":
            self._send(200, {"id": self.server.installation_id})
            return
        if path == "/repos/excaliwire/factory/installation":
            self._send(200, {"id": 88})
            return
        tracked = self._tracked(path)
        if tracked is not None:
            self._issue(tracked)
            return
        if self.server.opened_issue is not None and path == self.server.opened_path:
            self._issue(self.server.opened_issue)
            return
        if path == "/orgs/tig/issue-fields":
            if self.server.fail_issue_fields:
                self._send(500, {"message": "no"})
                return
            if self.server.forbid_issue_fields:
                self._send(403, {"message": "no"})
                return
            if self.server.issue_fields is not None:
                self._send(200, self.server.issue_fields)
                return
        self._send(404, {"message": "not found"})

    def do_POST(self) -> None:
        self._call()
        path, body = self._path(), self._body()
        if path.startswith("/app/installations/") and path.endswith("/access_tokens"):
            if self.server.fail_token:
                self._send(500, {"message": "no"})
                return
            self._send(201, {"token": self.server.token})
            return
        labeled = self._tracked(path[: -len("/labels")]) if path.endswith("/labels") else None
        if labeled is not None:
            for name in body.get("labels", []):
                if name not in labeled["labels"]:
                    labeled["labels"].append(name)
            self._send(200, {})
            return
        if path.startswith("/repos/") and path.endswith("/labels") and "/issues/" in path:
            self.server.label_body = body
            if self.server.drop_label:
                self._drop()
                return
            if self.server.fail_label:
                self._send(500, {"message": "no"})
                return
            self._add_labels(path, body.get("labels", []))
            self._send(200, {})
            return
        parts = path.split("/")
        if len(parts) == 5 and parts[1] == "repos" and parts[4] == "issues":
            if self.server.fail_issue:
                self._send(422, {"message": "no"})
                return
            hook = self.server.before_issue
            if hook is not None:
                hook()
            url = f"https://github.com/{parts[2]}/{parts[3]}/issues/140"
            self.server.opened = {"title": body.get("title"), "body": body.get("body"), "url": url}
            self.server.issue_url = url
            self.server.opened_path = f"{path}/140"
            self.server.opened_issue = {"title": body.get("title"), "body": body.get("body"), "state": "open", "state_reason": None, "labels": []}
            self._send(201, {"html_url": url, "number": 140, "title": body.get("title")})
            return
        if path == f"/repos/{REPO}/labels":
            self._send(201, {"name": body.get("name")})
            return
        if "/issues/" in path and path.endswith("/issue-field-values"):
            self.server.field_values.append({"path": path, "body": body})
            self._send(200, {})
            return
        self._send(404, {"message": "not found"})

    def do_PATCH(self) -> None:
        self._call()
        path = self._path()
        tracked = self._tracked(path)
        if tracked is not None:
            self._patch(tracked)
            return
        if self.server.opened_issue is not None and path == self.server.opened_path:
            self._patch(self.server.opened_issue)
            return
        self._send(404, {"message": "not found"})

    def do_DELETE(self) -> None:
        self._call()
        path = self._path()
        if "/labels/" in path:
            owner = self._tracked(path.split("/labels/", 1)[0])
            if owner is not None and self._remove_label(path, path.split("/labels/", 1)[0] + "/labels/", owner):
                return
        opened = self.server.opened_issue
        if opened is not None and self.server.opened_path is not None and self._remove_label(path, f"{self.server.opened_path}/labels/", opened):
            return
        self._send(404, {"message": "not found"})

    def _search(self) -> None:
        params = parse_qs(urlparse(self.path).query)
        text = params.get("q", [""])[0]
        self.server.queries.append(text)
        if self.server.fail_search:
            self._send(500, {"message": "no"})
            return
        repos = [part.lower() for part in re.findall(r"repo:(\S+)", text)]
        failed = {name.lower() for name in self.server.fail_search_repos}
        if any(repo in failed for repo in repos):
            self._send(500, {"message": "no"})
            return
        items = []
        for hit in self.server.search:
            url = str(hit.get("html_url", "")).lower()
            if repos and not any(f"github.com/{repo}/" in url for repo in repos):
                continue
            items.append(hit)
        hook = self.server.during_search
        if hook is not None:
            hook()
        self._send(200, {"items": items})

    def _tracked(self, path: str) -> dict[str, Any] | None:
        if path == f"/repos/{REPO}/issues/72":
            return self.server.issue
        if self.server.added_issue is not None and path == self.server.added_path:
            return self.server.added_issue
        return None

    def _issue(self, issue: dict[str, Any]) -> None:
        if self.server.fail_issue_get:
            self._send(500, {"message": "no"})
            return
        payload: dict[str, Any] = {"body": issue["body"], "state": issue["state"], "state_reason": issue["state_reason"], "labels": [{"name": name} for name in issue["labels"]]}
        if "title" in issue:
            payload["title"] = issue["title"]
        self._send(200, payload)

    def _patch(self, issue: dict[str, Any]) -> None:
        body = self._body()
        if "title" in body:
            issue["title"] = body["title"]
        if "body" in body:
            issue["body"] = body["body"]
        if "state" in body:
            issue["state"] = body["state"]
        if "state_reason" in body:
            issue["state_reason"] = body["state_reason"]
        self._send(200, {})

    def _add_labels(self, path: str, names: list[str]) -> None:
        opened = self.server.opened_issue
        if opened is None or self.server.opened_path is None or path != f"{self.server.opened_path}/labels":
            return
        for name in names:
            if name not in opened["labels"]:
                opened["labels"].append(name)

    def _remove_label(self, path: str, prefix: str, issue: dict[str, Any]) -> bool:
        if not path.startswith(prefix):
            return False
        name = unquote(path[len(prefix):])
        issue["labels"] = [label for label in issue["labels"] if label != name]
        self._send(200, {})
        return True

    def _drop(self) -> None:
        self.close_connection = True
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def _path(self) -> str:
        return urlparse(self.path).path

    def _call(self) -> None:
        self.server.calls.append(f"{self.command} {self._path()}")

    def _body(self) -> dict[str, Any]:
        raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        return json.loads(raw) if raw else {}

    def _send(self, status: int, payload: dict[str, Any] | list[Any]) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def set_scope(store: Store, repos: list[str], product: list[dict[str, str]] | None, goal: str = GOAL) -> None:
    """The owner setting github_repos and the repo entries on the goal. The env var is not this."""
    settings = store.read("owner_settings", "owner")
    wrote = store.write("tig", update("owner_settings", "owner", settings["version"], {"settings": {**settings["settings"], "github_repos": repos}}))
    if not wrote["ok"]:
        raise AssertionError(wrote)
    row = store.read("goal", goal)
    if row.get("work_product") == product:
        return
    named = store.write("tig", update("goal", goal, row["version"], {"work_product": product}, "Name the repositories"))
    if not named["ok"]:
        raise AssertionError(named)


def private_key() -> str:
    script = "import { generateKeyPairSync } from 'node:crypto'; const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); process.stdout.write(privateKey.export({ type: 'pkcs8', format: 'pem' }));"
    return subprocess.run(["node", "--input-type=module", "-e", script], cwd=SERVER, capture_output=True, check=True, text=True).stdout


class PushTests:
    """Shared store and fake GitHub for the push tests."""

    store: Store
    github: GitHub
    env: dict[str, str]

    @classmethod
    def start(cls) -> None:
        cls.store = Store()
        assert cls.store.run("seed")[0] == 0
        assert cls.store.run("seed", str(SERVER / "seed" / "build-team.json"))[0] == 0
        key = cls.store._scratch.name + "/github.pem"  # noqa: SLF001
        with open(key, "w", encoding="utf-8") as handle:
            handle.write(private_key())
        cls.github = GitHub()
        threading.Thread(target=cls.github.serve_forever, daemon=True).start()
        host, port = cls.github.server_address
        cls.env = {
            "GOALIE_GITHUB_APP_ID": "123456",
            "GOALIE_GITHUB_INSTALLATION_ID": "77",
            "GOALIE_GITHUB_PRIVATE_KEY_FILE": key,
            "GOALIE_GITHUB_API": f"http://{host}:{port}",
            "GOALIE_PUBLIC_URL": PUBLIC,
        }

    @classmethod
    def stop(cls) -> None:
        cls.github.shutdown()
        cls.store.close()

    def write(self, command: dict[str, Any]) -> Any:
        return self.store.run("write", "--as", "tig", stdin=command, env=self.env)[1]

    def item(self, links: list[str], status: str = "Backlog") -> dict[str, Any]:
        return {"goal": GOAL, "title": "Ship the push", "owner": "tig", "status": status, "links": links}


import unittest


class GitHubPushTests(unittest.TestCase, PushTests):
    @classmethod
    def setUpClass(cls) -> None:
        cls.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stop()

    def setUp(self) -> None:
        self.github.calls.clear()
        self.github.fail_token = False
        self.github.fail_issue = False
        self.github.fail_search = False
        self.github.fail_search_repos = set()
        self.github.installation_id = 77
        self.github.opened = None
        self.github.issue_url = None
        self.github.opened_issue = None
        self.github.opened_path = None
        self.github.added_issue = None
        self.github.added_path = None
        self.github.label_body = None
        self.github.before_issue = None
        self.github.during_search = None
        self.github.fail_label = False
        self.github.drop_label = False
        self.github.search = []
        self.github.queries = []
        self.github.issue_fields = None
        self.github.fail_issue_fields = False
        self.github.forbid_issue_fields = False
        self.github.fail_issue_get = False
        self.github.field_values = []
        self.github.issue = {"body": "Keep this.", "state": "open", "state_reason": None, "labels": ["pinned"]}
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])

    def test_a_status_change_sets_the_label_the_trailer_and_the_close(self) -> None:
        created = self.write(create("work_item", ITEM, self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertIn("POST /app/installations/77/access_tokens", self.github.calls)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Backlog"})
        self.assertEqual(self.github.issue["state"], "open")
        self.assert_trailer()

        moved = self.write(update("work_item", ITEM, 1, {"status": "In Progress"}, "Started"))
        self.assertTrue(moved["ok"], moved)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "In Progress"})
        self.assertEqual(self.github.issue["state"], "open")
        self.assert_trailer()

        done = self.write(update("work_item", ITEM, 2, {"status": "Completed"}, "Shipped"))
        self.assertTrue(done["ok"], done)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Completed"})
        self.assertEqual(self.github.issue["state"], "closed")
        self.assertEqual(self.github.issue["state_reason"], "completed")
        self.assert_trailer()

        deleted = self.write(update("work_item", ITEM, 3, {"status": "Deleted"}, "Dropped"))
        self.assertTrue(deleted["ok"], deleted)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Deleted"})
        self.assertEqual(self.github.issue["state"], "closed")
        self.assertEqual(self.github.issue["state_reason"], "not_planned")
        self.assert_trailer()

        # Reopen is out. The label follows the work item. The issue stays closed.
        again = self.write(update("work_item", ITEM, 4, {"status": "In Progress"}, "Picked up"))
        self.assertTrue(again["ok"], again)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "In Progress"})
        self.assertEqual(self.github.issue["state"], "closed")
        self.assertEqual(self.github.issue["state_reason"], "not_planned")
        self.assertIsNone(self.error(ITEM))
        self.assertNotIn("github", {event["field"] for event in self.store.events() if event["entity"] == ITEM})

    def test_a_failed_push_leaves_the_work_item_committed_and_shows_the_failure(self) -> None:
        assert self.write(create("work_item", "WI-9002", self.item([ISSUE]), "Filed"))["ok"]
        self.github.fail_token = True
        self.github.issue = {"body": "Keep this.", "state": "open", "state_reason": None, "labels": ["pinned"]}
        result = self.write(update("work_item", "WI-9002", 1, {"status": "Completed"}, "Shipped"))
        self.assertTrue(result["ok"], result)
        self.assertEqual(self.store.read("work_item", "WI-9002")["status"], "Completed")
        self.assertEqual(self.github.issue["state"], "open")
        self.assertIn("500", self.error("WI-9002") or "")
        page = self.goal_page()
        shown = next(item for item in page["workItems"] if item["id"] == "WI-9002")
        self.assertEqual(shown["github_error"], self.error("WI-9002"))
        fields = [event["field"] for event in result["events"]]
        self.assertEqual(fields, ["status"])

    def test_a_refused_write_does_not_push(self) -> None:
        assert self.write(create("work_item", "WI-9003", self.item([ISSUE]), "Filed"))["ok"]
        self.github.calls.clear()
        refused = self.write(update("work_item", "WI-9003", 1, {"status": "Completed"}))
        self.assertFalse(refused["ok"])
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.store.read("work_item", "WI-9003")["status"], "Backlog")

    def test_a_title_change_and_another_repo_do_not_push(self) -> None:
        assert self.write(create("work_item", "WI-9004", self.item([ISSUE]), "Filed"))["ok"]
        self.github.calls.clear()
        retitled = self.write(update("work_item", "WI-9004", 1, {"title": "Rename only"}, "Clearer"))
        self.assertTrue(retitled["ok"], retitled)
        self.assertEqual(self.github.calls, [])
        other = self.write(create("work_item", "WI-9005", self.item([OTHER]), "Filed"))
        self.assertFalse(other["ok"])
        self.assertEqual(other["error"], "invalid")
        self.assertIn("excaliwire/factory", other["violations"][0]["message"])
        self.assertIsNone(self.store.read("work_item", "WI-9005"))
        self.assertEqual(self.github.calls, [])

    def test_missing_configuration_shows_on_the_work_item(self) -> None:
        bare = dict(self.env)
        bare.pop("GOALIE_GITHUB_APP_ID")
        result = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9006", self.item([ISSUE]), "Filed"), env=bare)[1]
        self.assertTrue(result["ok"], result)
        self.assertEqual(self.store.read("work_item", "WI-9006")["status"], "Backlog")
        self.assertIn("GOALIE_GITHUB_APP_ID", self.error("WI-9006") or "")
        self.assertEqual(self.github.calls, [])

    def test_a_missing_private_key_is_not_configured_and_stays_out_of_the_body(self) -> None:
        # The file is a directory, so the key cannot be read. The body must not carry the path or the key text.
        root = self.store._scratch.name + "/CANARYKEYPATH"  # noqa: SLF001
        os.makedirs(root, exist_ok=True)
        with open(root + "/key.pem", "w", encoding="utf-8") as handle:
            handle.write("CANARYKEYTEXT\n")
        reply = self.status_as("tig", "sub-tig", {"GOALIE_GITHUB_PRIVATE_KEY_FILE": root})
        self.assertEqual(reply.status, 200, reply.body)
        raw = reply.body.decode()
        body = json.loads(raw)
        self.assertFalse(body["configured"])
        self.assertEqual(body["repositories"], ["tig/goalie"])
        self.assertNotIn("repository", body)
        self.assertEqual(set(body), {"configured", "repositories", "outbound", "inbound"})
        self.assertNotIn("privateKey", body)
        self.assertNotIn("CANARYKEYPATH", raw)
        self.assertNotIn("CANARYKEYTEXT", raw)
        self.assertNotIn("BEGIN PRIVATE KEY", raw)

    def test_a_successful_push_shows_the_issue_on_the_status(self) -> None:
        created = self.write(create("work_item", "WI-9010", self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        reply = self.status_as("tig", "sub-tig")
        self.assertEqual(reply.status, 200, reply.body)
        raw = reply.body.decode()
        body = json.loads(raw)
        self.assertEqual(set(body), {"configured", "repositories", "outbound", "inbound"})
        self.assertEqual(body["repositories"], ["tig/goalie"])
        self.assertNotIn("repository", body)
        self.assertNotIn("privateKey", body)
        self.assertNotIn("BEGIN PRIVATE KEY", raw)
        self.assertNotIn("github.pem", raw)
        self.assertTrue(body["outbound"]["ok"])
        self.assertIn("72", body["outbound"]["detail"])
        self.assertEqual(body["outbound"]["detail"], "Updated tig/goalie#72 to Backlog.")

    def test_a_failed_push_shows_the_same_detail_as_the_work_item(self) -> None:
        assert self.write(create("work_item", "WI-9011", self.item([ISSUE]), "Filed"))["ok"]
        self.github.fail_token = True
        result = self.write(update("work_item", "WI-9011", 1, {"status": "Completed"}, "Shipped"))
        self.assertTrue(result["ok"], result)
        shown = next(item for item in self.goal_page()["workItems"] if item["id"] == "WI-9011")
        reply = self.status_as("tig", "sub-tig")
        self.assertEqual(reply.status, 200, reply.body)
        body = json.loads(reply.body)
        self.assertNotIn("privateKey", body)
        self.assertFalse(body["outbound"]["ok"])
        self.assertEqual(body["outbound"]["detail"], shown["github_error"])

    def env_without_repo(self) -> dict[str, str]:
        env = dict(self.env)
        env["GOALIE_GITHUB_REPO"] = ""
        return env

    def test_a_status_change_pushes_tig_goalie_from_the_owner_setting(self) -> None:
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        created = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9030", self.item([ISSUE]), "Filed"), env=self.env_without_repo())[1]
        self.assertTrue(created["ok"], created)
        self.assertIn("POST /app/installations/77/access_tokens", self.github.calls)
        self.assertIn("GET /repos/tig/goalie/issues/72", self.github.calls)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Backlog"})
        self.assertIsNone(self.error("WI-9030"))

    def test_a_missing_list_uses_the_deployment_repository(self) -> None:
        """A status change still pushes when owner settings have no github_repos list and the deployment names that repository."""
        settings = self.store.read("owner_settings", "owner")
        fields = {key: value for key, value in settings["settings"].items() if key != "github_repos"}
        wrote = self.store.write("tig", update("owner_settings", "owner", settings["version"], {"settings": fields}))
        self.assertTrue(wrote["ok"], wrote)
        self.assertNotIn("github_repos", self.store.read("owner_settings", "owner")["settings"])
        env = dict(self.env)
        env["GOALIE_GITHUB_REPO"] = "tig/goalie"
        created = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9055", self.item([ISSUE]), "Filed"), env=env)[1]
        self.assertTrue(created["ok"], created)
        self.assertIn("GET /repos/tig/goalie/issues/72", self.github.calls)

    def test_an_empty_list_ignores_the_deployment_repository(self) -> None:
        """An empty github_repos list is the scope. The deployment repository does not fill it."""
        set_scope(self.store, [], [{"repo": "github.com/tig/goalie"}])
        env = dict(self.env)
        env["GOALIE_GITHUB_REPO"] = "tig/goalie"
        created = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9056", self.item([ISSUE]), "Filed"), env=env)[1]
        self.assertFalse(created["ok"])
        self.assertEqual(created["error"], "invalid")
        self.assertIn("tig/goalie", created["violations"][0]["message"])
        self.assertIsNone(self.store.read("work_item", "WI-9056"))
        self.assertEqual(self.github.calls, [])

    def test_excaliwire_wildcard_matches_factory_not_tig_goalie(self) -> None:
        set_scope(self.store, ["excaliwire/*"], [{"repo": "https://github.com/excaliwire/factory"}, {"repo": "github.com/tig/goalie"}])
        env = self.env_without_repo()
        factory = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9031", self.item([OTHER]), "Filed"), env=env)[1]
        self.assertTrue(factory["ok"], factory)
        self.assertTrue(any(call.startswith("GET /repos/excaliwire/factory/") for call in self.github.calls), self.github.calls)
        self.github.calls.clear()
        other = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9032", self.item([ISSUE]), "Filed"), env=env)[1]
        self.assertFalse(other["ok"])
        self.assertEqual(other["error"], "invalid")
        self.assertIn("tig/goalie", other["violations"][0]["message"])
        self.assertIsNone(self.store.read("work_item", "WI-9032"))
        self.assertEqual(self.github.calls, [])

    def test_a_push_uses_the_installation_on_that_repository(self) -> None:
        set_scope(self.store, ["excaliwire/*"], [{"repo": "https://github.com/excaliwire/factory"}])
        created = self.write(create("work_item", "WI-9041", self.item([OTHER]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertIn("GET /repos/excaliwire/factory/installation", self.github.calls)
        self.assertIn("POST /app/installations/88/access_tokens", self.github.calls)
        self.assertNotIn("POST /app/installations/77/access_tokens", self.github.calls)

    def test_a_batch_that_drops_the_repository_does_not_push(self) -> None:
        created = self.write(create("work_item", "WI-9040", self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.github.calls.clear()
        actor = self.store.read("actor", "tig")
        if actor.get("subject") != "sub-tig":
            wrote = self.store.write("tig", update("actor", "tig", actor["version"], {"subject": "sub-tig"}))
            self.assertTrue(wrote["ok"], wrote)
        item = self.store.read("work_item", "WI-9040")
        goal = self.store.read("goal", GOAL)
        token, issuers = signed("sub-tig")
        commands = [
            {"op": "update", "kind": "work_item", "id": "WI-9040", "base_version": item["version"], "fields": {"status": "In Progress"}, "reason": "Started"},
            {"op": "update", "kind": "goal", "id": GOAL, "base_version": goal["version"], "fields": {"work_product": []}, "reason": "Drop the repository"},
        ]
        with running_server(self.store.path, {**self.env, **issuers}) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            reply = post(proc, port, "/api/commands", {"commands": commands}, {"Authorization": f"Bearer {token}"})
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.store.read("work_item", "WI-9040")["status"], "In Progress")

    def test_a_goal_repository_matches_without_case(self) -> None:
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/Tig/Goalie"}])
        created = self.write(create("work_item", "WI-9042", self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertIn("Backlog", self.github.issue["labels"])
        self.assertNotEqual(self.github.calls, [])

    def test_a_goal_without_the_repository_does_not_push(self) -> None:
        set_scope(self.store, ["tig/goalie"], [{"url": "https://github.com/tig/goalie"}])
        created = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9033", self.item([ISSUE]), "Filed"), env=self.env_without_repo())[1]
        self.assertFalse(created["ok"])
        self.assertEqual(created["error"], "invalid")
        self.assertIn("tig/goalie", created["violations"][0]["message"])
        self.assertIsNone(self.store.read("work_item", "WI-9033"))
        self.assertEqual(self.github.calls, [])

    def test_status_json_has_repositories_not_repository(self) -> None:
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        reply = self.status_as("tig", "sub-tig", {"GOALIE_GITHUB_REPO": ""})
        self.assertEqual(reply.status, 200, reply.body)
        body = json.loads(reply.body)
        self.assertEqual(set(body), {"configured", "repositories", "outbound", "inbound"})
        self.assertNotIn("repository", body)
        self.assertEqual(body["repositories"], ["tig/goalie"])
        self.assertTrue(body["configured"])
        self.assertNotIn("privateKey", body)
        self.assertNotIn("BEGIN PRIVATE KEY", reply.body.decode())

    def test_filing_with_github_repo_opens_the_issue(self) -> None:
        """One in-scope repository on the goal. Filing with github_repo opens the issue and links it."""
        self.github.installation_id = 99
        command = create("work_item", "WI-9060", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "In Progress"}, "Filed")
        command["github_repo"] = "tig/goalie"
        created = self.write(command)
        self.assertTrue(created["ok"], created)
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)
        self.assertIn("POST /app/installations/99/access_tokens", self.github.calls)
        self.assertNotIn("POST /app/installations/77/access_tokens", self.github.calls)
        self.assertIsNotNone(self.github.opened)
        self.assertEqual(self.github.opened["title"], "Ship the issue")
        self.assertIn("<!-- goalie -->", self.github.opened["body"])
        self.assertIn(f"{PUBLIC}/goals/{GOAL}#work-item-WI-9060", self.github.opened["body"])
        self.assertEqual(self.github.label_body, {"labels": ["In Progress"]})
        stored = self.store.read("work_item", "WI-9060")
        self.assertNotIn("github_repo", stored)
        self.assertIn(self.github.issue_url, stored["links"])
        linked = [event for event in self.store.events() if event["entity"] == "WI-9060" and event["field"] == "links"]
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0]["actor"], "tig")
        self.assertIn("tig/goalie#140", linked[0]["reason"])
        self.assertIsNone(self.error("WI-9060"))

    def test_a_repository_not_on_the_goal_does_not_open_an_issue(self) -> None:
        """A repository in scope but not on the goal does not call GitHub and does not create the work item."""
        set_scope(self.store, ["tig/goalie", "excaliwire/factory"], [{"repo": "github.com/tig/goalie"}])
        self.github.calls.clear()
        command = create("work_item", "WI-9061", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "excaliwire/factory"
        result = self.write(command)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "invalid")
        self.assertIn("excaliwire/factory", result["violations"][0]["message"])
        self.assertEqual(self.github.calls, [])
        self.assertIsNone(self.store.read("work_item", "WI-9061"))

    def test_a_selected_issue_outside_the_goal_is_not_saved(self) -> None:
        """A selected issue whose repository is no longer on the goal is not stored."""
        item = "WI-9094"
        created = self.write(create("work_item", item, {"goal": GOAL, "title": "Ship the push", "owner": "tig", "status": "Backlog"}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertIsNone(self.store.read("work_item", item)["links"])
        set_scope(self.store, ["tig/goalie"], [])
        self.github.calls.clear()
        chosen = self.write(update("work_item", item, 1, {"links": [ISSUE]}, "Attach"))
        self.assertFalse(chosen["ok"], chosen)
        self.assertEqual(chosen["error"], "invalid")
        self.assertEqual(chosen["violations"][0]["rule"], "github-repo")
        self.assertEqual(chosen["violations"][0]["field"], "links")
        self.assertIn("tig/goalie", chosen["violations"][0]["message"])
        self.assertIsNone(self.store.read("work_item", item)["links"])
        self.assertFalse(any("PATCH" in call for call in self.github.calls), self.github.calls)

    def test_a_selected_pull_request_outside_github_repos_is_not_saved(self) -> None:
        """A selected pull request is not stored when github_repos is empty. An empty list does not fall back."""
        set_scope(self.store, [], [{"repo": "github.com/tig/goalie"}])
        env = dict(self.env)
        env["GOALIE_GITHUB_REPO"] = "tig/goalie"
        self.github.calls.clear()
        result = self.store.run(
            "write", "--as", "tig",
            stdin=create("work_item", "WI-9095", self.item(["https://github.com/tig/goalie/pull/72"]), "Filed"),
            env=env,
        )[1]
        self.assertFalse(result["ok"], result)
        self.assertEqual(result["error"], "invalid")
        self.assertEqual(result["violations"][0]["rule"], "github-repo")
        self.assertEqual(result["violations"][0]["field"], "links")
        self.assertIn("tig/goalie", result["violations"][0]["message"])
        self.assertIsNone(self.store.read("work_item", "WI-9095"))
        self.assertEqual(self.github.calls, [])

    def test_a_failed_issue_create_leaves_the_work_item_and_shows_the_failure(self) -> None:
        """GitHub rejects the create. The work item stays, with no issue link, and the failure shows. It is not drained as a status push."""
        self.github.fail_issue = True
        command = create("work_item", "WI-9062", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        result = self.write(command)
        self.assertTrue(result["ok"], result)
        stored = self.store.read("work_item", "WI-9062")
        self.assertEqual(stored["status"], "Backlog")
        self.assertIsNone(stored["links"])
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)
        self.assertIn("422", self.error("WI-9062") or "")
        shown = next(item for item in self.goal_page()["workItems"] if item["id"] == "WI-9062")
        self.assertEqual(shown["github_error"], self.error("WI-9062"))
        self.assertNotIn("links", [event["field"] for event in self.store.events() if event["entity"] == "WI-9062"])
        self.github.calls.clear()
        self.github.fail_issue = False
        retitled = self.write(update("work_item", "WI-9062", 1, {"title": "Still here"}, "Clearer"))
        self.assertTrue(retitled["ok"], retitled)
        self.assertIsNotNone(self.error("WI-9062"))
        self.assertFalse(any(call.startswith("GET /repos/") and "/issues/" in call for call in self.github.calls), self.github.calls)

    def test_a_failed_create_stays_visible_after_a_status_change(self) -> None:
        """GitHub rejects the create. A later status change keeps that failure on the work item and does not patch an issue."""
        self.github.fail_issue = True
        item = "WI-9076"
        command = create("work_item", item, {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        filed = self.write(command)
        self.assertTrue(filed["ok"], filed)
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)
        self.github.calls.clear()
        moved = self.write(update("work_item", item, 1, {"status": "In Progress"}, "Started"))
        self.assertTrue(moved["ok"], moved)
        self.assertEqual(self.store.read("work_item", item)["status"], "In Progress")
        failure = self.error(item)
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertEqual(shown.get("github_error"), failure)
        self.assertIn("422", shown.get("github_error") or "")
        self.assertFalse(any("PATCH" in call for call in self.github.calls), self.github.calls)

    def test_a_failed_create_stays_visible_when_no_issue_attaches(self) -> None:
        """GitHub rejects the create. A retitle to Ship #72 with an empty search keeps that failure and does not add a link."""
        self.github.fail_issue = True
        item = "WI-9088"
        command = create("work_item", item, {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        filed = self.write(command)
        self.assertTrue(filed["ok"], filed)
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertEqual(shown["github_error"], self.error(item))
        self.assertIn("422", shown["github_error"])
        self.github.fail_issue = False
        self.github.search = []
        self.github.calls.clear()
        self.github.queries.clear()
        retitled = self.write(update("work_item", item, 1, {"title": "Ship #72"}, "Clearer"))
        self.assertTrue(retitled["ok"], retitled)
        stored = self.store.read("work_item", item)
        self.assertIsNone(stored["links"])
        failure = self.error(item)
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertEqual(shown.get("github_error"), failure)
        self.assertIn("422", shown.get("github_error") or "")
        self.assertNotIn("links", [event["field"] for event in self.store.events() if event["entity"] == item])
        self.assertIn(f"repo:{REPO} 72", self.github.queries)

    def test_a_failed_create_clears_when_an_issue_attaches(self) -> None:
        """GitHub rejects the create. A retitle to Ship #72 attaches the issue the search returns and clears the failure."""
        self.github.fail_issue = True
        item = "WI-9089"
        command = create("work_item", item, {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        filed = self.write(command)
        self.assertTrue(filed["ok"], filed)
        self.assertIn("422", self.error(item) or "")
        self.github.fail_issue = False
        self.github.search = [{"html_url": ISSUE, "title": "Enable Github integration"}]
        self.github.calls.clear()
        retitled = self.write(update("work_item", item, 1, {"title": "Ship #72"}, "Clearer"))
        self.assertTrue(retitled["ok"], retitled)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["links"], [ISSUE])
        self.assertIsNone(self.error(item))
        self.assertIn("Backlog", self.github.issue["labels"])

    def test_a_link_saved_during_a_missed_attach_gets_the_current_status(self) -> None:
        """GitHub rejects the create. A link saved during the empty search stays, and that issue gets the current status."""
        self.github.fail_issue = True
        item = "WI-9090"
        command = create("work_item", item, {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        filed = self.write(command)
        self.assertTrue(filed["ok"], filed)
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertEqual(shown["github_error"], self.error(item))
        self.assertIn("422", shown["github_error"])
        self.assertIsNone(self.store.read("work_item", item)["links"])
        self.github.fail_issue = False
        self.github.search = []
        self.github.calls.clear()

        def link() -> None:
            self.github.during_search = None
            row = self.store.read("work_item", item)
            wrote = self.store.run("write", "--as", "tig", stdin=update("work_item", item, row["version"], {"links": [ISSUE]}, "Attach"), env=self.env)[1]
            if not wrote["ok"]:
                raise AssertionError(wrote)

        self.github.during_search = link
        try:
            retitled = self.write(update("work_item", item, 1, {"title": "Ship #72"}, "Clearer"))
        finally:
            self.github.during_search = None
        self.assertTrue(retitled["ok"], retitled)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["links"], [ISSUE])
        self.assertIsNone(self.error(item))
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIsNone(shown.get("github_error"))
        self.assertIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)
        self.assertIn("Backlog", self.github.issue["labels"])

    def test_a_status_change_during_create_closes_the_opened_issue(self) -> None:
        """A status write during the issue create sees no link. After the link is saved, that status closes the issue."""
        item = "WI-9070"

        def complete() -> None:
            row = self.store.read("work_item", item)
            wrote = self.store.run("write", "--as", "tig", stdin=update("work_item", item, row["version"], {"status": "Completed"}, "Shipped"), env=self.env)[1]
            if not wrote["ok"]:
                raise AssertionError(wrote)

        self.github.before_issue = complete
        try:
            command = create("work_item", item, {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
            command["github_repo"] = "tig/goalie"
            result = self.write(command)
        finally:
            self.github.before_issue = None
        self.assertTrue(result["ok"], result)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["status"], "Completed")
        self.assertIn(self.github.issue_url, stored["links"])
        self.assertEqual(self.github.opened_issue["state"], "closed")
        self.assertEqual(self.github.opened_issue["state_reason"], "completed")
        self.assertEqual(self.github.opened_issue["labels"], ["Completed"])
        self.assertIsNone(self.error(item))
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)

    def test_a_rename_during_create_sets_the_opened_issue_title(self) -> None:
        """A rename during the issue POST is not the created title. The push after the link writes the current title."""
        item = "WI-9075"

        def rename() -> None:
            row = self.store.read("work_item", item)
            wrote = self.store.run("write", "--as", "tig", stdin=update("work_item", item, row["version"], {"title": "Renamed while opening"}, "Clearer"), env=self.env)[1]
            if not wrote["ok"]:
                raise AssertionError(wrote)

        self.github.before_issue = rename
        try:
            command = create("work_item", item, {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
            command["github_repo"] = "tig/goalie"
            result = self.write(command)
        finally:
            self.github.before_issue = None
        self.assertTrue(result["ok"], result)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["title"], "Renamed while opening")
        self.assertEqual(self.github.opened["title"], "Ship the issue")
        self.assertEqual(self.github.opened_issue["title"], "Renamed while opening")
        self.assertIn(self.github.issue_url, stored["links"])
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)

    def test_filing_completed_closes_the_opened_issue(self) -> None:
        """Filing a work item that is already Completed closes the new issue as completed."""
        command = create("work_item", "WI-9071", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Completed"}, "Filed")
        command["github_repo"] = "tig/goalie"
        result = self.write(command)
        self.assertTrue(result["ok"], result)
        stored = self.store.read("work_item", "WI-9071")
        self.assertEqual(stored["status"], "Completed")
        self.assertIn(self.github.issue_url, stored["links"])
        self.assertEqual(self.github.opened_issue["state"], "closed")
        self.assertEqual(self.github.opened_issue["state_reason"], "completed")
        self.assertEqual(self.github.opened_issue["labels"], ["Completed"])
        self.assertIsNone(self.error("WI-9071"))
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)

    def test_a_label_failure_does_not_push_the_status(self) -> None:
        """A rejected label saves the link and the failure. It does not push, so Completed does not close the issue."""
        self.github.fail_label = True
        command = create("work_item", "WI-9072", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Completed"}, "Filed")
        command["github_repo"] = "tig/goalie"
        result = self.write(command)
        self.assertTrue(result["ok"], result)
        stored = self.store.read("work_item", "WI-9072")
        self.assertEqual(stored["status"], "Completed")
        self.assertIn(self.github.issue_url, stored["links"])
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)
        self.assertNotIn("PATCH /repos/tig/goalie/issues/140", self.github.calls)
        self.assertEqual(self.github.opened_issue["state"], "open")
        self.assertIn("500", self.error("WI-9072") or "")

    def test_a_thrown_label_request_keeps_the_issue_link(self) -> None:
        """The label request throws after the issue exists. The work item keeps the link and shows the failure."""
        self.github.drop_label = True
        command = create("work_item", "WI-9073", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        result = self.write(command)
        self.assertTrue(result["ok"], result)
        stored = self.store.read("work_item", "WI-9073")
        self.assertIn(self.github.issue_url, stored["links"])
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)
        self.assertEqual(self.error("WI-9073"), "GitHub could not be reached.")
        self.assertNotIn("PATCH /repos/tig/goalie/issues/140", self.github.calls)
        self.assertEqual(self.github.opened_issue["state"], "open")

    def test_a_later_drain_opens_the_issue_committed_with_the_work_item(self) -> None:
        """The create commits the request and does not call GitHub. A second process only drains and opens the issue."""
        self.github.calls.clear()
        created = self.node(COMMITTED_CREATE)
        self.assertEqual(created.returncode, 0, created.stdout.decode() + created.stderr.decode())
        item = created.stdout.decode()
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["status"], "Backlog")
        self.assertIsNone(stored["links"])
        self.assertEqual(self.github.calls, [])
        row = self.push_row(item)
        drained = self.node(DRAIN_ONLY)
        self.assertEqual(drained.returncode, 0, drained.stdout.decode() + drained.stderr.decode())
        opened = self.store.read("work_item", item)
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls, f"links={opened.get('links')!r} push={row!r}")
        self.assertIn(self.github.issue_url, opened["links"])
        self.assertIsNone(self.error(item))
        self.assertEqual(item, LATER)
        self.assertEqual(row["issue"], "")
        self.assertEqual(row["repo"], "tig/goalie")
        self.assertIsNone(row["error"])
        self.assertEqual(row["actor"], "tig")
        self.assertEqual(row["status"], "Backlog")
        self.assertEqual(row["goal"], GOAL)

    def test_the_printed_write_has_the_saved_issue_link(self) -> None:
        """The printed entity is the work item after the link write, so the next update is not stale."""
        command = create("work_item", "WI-9074", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        created = self.write(command)
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", "WI-9074")
        self.assertIn(self.github.issue_url, created["entity"].get("links") or [])
        self.assertEqual(created["entity"]["version"], stored["version"])
        self.assertNotIn("links", [event["field"] for event in created["events"]])
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)

    def test_wildcard_scope_lists_the_goal_repo(self) -> None:
        """A scope of owner/* offers the concrete repository the goal names."""
        set_scope(self.store, ["tig/*"], [{"repo": "github.com/tig/goalie"}])
        self.assertEqual(self.goal_page()["githubRepos"], ["tig/goalie"])

    def test_filing_under_a_wildcard_scope_opens_the_issue(self) -> None:
        """Filing with that repository still opens the issue."""
        set_scope(self.store, ["tig/*"], [{"repo": "github.com/tig/goalie"}])
        command = create("work_item", "WI-9063", {"goal": GOAL, "title": "Ship the issue", "owner": "tig", "status": "Backlog"}, "Filed")
        command["github_repo"] = "tig/goalie"
        result = self.write(command)
        self.assertTrue(result["ok"], result)
        self.assertIn("POST /repos/tig/goalie/issues", self.github.calls)
        self.assertIn(self.github.issue_url, self.store.read("work_item", "WI-9063")["links"])

    def test_a_wildcard_of_another_owner_lists_nothing(self) -> None:
        """A wildcard for a different owner offers no repository."""
        set_scope(self.store, ["acme/*"], [{"repo": "github.com/tig/goalie"}])
        self.assertEqual(self.goal_page()["githubRepos"], [])

    def test_a_wildcard_plus_the_same_repo_lists_it_once(self) -> None:
        """A wildcard and the same repository list that repository once."""
        set_scope(self.store, ["tig/*", "tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        self.assertEqual(self.goal_page()["githubRepos"], ["tig/goalie"])

    def test_a_wildcard_lists_each_named_repo_in_product_sequence(self) -> None:
        """One wildcard lists each of that owner's repositories on the goal, in work_product order."""
        set_scope(self.store, ["tig/*"], [{"repo": "https://github.com/tig/other"}, {"repo": "github.com/tig/goalie"}])
        listed = self.goal_page()["githubRepos"]
        self.assertEqual(listed, ["tig/other", "tig/goalie"])
        self.assertNotIn("tig/*", listed)

    def test_a_hash_in_a_new_title_attaches_the_first_issue(self) -> None:
        """A create titled Ship #72, with no links, stores the first issue the search returns. The push then sets that issue's status label."""
        self.github.installation_id = 99
        self.github.search = [
            {"html_url": PULL, "title": "A pull request"},
            {"html_url": ISSUE, "title": "Enable Github integration"},
            {"html_url": f"https://github.com/{REPO}/issues/99", "title": "Later"},
        ]
        created = self.write(create("work_item", "WI-9082", {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"))
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", "WI-9082")
        self.assertEqual(stored["links"], [ISSUE])
        self.assertEqual(self.github.queries, [f"repo:{REPO} 72"])
        self.assertNotIn("POST /app/installations/77/access_tokens", self.github.calls)
        self.assertIn("POST /app/installations/99/access_tokens", self.github.calls)
        self.assertIn("Backlog", self.github.issue["labels"])
        linked = [event for event in self.store.events() if event["entity"] == "WI-9082" and event["field"] == "links"]
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0]["actor"], "tig")
        self.assertEqual(linked[0]["reason"], "Attached")

    def test_an_unconfigured_attach_shows_the_failure(self) -> None:
        """A create titled Ship #72, when GOALIE_GITHUB_APP_ID is unset, stores no link and shows that GitHub is not configured."""
        bare = dict(self.env)
        bare.pop("GOALIE_GITHUB_APP_ID")
        item = "WI-9098"
        created = self.store.run(
            "write", "--as", "tig",
            stdin=create("work_item", item, {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"),
            env=bare,
        )[1]
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertIsNone(stored["links"])
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIn("GitHub is not configured. Missing GOALIE_GITHUB_APP_ID.", shown.get("github_error") or "")

    def test_a_search_that_does_not_complete_shows_the_failure(self) -> None:
        """A search that answers 500 does not attach. The failure stays, and a later status change does not search or clear it."""
        self.github.fail_search = True
        item = "WI-9093"
        created = self.write(create("work_item", item, {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"))
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertIsNone(stored["links"])
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIn("GitHub answered 500", shown.get("github_error") or "")
        self.assertFalse(any("PATCH" in call for call in self.github.calls), self.github.calls)
        failure = shown["github_error"]
        self.github.calls.clear()
        self.github.queries.clear()
        moved = self.write(update("work_item", item, stored["version"], {"status": "In Progress"}, "Started"))
        self.assertTrue(moved["ok"], moved)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["status"], "In Progress")
        self.assertIsNone(stored["links"])
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertEqual(shown.get("github_error"), failure)
        self.assertEqual(self.error(item), failure)
        self.assertEqual(self.github.queries, [])
        self.assertFalse(any("/search/issues" in call for call in self.github.calls), self.github.calls)
        self.assertFalse(any("PATCH" in call for call in self.github.calls), self.github.calls)

    def test_an_incomplete_search_does_not_attach_a_later_issue(self) -> None:
        """The first repository answers 500. A later repository's issue is not attached. The search response still lists that issue."""
        failing = "excaliwire/factory"
        set_scope(self.store, [failing, REPO], [{"repo": f"github.com/{failing}"}, {"repo": f"github.com/{REPO}"}])
        self.github.fail_search_repos = {failing}
        self.github.search = [{"html_url": ISSUE, "title": "Enable Github integration"}]
        item = "WI-9097"
        created = self.write(create("work_item", item, {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(self.github.queries, [f"repo:{failing} 72", f"repo:{REPO} 72"])
        stored = self.store.read("work_item", item)
        self.assertNotIn(ISSUE, stored["links"] or [])
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIn("GitHub answered 500", shown.get("github_error") or "")
        self.assertFalse(any("PATCH" in call for call in self.github.calls), self.github.calls)
        reply = self.search_as("chelsea", "sub-chelsea", GOAL, "72")
        self.assertEqual(reply.status, 200, reply.body)
        self.assertIn({"kind": "issue", "title": "Enable Github integration", "url": ISSUE}, json.loads(reply.body)["items"])

    def test_a_changed_hash_is_not_attached(self) -> None:
        """A search for #72 that finishes after the title is Ship #99 does not store that issue."""
        item = "WI-9085"
        self.github.search = [{"html_url": ISSUE, "title": "Enable Github integration"}]

        def retitle() -> None:
            self.github.during_search = None
            self.github.search = []
            row = self.store.read("work_item", item)
            wrote = self.store.write("tig", update("work_item", item, row["version"], {"title": "Ship #99"}, "Clearer"))
            if not wrote["ok"]:
                raise AssertionError(wrote)

        self.github.during_search = retitle
        try:
            created = self.write(create("work_item", item, {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"))
        finally:
            self.github.during_search = None
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["title"], "Ship #99")
        self.assertNotIn(ISSUE, stored["links"] or [])

    def test_a_repository_removed_from_the_goal_during_search_is_not_attached(self) -> None:
        """A search for #72 that finishes after the goal no longer names the repository does not store that issue."""
        item = "WI-9091"
        self.github.search = [{"html_url": ISSUE, "title": "Enable Github integration"}]

        def drop_goal() -> None:
            self.github.during_search = None
            set_scope(self.store, ["tig/goalie"], [])

        self.github.during_search = drop_goal
        try:
            created = self.write(create("work_item", item, {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"))
        finally:
            self.github.during_search = None
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertNotIn(ISSUE, stored["links"] or [])
        self.assertNotIn("links", [event["field"] for event in self.store.events() if event["entity"] == item])
        self.assertNotIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)

    def test_a_repository_removed_from_github_repos_during_search_is_not_attached(self) -> None:
        """A search for #72 that finishes after github_repos is empty does not store that issue. An empty list is the scope."""
        item = "WI-9092"
        self.github.search = [{"html_url": ISSUE, "title": "Enable Github integration"}]

        def drop_repos() -> None:
            self.github.during_search = None
            set_scope(self.store, [], [{"repo": "github.com/tig/goalie"}])

        self.github.during_search = drop_repos
        try:
            created = self.write(create("work_item", item, {"goal": GOAL, "title": "Ship #72", "owner": "tig", "status": "Backlog"}, "Filed"))
        finally:
            self.github.during_search = None
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertNotIn(ISSUE, stored["links"] or [])
        self.assertNotIn("links", [event["field"] for event in self.store.events() if event["entity"] == item])
        self.assertNotIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)

    def test_a_retitle_keeps_the_linked_issue(self) -> None:
        """A work item that already links an issue, retitled to include #99, keeps that issue URL."""
        created = self.write(create("work_item", "WI-9083", self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.github.calls.clear()
        self.github.queries.clear()
        self.github.search = [{"html_url": f"https://github.com/{REPO}/issues/99", "title": "Other"}]
        retitled = self.write(update("work_item", "WI-9083", 1, {"title": "Ship #99"}, "Clearer"))
        self.assertTrue(retitled["ok"], retitled)
        self.assertEqual(self.store.read("work_item", "WI-9083")["links"], [ISSUE])
        self.assertEqual(self.github.queries, [])

    def test_a_completed_status_does_not_patch_a_pull_request(self) -> None:
        """A pull request stays a link. Completed closes the attached issue and does not PATCH the pull request."""
        created = self.write(create("work_item", "WI-9084", self.item([PULL, ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.github.calls.clear()
        done = self.write(update("work_item", "WI-9084", 1, {"status": "Completed"}, "Shipped"))
        self.assertTrue(done["ok"], done)
        self.assertEqual(self.store.read("work_item", "WI-9084")["links"], [PULL, ISSUE])
        self.assertFalse(any("/pull/" in call for call in self.github.calls), self.github.calls)
        self.assertIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)
        self.assertEqual(self.github.issue["state"], "closed")
        self.assertEqual(self.github.issue["state_reason"], "completed")

    def test_a_completed_create_with_a_selected_issue_closes_it(self) -> None:
        """A Completed create that already links an in-scope issue closes that issue as completed."""
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        item = "WI-9096"
        command = create("work_item", item, self.item([ISSUE], "Completed"), "Filed")
        self.assertNotIn("github_repo", command)
        self.github.calls.clear()
        created = self.write(command)
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["status"], "Completed")
        self.assertEqual(stored["links"], [ISSUE])
        self.assertIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)
        self.assertEqual(self.github.issue["state_reason"], "completed")

    def test_a_completed_work_item_that_gains_an_issue_link_closes_it(self) -> None:
        """Choosing an issue on a Completed work item queues that status. The issue closes as completed. A pull request does not."""
        item = "WI-9086"
        created = self.write(create("work_item", item, self.item([], "Completed"), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(self.store.read("work_item", item)["status"], "Completed")
        self.github.calls.clear()
        chosen = self.write(update("work_item", item, 1, {"links": [ISSUE]}, "Attach"))
        self.assertTrue(chosen["ok"], chosen)
        self.assertEqual(self.store.read("work_item", item)["status"], "Completed")
        self.assertEqual(self.store.read("work_item", item)["links"], [ISSUE])
        self.assertEqual(self.github.issue["state"], "closed")
        self.assertEqual(self.github.issue["state_reason"], "completed")
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Completed"})
        self.github.calls.clear()
        pulled = self.write(update("work_item", item, 2, {"links": [ISSUE, PULL]}, "Attach"))
        self.assertTrue(pulled["ok"], pulled)
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.github.issue["state"], "closed")
        self.assertEqual(self.github.issue["state_reason"], "completed")

    def test_one_update_adds_one_issue(self) -> None:
        """An update that adds two in-scope issues is refused. The stored links stay empty, and there is no PATCH."""
        item = "WI-9099"
        second = f"https://github.com/{REPO}/issues/81"
        created = self.write(create("work_item", item, self.item([]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(self.store.read("work_item", item)["links"], [])
        self.github.calls.clear()
        refused = self.write(update("work_item", item, 1, {"links": [ISSUE, second]}, "Attach"))
        self.assertFalse(refused["ok"], refused)
        self.assertEqual(refused["error"], "invalid")
        self.assertEqual(refused["violations"][0]["message"], "One update adds one issue.")
        self.assertEqual(refused["violations"][0]["field"], "links")
        self.assertEqual(self.store.read("work_item", item)["links"], [])
        self.assertFalse(any("PATCH" in call for call in self.github.calls), self.github.calls)

    def test_a_newly_added_issue_gets_the_current_status(self) -> None:
        """A work item that already links issue 72, then gains a second in-scope issue and does not change status, patches that issue with the current status."""
        item = "WI-9087"
        added = f"https://github.com/{REPO}/issues/81"
        self.github.added_issue = {"body": "Keep this.", "state": "open", "state_reason": None, "labels": ["pinned"]}
        self.github.added_path = f"/repos/{REPO}/issues/81"
        created = self.write(create("work_item", item, self.item([ISSUE], "In Progress"), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(self.store.read("work_item", item)["status"], "In Progress")
        self.github.calls.clear()
        linked = self.write(update("work_item", item, 1, {"links": [ISSUE, added]}, "Attach"))
        self.assertTrue(linked["ok"], linked)
        self.assertEqual(self.store.read("work_item", item)["status"], "In Progress")
        self.assertEqual(self.store.read("work_item", item)["links"], [ISSUE, added])
        self.assertIn("PATCH /repos/tig/goalie/issues/81", self.github.calls)
        self.assertNotIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)
        self.assertEqual(set(self.github.added_issue["labels"]), {"pinned", "In Progress"})
        self.assertEqual(self.github.added_issue["state"], "open")
        self.assertIsNone(self.error(item))

    def test_search_returns_an_issue_and_a_pull_on_the_goal(self) -> None:
        """Search returns an issue and a pull request in an in-scope repo, and nothing from a repo the goal does not name."""
        set_scope(self.store, ["tig/*", "excaliwire/factory"], [{"repo": "github.com/tig/goalie"}, {"repo": "github.com/acme/other"}])
        self.github.installation_id = 99
        self.github.search = [
            {"html_url": ISSUE, "title": "Enable Github integration"},
            {"html_url": PULL, "title": "Show the link"},
            {"html_url": "https://github.com/excaliwire/factory/issues/3", "title": "Factory"},
            {"html_url": "https://github.com/acme/other/issues/1", "title": "Other"},
        ]
        self.github.calls.clear()
        self.github.queries.clear()
        reply = self.search_as("chelsea", "sub-chelsea", GOAL, "72")
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(json.loads(reply.body), {"items": [
            {"kind": "issue", "title": "Enable Github integration", "url": ISSUE},
            {"kind": "pull", "title": "Show the link", "url": PULL},
        ]})
        self.assertNotIn("POST /app/installations/77/access_tokens", self.github.calls)
        self.assertIn("POST /app/installations/99/access_tokens", self.github.calls)
        self.assertFalse(any("excaliwire" in call or "acme" in call for call in self.github.calls), self.github.calls)
        self.assertIn(f"repo:{REPO} 72", self.github.queries)
        before = self.github.calls.count("GET /search/issues")
        empty = self.search_as("chelsea", "sub-chelsea", GOAL, "")
        self.assertEqual(empty.status, 200, empty.body)
        self.assertEqual(json.loads(empty.body), {"items": []})
        self.assertEqual(self.github.calls.count("GET /search/issues"), before)
        missing = self.search_as("chelsea", "sub-chelsea", "NO-SUCH", "72")
        self.assertEqual(missing.status, 404, missing.body)
        self.assertEqual(json.loads(missing.body), {"error": "not_found", "reason": "no goal NO-SUCH"})

    def test_a_human_who_is_not_the_goalie_owner_gets_403(self) -> None:
        reply = self.status_as("chelsea", "sub-chelsea")
        self.assertEqual(reply.status, 403, reply.body)
        self.assertEqual(json.loads(reply.body)["error"], "forbidden")

    def test_a_due_date_sets_the_target_date(self) -> None:
        """A linked issue's Target date is the work item's due_date. Start date is not written."""
        self.github.issue_fields = [
            {"id": 4, "name": "Start date", "data_type": "date"},
            {"id": 9, "name": "Target date", "data_type": "date"},
        ]
        item = "WI-9141"
        created = self.write(create("work_item", item, {**self.item([ISSUE]), "due_date": "2027-03-31"}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(self.github.field_values, [{
            "path": f"/repos/{REPO}/issues/72/issue-field-values",
            "body": {"issue_field_values": [{"field_id": 9, "value": "2027-03-31"}]},
        }])
        self.assertNotIn(4, [entry.get("field_id") for body in self.github.field_values for entry in body["body"].get("issue_field_values", [])])
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Backlog"})

    def test_a_due_date_change_sets_the_target_date(self) -> None:
        """A due_date change, with status left at Backlog, queues the same push and sets Target date."""
        self.github.issue_fields = [
            {"id": 4, "name": "Start date", "data_type": "date"},
            {"id": 9, "name": "Target date", "data_type": "date"},
        ]
        item = "WI-9142"
        created = self.write(create("work_item", item, self.item([ISSUE]), "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertIsNone(self.store.read("work_item", item)["due_date"])
        self.github.calls.clear()
        self.github.field_values.clear()
        moved = self.write(update("work_item", item, 1, {"due_date": "2027-04-02"}, "Dated"))
        self.assertTrue(moved["ok"], moved)
        self.assertEqual(self.store.read("work_item", item)["status"], "Backlog")
        self.assertEqual(self.github.field_values, [{
            "path": f"/repos/{REPO}/issues/72/issue-field-values",
            "body": {"issue_field_values": [{"field_id": 9, "value": "2027-04-02"}]},
        }])
        self.assertIn("PATCH /repos/tig/goalie/issues/72", self.github.calls)

    def test_a_field_list_error_shows_the_failure(self) -> None:
        """A field list that answers 500 leaves the work item committed and does not set a date."""
        self.github.fail_issue_fields = True
        item = "WI-9143"
        created = self.write(create("work_item", item, {**self.item([ISSUE]), "due_date": "2027-03-31"}, "Filed"))
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["status"], "Backlog")
        self.assertEqual(stored["due_date"], "2027-03-31")
        self.assertIn("GitHub answered 500", self.error(item) or "")
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIn("GitHub answered 500", shown.get("github_error") or "")
        self.assertEqual(self.github.field_values, [])
        self.assertFalse(any("issue-field-values" in call for call in self.github.calls), self.github.calls)

    def test_a_forbidden_field_list_shows_the_failure(self) -> None:
        """A field list that answers 403 leaves the work item committed and does not set a date."""
        self.github.forbid_issue_fields = True
        item = "WI-9148"
        created = self.write(create("work_item", item, {**self.item([ISSUE]), "due_date": "2027-03-31"}, "Filed"))
        self.assertTrue(created["ok"], created)
        stored = self.store.read("work_item", item)
        self.assertEqual(stored["status"], "Backlog")
        self.assertEqual(stored["due_date"], "2027-03-31")
        self.assertIn("GitHub answered 403", self.error(item) or "")
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIn("GitHub answered 403", shown.get("github_error") or "")
        self.assertEqual(self.github.field_values, [])
        self.assertFalse(any(call.startswith("POST ") and "issue-field-values" in call for call in self.github.calls), self.github.calls)

    def test_a_missing_field_list_does_not_fail_the_push(self) -> None:
        """A 404 field list still sets the label. No date is set."""
        item = "WI-9144"
        created = self.write(create("work_item", item, {**self.item([ISSUE]), "due_date": "2027-03-31"}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Backlog"})
        self.assertIsNone(self.error(item))
        shown = next(row for row in self.goal_page()["workItems"] if row["id"] == item)
        self.assertIsNone(shown.get("github_error"))
        self.assertEqual(self.github.field_values, [])
        self.assertFalse(any("issue-field-values" in call for call in self.github.calls), self.github.calls)

    def test_a_missing_target_date_does_not_fail_the_push(self) -> None:
        """A field list with only Start date still completes the status push. No date is set."""
        self.github.issue_fields = [{"id": 4, "name": "Start date", "data_type": "date"}]
        item = "WI-9145"
        created = self.write(create("work_item", item, {**self.item([ISSUE]), "due_date": "2027-03-31"}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "Backlog"})
        self.assertIsNone(self.error(item))
        self.assertEqual(self.github.field_values, [])
        self.assertFalse(any("issue-field-values" in call for call in self.github.calls), self.github.calls)

    def test_a_null_due_date_does_not_call_the_field(self) -> None:
        """A null due_date does not read or set issue fields. The status label is still set."""
        self.github.issue_fields = [{"id": 9, "name": "Target date", "data_type": "date"}]
        item = "WI-9146"
        created = self.write(create("work_item", item, {**self.item([ISSUE]), "due_date": None}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.github.calls.clear()
        self.github.field_values.clear()
        moved = self.write(update("work_item", item, 1, {"status": "In Progress"}, "Started"))
        self.assertTrue(moved["ok"], moved)
        self.assertIsNone(self.store.read("work_item", item)["due_date"])
        self.assertEqual(set(self.github.issue["labels"]), {"pinned", "In Progress"})
        self.assertFalse(any(call.startswith("GET /orgs/") for call in self.github.calls), self.github.calls)
        self.assertEqual(self.github.field_values, [])
        self.assertFalse(any("issue-field-values" in call for call in self.github.calls), self.github.calls)

    def test_a_pull_request_is_not_dated(self) -> None:
        """A pull request is not an issue. A due_date on that work item does not set a field."""
        self.github.issue_fields = [
            {"id": 4, "name": "Start date", "data_type": "date"},
            {"id": 9, "name": "Target date", "data_type": "date"},
        ]
        item = "WI-9147"
        created = self.write(create("work_item", item, {**self.item([PULL]), "due_date": "2027-03-31"}, "Filed"))
        self.assertTrue(created["ok"], created)
        self.assertEqual(self.store.read("work_item", item)["links"], [PULL])
        self.assertFalse(any("issue-field-values" in call or call.startswith("GET /orgs/") for call in self.github.calls), self.github.calls)
        self.assertEqual(self.github.field_values, [])
        self.assertFalse(any("/pull/" in call for call in self.github.calls), self.github.calls)

    def test_a_ref_in_scope_returns_the_title_and_the_state(self) -> None:
        """The goal's scope is tig/goalie. GET the ref for issue 72. The fake issue title is Ship the gate and the state is open."""
        self.github.issue["title"] = "Ship the gate"
        self.github.issue["state"] = "open"
        reply = self.ref_as("tig", "sub-tig", GOAL, ISSUE)
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(json.loads(reply.body), {"title": "Ship the gate", "state": "open"})

    def test_a_ref_outside_the_goal_is_not_read(self) -> None:
        """A factory issue is not read when the goal's only associated repository is tig/goalie. The fake records no call."""
        self.github.calls.clear()
        reply = self.ref_as("tig", "sub-tig", GOAL, OTHER)
        self.assertEqual(reply.status, 404, reply.body)
        self.assertEqual(self.github.calls, [])
        self.assertNotIn(b"state", reply.body)

    def test_a_failed_ref_read_sets_no_state(self) -> None:
        """An issue GET that answers 500 returns the error sentence and no state."""
        self.github.fail_issue_get = True
        reply = self.ref_as("tig", "sub-tig", GOAL, ISSUE)
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(json.loads(reply.body), {"error": "GitHub answered 500 for GET /repos/tig/goalie/issues/72. no"})

    def search_as(self, actor: str, subject: str, goal: str, q: str) -> Reply:
        row = self.store.read("actor", actor)
        if row.get("subject") != subject:
            wrote = self.store.write("tig", update("actor", actor, row["version"], {"subject": subject}))
            self.assertTrue(wrote["ok"], wrote)
        token, issuers = signed(subject)
        path = "/api/github/search?" + urlencode({"goal": goal, "q": q})
        with running_server(self.store.path, {**self.env, **issuers}) as (proc, port):
            return get(proc, port, path, {"Authorization": f"Bearer {token}"})

    def ref_as(self, actor: str, subject: str, goal: str, url: str) -> Reply:
        row = self.store.read("actor", actor)
        if row.get("subject") != subject:
            wrote = self.store.write("tig", update("actor", actor, row["version"], {"subject": subject}))
            self.assertTrue(wrote["ok"], wrote)
        token, issuers = signed(subject)
        path = "/api/github/ref?" + urlencode({"goal": goal, "url": url})
        with running_server(self.store.path, {**self.env, **issuers}) as (proc, port):
            return get(proc, port, path, {"Authorization": f"Bearer {token}"})

    def status_as(self, actor: str, subject: str, env: dict[str, str] | None = None) -> Reply:
        row = self.store.read("actor", actor)
        if row.get("subject") != subject:
            wrote = self.store.write("tig", update("actor", actor, row["version"], {"subject": subject}))
            self.assertTrue(wrote["ok"], wrote)
        token, issuers = signed(subject)
        with running_server(self.store.path, {**self.env, **issuers, **(env or {})}) as (proc, port):
            return get(proc, port, "/api/github/status", {"Authorization": f"Bearer {token}"})

    def assert_trailer(self) -> None:
        body = self.github.issue["body"]
        self.assertIn("Keep this.", body)
        self.assertIn("<!-- goalie -->", body)
        self.assertIn(f"{PUBLIC}/goals/{GOAL}#work-item-{ITEM}", body)
        self.assertIn(ITEM, body)

    def error(self, item: str) -> str | None:
        db = sqlite3.connect(self.store.path)
        try:
            row = db.execute("SELECT error FROM github_push WHERE work_item = ?", (item,)).fetchone()
        finally:
            db.close()
        return None if row is None else row[0]

    def push_row(self, item: str) -> dict[str, Any] | None:
        db = sqlite3.connect(self.store.path)
        db.row_factory = sqlite3.Row
        try:
            found = db.execute("SELECT * FROM github_push WHERE work_item = ?", (item,)).fetchone()
        finally:
            db.close()
        return None if found is None else dict(found)

    def node(self, script: str) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            ["node", "--no-warnings", "--input-type=module", "-e", script],
            cwd=SERVER,
            env={**os.environ, **self.env, "GOALIE_DB": str(self.store.path), "GOALIE_TODAY": "2026-10-23"},
            capture_output=True,
            timeout=30,
        )

    def goal_page(self) -> dict[str, Any]:
        tig = self.store.read("actor", "tig")
        if tig["subject"] != "sub-tig":
            assert self.store.write("tig", update("actor", "tig", tig["version"], {"subject": "sub-tig"}))["ok"]
        token, env = signed("sub-tig")
        with running_server(self.store.path, env) as (proc, port):
            reply = get(proc, port, f"/api/goals/{GOAL}", {"Authorization": f"Bearer {token}"})
        self.assertEqual(reply.status, 200, reply.body)
        return json.loads(reply.body)


if __name__ == "__main__":
    unittest.main()
