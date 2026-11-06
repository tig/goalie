"""A signed notice that an issue was closed updates the linked work item once (issue #72, phase 2).

completed sets status to Completed. not_planned and duplicate set status to Deleted. The write is the same
write as any other change of status: it names the version it read, and it is an Event. The actor is an agent
whose operator is the GOALIE owner. The reason names the GitHub login. A notice that matches the current
status writes nothing, including the echo of our own close. A bad signature, a reopen, and another repository
write nothing. An open event stream receives that Event. A stale retry that finds the work item no longer
names the issue writes nothing and queues no push.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import unittest
from typing import Any

from goalie_cli import SERVER, Store, create, update
from live_server import Reply, get, post, running_server, signed
from test_events_stream import Stream

REPO = "tig/goalie"
OTHER = "excaliwire/factory"
SECRET = "test-webhook-secret"
ACTOR = "github"
GOAL = "XW-0007"
EVIL = "https://github.com/evil/nope/issues/5"
QUIET = {
    "GOALIE_GITHUB_APP_ID": "",
    "GOALIE_GITHUB_INSTALLATION_ID": "",
    "GOALIE_GITHUB_PRIVATE_KEY_FILE": "",
    "GOALIE_GITHUB_API": "",
    "GOALIE_PUBLIC_URL": "",
    "GOALIE_GITHUB_WEBHOOK_SECRET": "",
    "GOALIE_GITHUB_ACTOR": "",
}


def sign(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def notice(number: int, *, action: str = "closed", reason: str = "completed", repo: str = REPO, login: str | None = "octocat") -> bytes:
    """The bytes GitHub would send. html_url names a different issue, so a reader that trusts it updates the wrong row."""
    payload: dict[str, Any] = {
        "action": action,
        "issue": {"number": number, "state_reason": reason, "html_url": EVIL},
        "repository": {"full_name": repo},
    }
    if login is not None:
        payload["sender"] = {"login": login}
    return json.dumps(payload, separators=(",", ":")).encode()


def set_scope(store: Store, repos: list[str], product: list[dict[str, str]] | None, goal: str = GOAL) -> None:
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


def item(number: int, *, status: str = "Backlog", slash: bool = False) -> dict[str, Any]:
    url = f"https://github.com/{REPO}/issues/{number}"
    return {"goal": GOAL, "title": f"Issue {number}", "owner": "tig", "status": status, "due_date": "2026-11-03", "links": [url + ("/" if slash else "")]}


class GitHubWebhookTests(unittest.TestCase):
    """One seeded store and one server. Each test uses its own issue number."""

    store: Store
    proc: Any
    port: int

    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed", env=QUIET)
        assert code == 0, result
        created = cls.store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        assert created["ok"], created
        set_scope(cls.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        cls.server = running_server(cls.store.path, {**QUIET, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR})
        cls.proc, cls.port = cls.server.__enter__()
        assert get(cls.proc, cls.port, "/health").status == 200

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.__exit__(None, None, None)
        cls.store.close()

    def deliver(self, body: bytes, *, event: str = "issues", signature: str | None = "") -> Reply:
        headers = {"X-GitHub-Event": event}
        if signature == "":
            headers["X-Hub-Signature-256"] = sign(SECRET, body)
        elif signature is not None:
            headers["X-Hub-Signature-256"] = signature
        return post(self.proc, self.port, "/api/github/webhook", body, headers)

    def file(self, entity: str, number: int, **extra: Any) -> None:
        result = self.store.run("write", "--as", "tig", stdin=create("work_item", entity, item(number, **extra), "Filed"), env=QUIET)[1]
        self.assertTrue(result["ok"], result)

    def events_after(self, sequence: int, entity: str) -> list[dict[str, Any]]:
        return [event for event in self.store.events() if event["sequence"] > sequence and event["entity"] == entity]

    def test_a_signed_completed_delivery_updates_each_linked_work_item_once(self) -> None:
        self.file("WI-9101", 101)
        self.file("WI-9102", 101, slash=True)
        self.file("WI-9103", 199)
        set_scope(self.store, ["tig/goalie", "evil/nope"], [{"repo": "github.com/tig/goalie"}, {"repo": "github.com/evil/nope"}])
        evil = self.store.run("write", "--as", "tig", stdin=create("work_item", "WI-9104", {**item(101), "title": "Wrong url", "links": [EVIL]}, "Filed"), env=QUIET)[1]
        self.assertTrue(evil["ok"], evil)
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        last = self.store.events()[-1]["sequence"]
        reply = self.deliver(notice(101))
        self.assertEqual(reply.status, 200, reply.body)
        for entity in ("WI-9101", "WI-9102"):
            row = self.store.read("work_item", entity)
            self.assertEqual(row["status"], "Completed")
            self.assertEqual(row["version"], 2)
            self.assertEqual(row["title"], f"Issue {101}")
            self.assertEqual(row["owner"], "tig")
            self.assertEqual(row["goal"], GOAL)
            self.assertEqual(row["due_date"], "2026-11-03")
            changed = self.events_after(last, entity)
            self.assertEqual(len(changed), 1, changed)
            event = changed[0]
            self.assertEqual((event["actor"], event["field"], event["old"], event["new"], event["reason"]), (ACTOR, "status", "Backlog", "Completed", "Closed on GitHub by octocat."))
        self.assertEqual(self.store.read("work_item", "WI-9103")["status"], "Backlog")
        self.assertEqual(self.store.read("work_item", "WI-9104")["status"], "Backlog")
        self.assertEqual(self.events_after(last, "WI-9103"), [])
        self.assertEqual(self.events_after(last, "WI-9104"), [])
        again = self.store.events()[-1]["sequence"]
        second = self.deliver(notice(101))
        self.assertEqual(second.status, 200, second.body)
        self.assertEqual(self.store.events()[-1]["sequence"], again)
        self.assertEqual(self.store.read("work_item", "WI-9101")["version"], 2)

    def test_our_own_close_does_not_write_again(self) -> None:
        self.file("WI-9105", 105)
        done = self.store.run("write", "--as", "tig", stdin=update("work_item", "WI-9105", 1, {"status": "Completed"}, "Shipped"), env=QUIET)[1]
        self.assertTrue(done["ok"], done)
        last = self.store.events()[-1]["sequence"]
        version = self.store.read("work_item", "WI-9105")["version"]
        reply = self.deliver(notice(105))
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(self.store.read("work_item", "WI-9105")["version"], version)
        self.assertEqual(self.events_after(last, "WI-9105"), [])

    def test_not_planned_and_duplicate_set_deleted(self) -> None:
        self.file("WI-9106", 106)
        self.file("WI-9107", 107)
        last = self.store.events()[-1]["sequence"]
        planned = self.deliver(notice(106, reason="not_planned"))
        duplicate = self.deliver(notice(107, reason="duplicate"))
        self.assertEqual(planned.status, 200, planned.body)
        self.assertEqual(duplicate.status, 200, duplicate.body)
        self.assertEqual(self.store.read("work_item", "WI-9106")["status"], "Deleted")
        self.assertEqual(self.store.read("work_item", "WI-9107")["status"], "Deleted")
        for entity in ("WI-9106", "WI-9107"):
            changed = self.events_after(last, entity)
            self.assertEqual([(event["actor"], event["new"]) for event in changed], [(ACTOR, "Deleted")])
            self.assertIn("octocat", changed[0]["reason"])

    def test_a_bad_signature_a_reopen_and_another_repository_write_nothing(self) -> None:
        self.file("WI-9108", 108, status="Completed")
        self.file("WI-9109", 109)
        self.file("WI-9110", 110)
        set_scope(self.store, ["tig/goalie", OTHER], [{"repo": "github.com/tig/goalie"}, {"repo": f"github.com/{OTHER}"}])
        other = self.store.run(
            "write", "--as", "tig",
            stdin=create("work_item", "WI-9111", {**item(3), "links": [f"https://github.com/{OTHER}/issues/3"]}, "Filed"),
            env=QUIET,
        )[1]
        self.assertTrue(other["ok"], other)
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        last = self.store.events()[-1]["sequence"]
        raw = notice(109)
        bad = self.deliver(raw[:-1] + b" ", signature=sign(SECRET, raw))
        short = self.deliver(notice(109), signature="sha256=abc")
        missing = self.deliver(notice(109), signature=None)
        opened = self.deliver(notice(109, action="opened"))
        reopened = self.deliver(notice(108, action="reopened", reason="reopened"))
        elsewhere = self.deliver(notice(3, repo=OTHER))
        ping = self.deliver(b'{"zen":"keep"}', event="ping")
        nameless = self.deliver(notice(110, login=None))
        self.assertEqual(bad.status, 401, bad.body)
        self.assertIn("signature", json.loads(bad.body)["reason"])
        self.assertEqual(short.status, 401, short.body)
        self.assertEqual(missing.status, 401, missing.body)
        for reply in (opened, reopened, elsewhere, ping, nameless):
            self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(self.store.events()[-1]["sequence"], last)
        self.assertEqual(self.store.read("work_item", "WI-9108")["status"], "Completed")
        self.assertEqual(self.store.read("work_item", "WI-9109")["status"], "Backlog")
        self.assertEqual(self.store.read("work_item", "WI-9110")["status"], "Backlog")
        self.assertEqual(self.store.read("work_item", "WI-9111")["status"], "Backlog")

    def test_a_body_over_the_cap_is_refused(self) -> None:
        reply = self.deliver(b'{"padding":"' + (b"x" * (256 * 1024)) + b'"}')
        self.assertEqual(reply.status, 413, reply.body)
        self.assertIn("256", json.loads(reply.body)["reason"])


class GitHubRepoScopeTests(unittest.TestCase):
    """A signed close applies only when the repository is in github_repos and on the goal. The names compare without case."""

    def test_a_signed_close_skips_a_goal_that_omits_the_repository(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        actor = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(actor["ok"], actor)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9601", item(601), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        set_scope(store, ["tig/goalie"], [{"url": "https://github.com/tig/goalie"}])
        last = store.events()[-1]["sequence"]
        body = notice(601)
        with running_server(store.path, {**QUIET, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(store.read("work_item", "WI-9601")["status"], "Backlog")
        self.assertEqual(store.events()[-1]["sequence"], last)

    def test_a_signed_close_matches_the_repository_without_case(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        actor = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(actor["ok"], actor)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/Tig/Goalie"}])
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9602", item(602), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        body = notice(602, repo="Tig/Goalie")
        with running_server(store.path, {**QUIET, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(store.read("work_item", "WI-9602")["status"], "Completed")


class GitHubWebhookConfigTests(unittest.TestCase):
    """A close is refused when the secret or the actor is missing. A repository outside github_repos changes nothing."""

    def refused(self, env: dict[str, str], *, login_actor: str | None = None) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        if login_actor == "other":
            made = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "chelsea"}), env=QUIET)[1]
            self.assertTrue(made["ok"], made)
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9120", item(120), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        last = store.events()[-1]["sequence"]
        body = notice(120)
        with running_server(store.path, {**QUIET, **env}) as (proc, port):
            assert get(proc, port, "/health").status == 200
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
        self.assertEqual(reply.status, 503, reply.body)
        self.assertIn("GitHub is not configured", json.loads(reply.body)["reason"])
        self.assertEqual(store.read("work_item", "WI-9120")["status"], "Backlog")
        self.assertEqual(store.events()[-1]["sequence"], last)

    def test_a_missing_secret_refuses_the_delivery(self) -> None:
        self.refused({"GOALIE_GITHUB_ACTOR": ACTOR})

    def test_a_repository_outside_github_repos_changes_nothing(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        made = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(made["ok"], made)
        set_scope(store, ["tig/goalie", "excaliwire/factory"], [{"repo": "github.com/tig/goalie"}])
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9121", item(121), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        set_scope(store, ["excaliwire/factory"], [{"repo": "github.com/tig/goalie"}])
        last = store.events()[-1]["sequence"]
        body = notice(121)
        with running_server(store.path, {**QUIET, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}) as (proc, port):
            assert get(proc, port, "/health").status == 200
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
        self.assertEqual(reply.status, 200, reply.body)
        self.assertEqual(store.read("work_item", "WI-9121")["status"], "Backlog")
        self.assertEqual(store.events()[-1]["sequence"], last)

    def test_a_missing_actor_refuses_the_delivery(self) -> None:
        self.refused({"GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR})

    def test_an_actor_operated_by_someone_else_refuses_the_delivery(self) -> None:
        self.refused({"GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}, login_actor="other")


class GitHubActorTests(unittest.TestCase):
    """The named agent may change status on a work item it does not own, and no other field."""

    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        code, result = self.store.run("seed", env=QUIET)
        assert code == 0, result
        set_scope(self.store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        for command in (
            create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}),
            create("actor", "side", {"kind": "agent", "display_name": "Side", "operator": "chelsea"}),
            create("work_item", "WI-9130", item(130), "Filed"),
        ):
            wrote = self.store.run("write", "--as", "tig", stdin=command, env=QUIET)[1]
            assert wrote["ok"], (command, wrote)

    def write_as(self, actor: str, command: dict[str, Any], named: str = ACTOR) -> Any:
        return self.store.run("write", "--as", actor, stdin=command, env={**QUIET, "GOALIE_GITHUB_ACTOR": named})[1]

    def test_the_named_agent_sets_status_and_nothing_else(self) -> None:
        result = self.write_as(ACTOR, update("work_item", "WI-9130", 1, {"status": "Completed"}, "Closed on GitHub by octocat."))
        self.assertTrue(result["ok"], result)
        row = self.store.read("work_item", "WI-9130")
        self.assertEqual(row["status"], "Completed")
        self.assertEqual(row["title"], "Issue 130")
        self.assertEqual(row["owner"], "tig")
        self.assertEqual([event["field"] for event in result["events"]], ["status"])
        self.assertEqual(result["events"][0]["actor"], ACTOR)
        for fields in (
            {"title": "Taken"},
            {"links": [EVIL]},
            {"owner": ACTOR},
            {"due_date": "2026-12-01"},
            {"goal": "XW-0001"},
            {"status": "Deleted", "title": "Taken"},
        ):
            refused = self.write_as(ACTOR, update("work_item", "WI-9130", 2, fields, "No"))
            self.assertFalse(refused["ok"], (fields, refused))
            self.assertIn("agent-own-work-items", [violation["rule"] for violation in refused["violations"]])
        self.assertEqual(self.store.read("work_item", "WI-9130")["title"], "Issue 130")
        self.assertEqual(self.store.read("work_item", "WI-9130")["status"], "Completed")

    def test_another_agent_and_another_operator_stay_refused(self) -> None:
        side = self.write_as("side", update("work_item", "WI-9130", 1, {"status": "Completed"}, "No"))
        self.assertFalse(side["ok"], side)
        self.assertIn("agent-own-work-items", [v["rule"] for v in side["violations"]])
        named = self.write_as("side", update("work_item", "WI-9130", 1, {"status": "Completed"}, "No"), named="side")
        self.assertFalse(named["ok"], named)
        self.assertEqual(self.store.read("work_item", "WI-9130")["status"], "Backlog")


# Relink the work item after setStatus has read it and before it writes. The retry must notice.
# The relink queues the new issue at Backlog. The retry does not write the work item.
STALE_RETRY = r"""
import { openStore } from "./src/store.ts";
import { read } from "./src/read.ts";
import { write } from "./src/write.ts";
import { setStatus } from "./src/github_notice.ts";

