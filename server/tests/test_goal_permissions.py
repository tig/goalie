"""Who may change a goal (Chelsea's rule, via the Chief of Staff): the goal's owner, an owner of a goal above it in the parent chain, or the GOALIE owner. Others comment."""

from __future__ import annotations

import json
import unittest
from typing import Any

from goalie_cli import Store, create, update
from live_server import get, post, running_server, signed_many

PTG = {"steps": [{"text": "Find the missing chapters", "owner": "tig", "date": "2026-10-29"}], "criteria": "Every chapter regenerated"}


class GoalPermissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        for command in (
            update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}),
            update("actor", "tig", cls.store.read("actor", "tig")["version"], {"subject": "sub-tig"}),
            create("actor", "galahad", {"kind": "human", "display_name": "Galahad", "subject": "sub-galahad"}),
        ):
            result = cls.store.write("tig", command)
            assert result["ok"], (command, result)
        # A goal Galahad owns, under XW-0004, which Chelsea owns.
        sub = {"summary": "Write the release notes for the MLP", "owner": "galahad", "org_unit": "excaliwire", "level": "Company", "type": "Milestone (Launch)", "plan_maturity": "Crayon", "severity": "sev2", "state": "In Progress", "health": "GREEN", "origination": "New", "parent": "XW-0004"}
        result = cls.store.write("chelsea", create("goal", "XW-0099", sub, "Planned"))
        assert result["ok"], result
        # A third owner down the chain: Ana owns XW-0098 under Galahad's XW-0099, under Chelsea's XW-0004.
        assert cls.store.write("tig", create("actor", "ana", {"kind": "human", "display_name": "Ana"}))["ok"]
        result = cls.store.write("galahad", create("goal", "XW-0098", {**sub, "summary": "Proofread the release notes for the MLP", "owner": "ana", "parent": "XW-0099"}, "Planned"))
        assert result["ok"], result
        tokens, env = signed_many("sub-chelsea", "sub-tig", "sub-galahad")
        cls.auth = {name: {"Authorization": f"Bearer {tokens[f'sub-{name}']}"} for name in ("chelsea", "tig", "galahad")}
        server = running_server(cls.store.path, env)
        cls.proc, cls.port = server.__enter__()
        cls.addClassCleanup(server.__exit__, None, None, None)
        cls.addClassCleanup(cls.store.close)
        assert get(cls.proc, cls.port, "/health").status == 200

    def health(self, who: str, goal: str, health: str = "YELLOW") -> tuple[int, dict[str, Any]]:
        version = self.store.read("goal", goal)["version"]
        fields = {"health": health, "path_to_green": PTG if health != "GREEN" else None}
        reply = post(self.proc, self.port, "/api/commands", {"commands": [{"op": "update", "kind": "goal", "id": goal, "base_version": version, "fields": fields, "reason": "Checked the evidence"}]}, self.auth[who])
        return reply.status, json.loads(reply.body)

    def page(self, who: str, goal: str) -> dict[str, Any]:
        return json.loads(get(self.proc, self.port, f"/api/goals/{goal}", self.auth[who]).body)

    def send(self, who: str, commands: list[dict[str, Any]]) -> tuple[int, dict[str, Any]]:
        reply = post(self.proc, self.port, "/api/commands", {"commands": commands}, self.auth[who])
        return reply.status, json.loads(reply.body)

    def refused(self, status: int, body: dict[str, Any]) -> None:
        self.assertEqual((status, body.get("error")), (422, "invalid"), body)
        self.assertIn("owners-change-goal", [v["rule"] for v in body["violations"]], body)

    def test_someone_who_owns_nothing_above_cannot_change_health(self) -> None:
        # Product check 33.
        before = self.store.read("goal", "XW-0001")
        events = len(self.store.events())
        self.refused(*self.health("galahad", "XW-0001", "GREEN"))
        after = self.store.read("goal", "XW-0001")
        self.assertEqual((after["health"], after["version"]), (before["health"], before["version"]))
        self.assertEqual(len(self.store.events()), events)

    def test_every_field_a_human_writes_is_covered(self) -> None:
        # Product check 34.
        changes = {
            "health": "GREEN", "path_to_green": None, "state": "Deleted", "due_date": "2026-10-20", "date_type": "Ambition", "changed_due_date": "2026-12-01",
            "promotion_milestone": "XW-0004", "summary": "Regenerate the whole E28 canon now", "description": "New text.", "owner": "galahad", "parent": "XW-0003",
            "priority": "PRI-2", "plan": "docs/other.md", "plan_maturity": "Crayon", "severity": "sev3", "type": "Metric (Business)", "level": "Team",
            "org_unit": "elsewhere", "origination": "Carryover", "work_product": [{"repo": "github.com/tig/goalie"}], "visibility": "Restricted",
        }
        version = self.store.read("goal", "XW-0001")["version"]
        for field, value in changes.items():
            with self.subTest(field=field):
                self.refused(*self.send("galahad", [{"op": "update", "kind": "goal", "id": "XW-0001", "base_version": version, "fields": {field: value}, "reason": "Edited"}]))

    def test_an_owner_elsewhere_cannot_change_a_goal_outside_her_tree(self) -> None:
        # Product check 36: Chelsea owns XW-0007 but nothing above XW-0001.
        self.refused(*self.health("chelsea", "XW-0001"))
        self.assertEqual(self.health("chelsea", "XW-0007")[0], 200)

    def test_a_goal_under_a_parent_is_made_by_someone_who_may_change_the_parent(self) -> None:
        # Product check 39.
        goal = {"summary": "Draw the goal page by hand first", "owner": "galahad", "org_unit": "excaliwire", "level": "Company", "type": "Milestone (Launch)", "plan_maturity": "Crayon", "severity": "sev2", "state": "Backlog", "origination": "New", "due_date": "2026-11-05", "date_type": "Committed", "plan": "docs/plan.md"}
        self.refused(*self.send("galahad", [{"op": "create", "kind": "goal", "ref": "$g", "fields": {**goal, "parent": "XW-0007", "due_date": None, "date_type": None}, "reason": "Planned"}]))
        status, body = self.send("galahad", [{"op": "create", "kind": "goal", "ref": "$g", "fields": {**goal, "plan_maturity": "Pencil"}, "reason": "Planned"}])
        self.assertEqual(status, 200, body)

    def test_a_refused_command_stores_nothing_from_its_batch(self) -> None:
        # Product check 41.
        version = self.store.read("goal", "XW-0001")["version"]
        events = len(self.store.events())
        status, body = self.send("galahad", [
            {"op": "comment", "kind": "goal", "id": "XW-0001", "text": "Before the change."},
            {"op": "update", "kind": "goal", "id": "XW-0001", "base_version": version, "fields": {"severity": "sev3"}, "reason": "Edited"},
        ])
        self.refused(status, body)
        self.assertEqual(body["at"], 1)
        self.assertEqual(len(self.store.events()), events)

    def test_the_owner_of_a_goal_above_may_change_health(self) -> None:
        status, body = self.health("chelsea", "XW-0099")
        self.assertEqual(status, 200, body)

    def test_the_goalie_owner_may_change_any_goal(self) -> None:
        status, body = self.health("tig", "XW-0005")
        self.assertEqual(status, 200, body)

    def test_the_goals_own_owner_may_change_it(self) -> None:
        status, body = self.health("galahad", "XW-0099", "GREEN")
        self.assertEqual(status, 200, body)

    def test_anyone_may_comment(self) -> None:
        reply = post(self.proc, self.port, "/api/commands", {"commands": [{"op": "comment", "kind": "goal", "id": "XW-0001", "text": "I can help with the canon."}]}, self.auth["galahad"])
        self.assertEqual(reply.status, 200, reply.body)

    def test_the_goal_page_says_who_may_change_it(self) -> None:
        self.assertFalse(self.page("galahad", "XW-0001")["mayChange"])
        self.assertTrue(self.page("galahad", "XW-0099")["mayChange"])
        self.assertTrue(self.page("chelsea", "XW-0099")["mayChange"])
        self.assertTrue(self.page("tig", "XW-0005")["mayChange"])
        self.assertFalse(self.page("galahad", "XW-0004")["mayChange"])

    def test_the_goal_page_lists_who_may_change_it(self) -> None:
        # Product check 42: at most three, the owner, the nearest owner above who is not listed, the GOALIE owner last.
        self.assertEqual(self.page("galahad", "XW-0099")["changers"], [
            {"actor": "galahad", "as": "owner", "goal": "XW-0099"},
            {"actor": "chelsea", "as": "above", "goal": "XW-0004"},
            {"actor": "tig", "as": "goalie-owner", "goal": None},
        ])
        self.assertEqual(self.page("galahad", "XW-0001")["changers"], [{"actor": "tig", "as": "owner", "goal": "XW-0001"}])
        self.assertEqual(self.page("galahad", "XW-0005")["changers"], [{"actor": "chelsea", "as": "owner", "goal": "XW-0005"}, {"actor": "tig", "as": "goalie-owner", "goal": None}])
        for goal in ("XW-0099", "XW-0001", "XW-0005"):
            self.assertFalse(self.page("galahad", goal)["moreChangers"], goal)

    def test_more_changers_says_someone_was_left_out(self) -> None:
        # Ana, then the nearest owner above (Galahad), then the GOALIE owner; Chelsea, above Galahad, is left out.
        page = self.page("galahad", "XW-0098")
        self.assertEqual([(c["actor"], c["as"]) for c in page["changers"]], [("ana", "owner"), ("galahad", "above"), ("tig", "goalie-owner")])
        self.assertTrue(page["moreChangers"])

    def test_the_goal_page_names_the_owners_above(self) -> None:
        page = self.page("galahad", "XW-0099")
        self.assertEqual(page["above"], [{"id": "XW-0004", "owner": "chelsea"}, {"id": "XW-0003", "owner": "chelsea"}])
        self.assertIn("chelsea", page["actors"])
        self.assertEqual(self.page("galahad", "XW-0001")["above"], [])


if __name__ == "__main__":
    unittest.main()
