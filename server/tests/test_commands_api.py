"""POST /api/commands runs a batch of writes in order, in one transaction (plan E-1 to E-5, B1)."""

from __future__ import annotations

import json
import unittest
from typing import Any

from goalie_cli import Store, update
from live_server import get, post, running_server, signed

GOAL = {
    "summary": "Launch the self-serve onboarding flow",
    "owner": "chelsea",
    "org_unit": "excaliwire",
    "level": "Company",
    "type": "Milestone (Launch)",
    "due_date": "2027-02-26",
    "date_type": "Fantasy",
    "plan_maturity": "Crayon",
    "severity": "sev2",
    "state": "Backlog",
    "origination": "New",
}
MILESTONE = {**GOAL, "summary": "Commit a date for the self-serve onboarding flow", "type": "Milestone (Commit)", "due_date": "2026-11-20", "date_type": "Committed", "plan": "docs/plans/self-serve.md", "plan_maturity": "Pencil"}
SUB = {**GOAL, "summary": "Write the onboarding copy for each step", "due_date": "2026-12-11", "date_type": "Committed", "plan": "docs/plans/copy.md", "plan_maturity": "Pencil"}


def create_batch(sub2: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """The plan's create order: the milestone, this goal, the milestone joins it, then two sub-goals."""
    return [
        {"op": "create", "kind": "goal", "ref": "$m", "fields": MILESTONE, "reason": "Planned"},
        {"op": "create", "kind": "goal", "ref": "$goal", "fields": {**GOAL, "promotion_milestone": "$m"}, "reason": "Planned"},
        {"op": "update", "kind": "goal", "id": "$m", "base_version": 1, "fields": {"parent": "$goal"}, "reason": "Planned"},
        {"op": "create", "kind": "goal", "ref": "$s1", "fields": {**SUB, "parent": "$goal"}, "reason": "Planned"},
        {"op": "create", "kind": "goal", "ref": "$s2", "fields": {**SUB, "summary": "Ship the onboarding flow to every new account", "parent": "$goal", **(sub2 or {})}, "reason": "Planned"},
    ]


class CommandsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        code, result = self.store.run("seed")
        assert code == 0, result
        chelsea = self.store.read("actor", "chelsea")
        assert self.store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        self.auth = {"Authorization": f"Bearer {token}"}
        server = running_server(self.store.path, env)
        self.proc, self.port = server.__enter__()
        self.addCleanup(server.__exit__, None, None, None)
        assert get(self.proc, self.port, "/health").status == 200

    def send(self, commands: list[dict[str, Any]], **extra: Any) -> tuple[int, dict[str, Any]]:
        reply = post(self.proc, self.port, "/api/commands", {"commands": commands, **extra}, self.auth)
        self.assertTrue(reply.content_type.startswith("application/json"), reply.content_type)
        return reply.status, json.loads(reply.body)

    def test_one_batch_stores_a_goal_its_milestone_and_its_sub_goals(self) -> None:
        status, body = self.send(create_batch())
        self.assertEqual(status, 200, body)
        self.assertEqual(body["ids"], {"$m": "XW-0012", "$goal": "XW-0013", "$s1": "XW-0014", "$s2": "XW-0015"})
        self.assertEqual(self.store.read("goal", "XW-0013")["promotion_milestone"], "XW-0012")
        self.assertEqual(self.store.read("goal", "XW-0012")["parent"], "XW-0013")
        self.assertEqual(self.store.read("goal", "XW-0015")["parent"], "XW-0013")
        self.assertTrue(all(e["reason"] == "Planned" for e in body["events"]))
        self.assertEqual({e["entity"] for e in body["events"]}, {"XW-0012", "XW-0013", "XW-0014", "XW-0015"})

    def test_one_broken_row_stores_nothing_and_names_its_command_and_field(self) -> None:
        status, body = self.send(create_batch({"plan_maturity": "Crayon"}))
        self.assertEqual(status, 422, body)
        self.assertEqual(body["at"], 4)
        violation = next(v for v in body["violations"] if v["rule"] == "committed-needs-pencil")
        self.assertEqual(violation["field"], "plan_maturity")
        for key in ("XW-0012", "XW-0013", "XW-0014"):
            self.assertIsNone(self.store.read("goal", key))

    def test_check_runs_the_batch_and_stores_nothing(self) -> None:
        status, body = self.send(create_batch(), check=True)
        self.assertEqual(status, 200, body)
        self.assertEqual(body["ids"]["$goal"], "XW-0013")
        self.assertIsNone(self.store.read("goal", "XW-0012"))
        status, body = self.send(create_batch({"plan_maturity": "Crayon"}), check=True)
        self.assertEqual((status, body["at"]), (422, 4))

    def test_check_returns_every_violation_with_its_command(self) -> None:
        # Product Designer, via the Frontend Engineer: the New goal rail undercounted with only the first refused command.
        batch = create_batch({"plan_maturity": "Crayon"})
        batch[3]["fields"] = {**batch[3]["fields"], "severity": None}
        status, body = self.send(batch, check=True)
        self.assertEqual((status, body["at"]), (422, 3))
        found = [(v["at"], v["rule"]) for v in body["all"]]
        self.assertIn((3, "required-field"), found)
        self.assertIn((4, "committed-needs-pencil"), found)
        self.assertEqual(body["violations"], [{k: v for k, v in x.items() if k != "at"} for x in body["all"] if x["at"] == 3])
        self.assertIsNone(self.store.read("goal", "XW-0012"))

    def test_a_check_lists_every_rule_one_command_breaks(self) -> None:
        # Product Designer's example: Committed, In Progress, no health, Plan Maturity Watercolor. Both rules count.
        fields = {**SUB, "state": "In Progress", "plan_maturity": "Watercolor"}
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": fields, "reason": "Planned"}], check=True)
        self.assertEqual(status, 422)
        self.assertEqual({v["rule"] for v in body["all"]}, {"committed-needs-pencil", "health-while-in-progress"})

    def test_a_check_skips_later_commands_on_an_entity_a_skipped_command_changed(self) -> None:
        # Codebase QA N4, measured by the Frontend Engineer: the later update answered stale and hid every refusal.
        milestone = {**MILESTONE, "state": "Backlog"}
        goal = {**GOAL, "state": "In Progress", "health": "YELLOW", "path_to_green": {"steps": [], "criteria": ""}, "promotion_milestone": "$m"}
        batch = [
            {"op": "create", "kind": "goal", "ref": "$m", "fields": milestone, "reason": "Planned"},
            {"op": "create", "kind": "goal", "ref": "$goal", "fields": goal, "reason": "Planned"},
            {"op": "update", "kind": "goal", "id": "$m", "base_version": 1, "fields": {"parent": "$goal"}, "reason": "Planned"},
            {"op": "update", "kind": "goal", "id": "$m", "base_version": 2, "fields": {"state": "In Progress", "health": "GREEN"}, "reason": "Started"},
        ]
        status, body = self.send(batch, check=True)
        self.assertEqual((status, body["error"]), (422, "invalid"), body)
        self.assertIn("ptg-when-yellow-or-red", [v["rule"] for v in body["all"] if v["at"] == 1])
        self.assertEqual(sorted(v["at"] for v in body["all"] if v["rule"] == "not-checked"), [2, 3])

    def test_a_check_and_a_save_give_the_same_versions(self) -> None:
        # Frontend Engineer: an In Progress create is version 2 after a save (Backlog, then In Progress), so a later update by ref names version 2.
        batch = [
            {"op": "create", "kind": "goal", "ref": "$g", "fields": {**SUB, "state": "In Progress", "health": "GREEN"}, "reason": "Started"},
            {"op": "update", "kind": "goal", "id": "$g", "base_version": 2, "fields": {"parent": "XW-0003"}, "reason": "Under the MLP"},
        ]
        status, body = self.send(batch, check=True)
        self.assertEqual(status, 200, body)
        status, body = self.send(batch)
        self.assertEqual(status, 200, body)
        self.assertEqual(self.store.read("goal", body["ids"]["$g"])["version"], 3)

    def test_a_missing_field_does_not_hide_the_other_rules(self) -> None:
        fields = {**SUB, "type": "Milestone (Launch)", "plan_maturity": "Crayon", "severity": None}
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": fields, "reason": "Planned"}])
        self.assertEqual(status, 422)
        self.assertEqual({(v["rule"], v.get("field")) for v in body["violations"]}, {("required-field", "severity"), ("committed-needs-pencil", "plan_maturity")})

    def test_a_check_skips_a_command_whose_ref_was_refused(self) -> None:
        batch = create_batch()
        batch[0]["fields"] = {**batch[0]["fields"], "due_date": "2026-13-45"}
        status, body = self.send(batch, check=True)
        self.assertEqual(status, 422)
        self.assertEqual({v["at"] for v in body["all"] if v["rule"] != "not-checked"}, {0})
        self.assertNotIn("unknown-ref", json.dumps(body))

    def test_a_check_lists_the_commands_it_could_not_check(self) -> None:
        # Codebase QA Q11: the skipped commands were silent, so the rail undercounted.
        batch = create_batch()
        batch[0]["fields"] = {**batch[0]["fields"], "due_date": "2026-13-45"}
        status, body = self.send(batch, check=True)
        skipped = sorted(v["at"] for v in body["all"] if v["rule"] == "not-checked")
        # $goal names the refused $m, and the sub-goals name the skipped $goal.
        self.assertEqual(skipped, [1, 2, 3, 4])
        self.assertTrue(all("$m" in v["message"] or "$goal" in v["message"] for v in body["all"] if v["rule"] == "not-checked"))

    def test_a_real_save_stops_at_the_first_refusal(self) -> None:
        batch = create_batch({"plan_maturity": "Crayon"})
        batch[3]["fields"] = {**batch[3]["fields"], "severity": None}
        status, body = self.send(batch)
        self.assertEqual((status, body["at"]), (422, 3))
        self.assertNotIn("all", body)

    def test_a_ref_used_before_it_is_made_is_a_bad_command(self) -> None:
        batch = create_batch()
        status, body = self.send([batch[1], batch[0]])
        self.assertEqual(status, 400, body)
        self.assertEqual((body["error"], body["at"]), ("bad_command", 0))
        self.assertIn("unknown-ref", body["message"])
        self.assertIsNone(self.store.read("goal", "XW-0012"))

    def test_only_goals_and_work_items_are_written_through_the_api(self) -> None:
        status, body = self.send([{"op": "update", "kind": "actor", "id": "chelsea", "base_version": 2, "fields": {"display_name": "C"}}])
        self.assertEqual((status, body["error"]), (400, "bad_command"))
        self.assertIn("api-kind", body["message"])

    def test_a_stale_update_answers_409_with_the_current_row(self) -> None:
        current = self.store.read("goal", "XW-0002")
        status, body = self.send([{"op": "update", "kind": "goal", "id": "XW-0002", "base_version": current["version"] - 1, "fields": {"health": "RED"}, "reason": "Worse"}])
        self.assertEqual((status, body["error"], body["at"]), (409, "stale", 0))
        self.assertEqual(body["current"]["version"], current["version"])
        self.assertEqual(body["current"]["health"], "YELLOW")

    def test_each_error_has_its_status(self) -> None:
        status, body = self.send([{"op": "update", "kind": "goal", "id": "XW-0999", "base_version": 1, "fields": {"summary": "Nothing here at all today"}}])
        self.assertEqual((status, body["error"]), (404, "not_found"))
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": {**SUB, "summary": "x"}, "reason": "r"}, {"op": "create", "kind": "goal", "ref": "$g", "fields": SUB, "reason": "r"}])
        self.assertEqual((status, body["error"]), (400, "bad_command"))
        reply = post(self.proc, self.port, "/api/commands", b"{not json", self.auth)
        self.assertEqual(reply.status, 400)
        self.assertEqual(json.loads(reply.body)["error"], "bad_command")
        reply = post(self.proc, self.port, "/api/commands", {"commands": []}, self.auth)
        self.assertEqual(reply.status, 400)

    def test_a_write_must_be_json(self) -> None:
        # Codebase QA: a text/plain or form body is what a cross-site form can send.
        body = json.dumps({"commands": [{"op": "comment", "kind": "goal", "id": "XW-0001", "text": "From a form"}]}).encode()
        for content_type in ("text/plain", "application/x-www-form-urlencoded"):
            reply = post(self.proc, self.port, "/api/commands", body, {**self.auth, "Content-Type": content_type})
            self.assertEqual(reply.status, 415, content_type)
        self.assertNotIn("From a form", [e["new"] for e in self.store.events()])

    def test_a_write_from_another_site_is_refused(self) -> None:
        commands = {"commands": [{"op": "comment", "kind": "goal", "id": "XW-0001", "text": "From evil"}]}
        reply = post(self.proc, self.port, "/api/commands", commands, {**self.auth, "Origin": "https://evil.example"})
        self.assertEqual(reply.status, 403)
        reply = post(self.proc, self.port, "/api/commands", commands, {**self.auth, "Origin": f"http://127.0.0.1:{self.port}"})
        self.assertEqual(reply.status, 200, reply.body)

    def test_a_body_and_a_comment_have_a_size_cap(self) -> None:
        reply = post(self.proc, self.port, "/api/commands", {"commands": [{"op": "comment", "kind": "goal", "id": "XW-0001", "text": "x" * 300_000}]}, self.auth)
        self.assertEqual(reply.status, 413)
        status, body = self.send([{"op": "comment", "kind": "goal", "id": "XW-0001", "text": "x" * 10_001}])
        self.assertEqual((status, body["violations"][0]["rule"]), (422, "comment-text"))

    def test_writes_need_a_verified_actor(self) -> None:
        reply = post(self.proc, self.port, "/api/commands", {"commands": create_batch()})
        self.assertEqual(reply.status, 401)
        self.assertIsNone(self.store.read("goal", "XW-0012"))

    def test_a_create_in_progress_is_stored_as_backlog_then_in_progress(self) -> None:
        fields = {**SUB, "state": "In Progress", "health": "GREEN"}
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": fields, "reason": "Started"}])
        self.assertEqual(status, 200, body)
        states = [(e["old"], e["new"]) for e in body["events"] if e["field"] == "state"]
        self.assertEqual(states, [(None, "Backlog"), ("Backlog", "In Progress")])
        self.assertEqual(self.store.read("goal", "XW-0012")["state"], "In Progress")

    def test_one_save_is_one_time(self) -> None:
        # Frontend Engineer: History groups a write by actor, time, and reason, so every Event of one batch shares one timestamp.
        status, body = self.send(create_batch() + [{"op": "comment", "kind": "goal", "id": "$goal", "text": "Made in one save."}])
        self.assertEqual(status, 200, body)
        self.assertGreater(len(body["events"]), 20)
        self.assertEqual(len({e["timestamp"] for e in body["events"]}), 1)

    def test_a_create_takes_the_defaults_the_form_shows(self) -> None:
        # N-F4: one home for the create defaults, write.ts DEFAULTS, which GET /api/options shows.
        options = json.loads(get(self.proc, self.port, "/api/options", self.auth).body)["defaults"]
        # A Milestone (Commit) needs no Pencil plan (D1), so the Watercolor default is valid here.
        fields = {k: v for k, v in SUB.items() if k not in ("severity", "state", "origination", "plan_maturity")} | {"type": "Milestone (Commit)"}
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": fields, "reason": "Planned"}])
        self.assertEqual(status, 200, body)
        stored = self.store.read("goal", body["ids"]["$g"])
        for field in ("severity", "state", "origination", "plan_maturity", "visibility", "description"):
            self.assertEqual(stored[field], options[field], field)

    def test_a_check_carries_the_lints_as_hints(self) -> None:
        # NF2: the summary hint comes from the server, on an ok check and an invalid one, never on a save.
        short = {**SUB, "summary": "Ship it"}
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": short, "reason": "Planned"}], check=True)
        self.assertEqual(status, 200, body)
        self.assertIn({"at": 0, "field": "summary", "text": "A good summary has a verb and 5 words or more."}, body["hints"])
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": {**short, "plan_maturity": "Crayon", "type": "Milestone (Launch)"}, "reason": "Planned"}], check=True)
        self.assertEqual(status, 422, body)
        self.assertIn("summary", [h["field"] for h in body["hints"] if h["at"] == 0])
        status, body = self.send([{"op": "create", "kind": "goal", "ref": "$g", "fields": short, "reason": "Planned"}])
        self.assertEqual(status, 200, body)
        self.assertNotIn("hints", body)

    def test_a_comment_is_one_event_with_no_row_change(self) -> None:
        version = self.store.read("goal", "XW-0003")["version"]
        status, body = self.send([{"op": "comment", "kind": "goal", "id": "XW-0003", "text": "The spine is in."}])
        self.assertEqual(status, 200, body)
        self.assertEqual(len(body["events"]), 1)
        event = body["events"][0]
        self.assertEqual((event["field"], event["old"], event["new"], event["reason"], event["actor"]), ("comment", None, "The spine is in.", "The spine is in.", "chelsea"))
        self.assertEqual(self.store.read("goal", "XW-0003")["version"], version)
        status, body = self.send([{"op": "comment", "kind": "goal", "id": "XW-0999", "text": "Hello"}])
        self.assertEqual(status, 404)

    def test_a_work_item_key_has_four_digits(self) -> None:
        status, body = self.send([{"op": "create", "kind": "work_item", "ref": "$w", "fields": {"goal": "XW-0007", "title": "Draw the goal page", "owner": "chelsea", "status": "In Progress"}, "reason": "Filed"}])
        self.assertEqual(status, 200, body)
        self.assertRegex(body["ids"]["$w"], r"^WI-\d{4}$")
        self.assertEqual(self.store.read("work_item", body["ids"]["$w"])["title"], "Draw the goal page")


if __name__ == "__main__":
    unittest.main()