const db = openStore(process.env.GOALIE_DB);
const today = "2026-10-23";
const at = "2026-10-23T00:00:00Z";
const issue = "https://github.com/tig/goalie/issues/301";
const other = "https://github.com/tig/goalie/issues/302";
process.env.GOALIE_GITHUB_ACTOR = "github";

const fail = (detail) => {
  process.stdout.write(JSON.stringify(detail));
  db.close();
  process.exit(1);
};

const detached = await setStatus(db, "github", "WI-9302", "Completed", "Closed on GitHub by octocat.", today, issue);
const detachedRow = read(db, "work_item", "WI-9302");
if (!detached || detachedRow.status !== "Backlog") fail({ step: "detached", detached, status: detachedRow.status });

const relinked = await setStatus(db, "github", "WI-9301", "Completed", "Closed on GitHub by octocat.", today, issue, async () => {
  const row = read(db, "work_item", "WI-9301");
  const result = write(db, "tig", { op: "update", kind: "work_item", id: "WI-9301", base_version: row.version, fields: { links: [other] }, reason: "Relink" }, today, at);
  if (!result.ok) fail({ step: "relink", result });
});
const after = read(db, "work_item", "WI-9301");
const push = db.prepare("SELECT issue, status FROM github_push WHERE work_item = ?").get("WI-9301");
const statusEvent = db.prepare("SELECT actor, new FROM event WHERE entity = ? AND field = 'status' AND actor = 'github'").get("WI-9301");
if (!relinked || after.status !== "Backlog" || after.links[0] !== other || statusEvent) fail({ step: "retry", relinked, status: after.status, links: after.links, push, statusEvent });
if (!push || push.issue !== other || push.status !== "Backlog") fail({ step: "push", push });
db.close();
process.stdout.write("ok");
"""


# Move the work item after setStatus has read it. The goal it lands on does not name tig/goalie.
MOVED_GOAL = r"""
import { openStore } from "./src/store.ts";
import { read } from "./src/read.ts";
import { write } from "./src/write.ts";
import { setStatus } from "./src/github_notice.ts";
import { githubRepos, goalNamesRepo, repoInScope } from "./src/github.ts";

