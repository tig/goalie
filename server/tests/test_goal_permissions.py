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

    def test_someone_who_owns_nothing_above_cannot_change_health(self) -> None:
        status, body = self.health("galahad", "XW-0001")
        self.assertEqual((status, body["error"]), (422, "invalid"), body)
        self.assertEqual(self.store.read("goal", "XW-0001")["health"], "RED")

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


if __name__ == "__main__":
    unittest.main()