const db = openStore(process.env.GOALIE_DB);
const today = "2026-10-23";
const at = "2026-10-23T00:00:00Z";
const issue = "https://github.com/tig/goalie/issues/701";
const repo = "tig/goalie";
process.env.GOALIE_GITHUB_ACTOR = "github";

const fail = (detail) => {
  process.stdout.write(JSON.stringify(detail));
  db.close();
  process.exit(1);
};

const inScope = (row) => goalNamesRepo(db, row.goal, repo) && repoInScope(repo, githubRepos(db));
const moved = await setStatus(db, "github", "WI-9701", "Completed", "Closed on GitHub by octocat.", today, issue, async () => {
  const row = read(db, "work_item", "WI-9701");
  const result = write(db, "tig", { op: "update", kind: "work_item", id: "WI-9701", base_version: row.version, fields: { goal: "XW-0001" }, reason: "Move" }, today, at);
  if (!result.ok) fail({ step: "move", result });
}, inScope);
const after = read(db, "work_item", "WI-9701");
const statusEvent = db.prepare("SELECT actor, new FROM event WHERE entity = ? AND field = 'status' AND actor = 'github'").get("WI-9701");
if (!moved || after.status !== "Backlog" || after.goal !== "XW-0001" || statusEvent) fail({ step: "close", moved, status: after.status, goal: after.goal, statusEvent });
db.close();
process.stdout.write("ok");
"""


# Drop the repo entry after setStatus has read the work item. The work item itself stays put.
DROPPED_REPO = r"""
import { openStore } from "./src/store.ts";
import { read } from "./src/read.ts";
import { write } from "./src/write.ts";
import { setStatus } from "./src/github_notice.ts";
import { githubRepos, goalNamesRepo, repoInScope } from "./src/github.ts";

const db = openStore(process.env.GOALIE_DB);
const today = "2026-10-23";
const at = "2026-10-23T00:00:00Z";
const issue = "https://github.com/tig/goalie/issues/702";
const repo = "tig/goalie";
process.env.GOALIE_GITHUB_ACTOR = "github";

const fail = (detail) => {
  process.stdout.write(JSON.stringify(detail));
  db.close();
  process.exit(1);
};

const inScope = (row) => goalNamesRepo(db, row.goal, repo) && repoInScope(repo, githubRepos(db));
const dropped = await setStatus(db, "github", "WI-9702", "Completed", "Closed on GitHub by octocat.", today, issue, async () => {
  const goal = read(db, "goal", "XW-0007");
  const product = goal.work_product.filter((entry) => entry.repo !== "github.com/tig/goalie");
  const result = write(db, "tig", { op: "update", kind: "goal", id: "XW-0007", base_version: goal.version, fields: { work_product: product }, reason: "Drop the repository" }, today, at);
  if (!result.ok) fail({ step: "drop", result });
}, inScope);
const after = read(db, "work_item", "WI-9702");
const statusEvent = db.prepare("SELECT actor, new FROM event WHERE entity = ? AND field = 'status' AND actor = 'github'").get("WI-9702");
if (!dropped || after.status !== "Backlog" || after.version !== 1 || statusEvent) fail({ step: "close", dropped, status: after.status, version: after.version, statusEvent });
db.close();
process.stdout.write("ok");
"""


def run_close_script(store: Store, script: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["node", "--no-warnings", "--input-type=module", "-e", script],
        cwd=SERVER,
        env={**os.environ, **QUIET, "GOALIE_DB": str(store.path), "GOALIE_GITHUB_ACTOR": ACTOR, "GOALIE_TODAY": "2026-10-23"},
        capture_output=True,
        timeout=30,
    )


class GitHubWebhookLiveTests(unittest.TestCase):
    """A browser that already has the event stream open receives the status Event."""

    def test_an_open_stream_receives_the_status_event(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        tig = store.read("actor", "tig")
        subject = store.run("write", "--as", "tig", stdin=update("actor", "tig", tig["version"], {"subject": "sub-tig"}), env=QUIET)[1]
        self.assertTrue(subject["ok"], subject)
        actor = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(actor["ok"], actor)
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9401", item(401), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        token, issuers = signed("sub-tig")
        body = notice(401)
        with running_server(store.path, {**QUIET, **issuers, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            stream = Stream(port, {"Authorization": f"Bearer {token}"})
            self.addCleanup(stream.close)
            self.assertEqual(stream.response.status, 200)
            self.assertTrue(stream.response.getheader("Content-Type", "").startswith("text/event-stream"))
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
            self.assertEqual(reply.status, 200, reply.body)
            message = stream.next(within=1.0)
            self.assertIsNotNone(message, "the open stream did not receive the status Event")
            assert message is not None
            self.assertEqual(message["data"]["entity"], "WI-9401")
            self.assertEqual((message["data"]["actor"], message["data"]["field"], message["data"]["old"], message["data"]["new"]), (ACTOR, "status", "Backlog", "Completed"))
            self.assertEqual(message["data"]["reason"], "Closed on GitHub by octocat.")
            again = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
            self.assertEqual(again.status, 200, again.body)
            self.assertIsNone(stream.next(within=0.4), "a delivery that matches the current status published an Event")


class GitHubWebhookRetryTests(unittest.TestCase):
    """A stale retry writes nothing when the work item no longer names the delivered issue. The relink queues the new issue at the current status."""

    def test_a_stale_retry_does_not_write_a_relinked_work_item(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        for command in (
            create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}),
            create("work_item", "WI-9301", item(301), "Filed"),
            create("work_item", "WI-9302", item(302), "Filed"),
        ):
            wrote = store.run("write", "--as", "tig", stdin=command, env=QUIET)[1]
            self.assertTrue(wrote["ok"], (command["id"], wrote))
        proc = subprocess.run(
            ["node", "--no-warnings", "--input-type=module", "-e", STALE_RETRY],
            cwd=SERVER,
            env={**os.environ, **QUIET, "GOALIE_DB": str(store.path), "GOALIE_GITHUB_ACTOR": ACTOR, "GOALIE_TODAY": "2026-10-23"},
            capture_output=True,
            timeout=30,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout.decode() + proc.stderr.decode())
        self.assertEqual(proc.stdout.decode(), "ok")


class GitHubCloseScopeTests(unittest.TestCase):
    """A close is applied only when the work item still links the issue and the repository is still in scope."""

    def prepare(self, entity: str, number: int) -> Store:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        for command in (
            create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}),
            create("work_item", entity, item(number), "Filed"),
        ):
            wrote = store.run("write", "--as", "tig", stdin=command, env=QUIET)[1]
            self.assertTrue(wrote["ok"], (command["id"], wrote))
        return store

    def test_a_stale_retry_does_not_close_a_work_item_moved_to_another_goal(self) -> None:
        store = self.prepare("WI-9701", 701)
        proc = run_close_script(store, MOVED_GOAL)
        self.assertEqual(proc.returncode, 0, proc.stdout.decode() + proc.stderr.decode())
        self.assertEqual(proc.stdout.decode(), "ok")

    def test_a_close_does_not_apply_after_the_goal_drops_the_repository(self) -> None:
        store = self.prepare("WI-9702", 702)
        proc = run_close_script(store, DROPPED_REPO)
        self.assertEqual(proc.returncode, 0, proc.stdout.decode() + proc.stderr.decode())
        self.assertEqual(proc.stdout.decode(), "ok")


class GitHubStatusNoticeTests(unittest.TestCase):
    """A signed close is the last notice the GOALIE owner can see."""

    def test_a_signed_close_shows_inbound_ok(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        tig = store.read("actor", "tig")
        subject = store.run("write", "--as", "tig", stdin=update("actor", "tig", tig["version"], {"subject": "sub-tig"}), env=QUIET)[1]
        self.assertTrue(subject["ok"], subject)
        actor = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(actor["ok"], actor)
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9501", item(501), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        token, issuers = signed("sub-tig")
        body = notice(501)
        env = {**QUIET, **issuers, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}
        with running_server(store.path, env) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
            self.assertEqual(reply.status, 200, reply.body)
            status = get(proc, port, "/api/github/status", {"Authorization": f"Bearer {token}"})
        self.assertEqual(status.status, 200, status.body)
        got = json.loads(status.body)
        self.assertNotIn("privateKey", got)
        self.assertNotIn(SECRET, status.body.decode())
        self.assertTrue(got["inbound"]["ok"])
        self.assertEqual(got["inbound"]["detail"], "Closed tig/goalie#501.")

    def test_a_bad_signature_does_not_replace_the_last_notice(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        tig = store.read("actor", "tig")
        subject = store.run("write", "--as", "tig", stdin=update("actor", "tig", tig["version"], {"subject": "sub-tig"}), env=QUIET)[1]
        self.assertTrue(subject["ok"], subject)
        actor = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(actor["ok"], actor)
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9501", item(501), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        token, issuers = signed("sub-tig")
        body = notice(501)
        env = {**QUIET, **issuers, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}
        with running_server(store.path, env) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
            self.assertEqual(reply.status, 200, reply.body)
            bad = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": "sha256=abc"})
            self.assertEqual(bad.status, 401, bad.body)
            status = get(proc, port, "/api/github/status", {"Authorization": f"Bearer {token}"})
        self.assertEqual(status.status, 200, status.body)
        got = json.loads(status.body)
        self.assertEqual(got["inbound"]["detail"], "Closed tig/goalie#501.")

    def test_a_repeat_close_names_the_issue(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        code, result = store.run("seed", env=QUIET)
        self.assertEqual(code, 0, result)
        set_scope(store, ["tig/goalie"], [{"repo": "github.com/tig/goalie"}])
        tig = store.read("actor", "tig")
        subject = store.run("write", "--as", "tig", stdin=update("actor", "tig", tig["version"], {"subject": "sub-tig"}), env=QUIET)[1]
        self.assertTrue(subject["ok"], subject)
        actor = store.run("write", "--as", "tig", stdin=create("actor", ACTOR, {"kind": "agent", "display_name": "GitHub", "operator": "tig"}), env=QUIET)[1]
        self.assertTrue(actor["ok"], actor)
        filed = store.run("write", "--as", "tig", stdin=create("work_item", "WI-9501", item(501), "Filed"), env=QUIET)[1]
        self.assertTrue(filed["ok"], filed)
        token, issuers = signed("sub-tig")
        body = notice(501)
        env = {**QUIET, **issuers, "GOALIE_GITHUB_WEBHOOK_SECRET": SECRET, "GOALIE_GITHUB_ACTOR": ACTOR}
        with running_server(store.path, env) as (proc, port):
            self.assertEqual(get(proc, port, "/health").status, 200)
            reply = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
            self.assertEqual(reply.status, 200, reply.body)
            again = store.events()[-1]["sequence"]
            second = post(proc, port, "/api/github/webhook", body, {"X-GitHub-Event": "issues", "X-Hub-Signature-256": sign(SECRET, body)})
            self.assertEqual(second.status, 200, second.body)
            self.assertEqual(store.events()[-1]["sequence"], again)
            self.assertEqual(store.read("work_item", "WI-9501")["version"], 2)
            status = get(proc, port, "/api/github/status", {"Authorization": f"Bearer {token}"})
        self.assertEqual(status.status, 200, status.body)
        got = json.loads(status.body)
        self.assertEqual(got["inbound"]["detail"], "No linked work item changed for tig/goalie#501.")


if __name__ == "__main__":
    unittest.main()
