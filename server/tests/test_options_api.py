"""GET /api/options answers what New goal, + Sub-goal, and + Work item offer (plan B3, design N1 to N16)."""

from __future__ import annotations

import json
import unittest

from goalie_cli import Store, update
from live_server import get, running_server, signed


class OptionsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        store = Store()
        code, result = store.run("seed")
        assert code == 0, result
        chelsea = store.read("actor", "chelsea")
        assert store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        with running_server(store.path, env) as (proc, port):
            cls.reply = get(proc, port, "/api/options", {"Authorization": f"Bearer {token}"})
        store.close()
        cls.body = json.loads(cls.reply.body)

    def test_options_answer_json(self) -> None:
        self.assertEqual(self.reply.status, 200)
        self.assertEqual(self.body["me"], {"id": "chelsea", "name": "Chelsea", "kind": "human"})
        self.assertEqual(self.body["today"], "2026-10-23")

    def test_the_next_keys_are_the_ones_create_will_make(self) -> None:
        self.assertEqual(self.body["nextGoalKeys"][:3], ["XW-0012", "XW-0013", "XW-0014"])

    def test_the_form_offers_the_org_unit_its_priorities_and_its_actors(self) -> None:
        self.assertEqual(self.body["orgUnit"], {"id": "excaliwire", "name": "Excaliwire", "level": "Company"})
        self.assertEqual([p["rank"] for p in self.body["priorities"]], [1, 2, 3])
        self.assertIn({"id": "tig", "name": "Tig", "kind": "human"}, self.body["actors"])

    def test_defaults_and_choices_come_from_spec_and_owner_settings(self) -> None:
        defaults = self.body["defaults"]
        self.assertEqual((defaults["org_unit"], defaults["level"], defaults["origination"], defaults["visibility"]), ("excaliwire", "Company", "New", "organization-wide"))
        choices = self.body["choices"]
        self.assertEqual(choices["type"][0], "Milestone (Commit)")
        self.assertEqual(len(choices["type"]), 5)
        self.assertEqual(choices["severity"], ["sev1", "sev2", "sev3"])
        self.assertEqual(choices["plan_maturity"], ["Watercolor", "Crayon", "Pencil"])
        self.assertEqual(choices["workItemStatus"], ["Backlog", "In Progress", "Completed", "Deleted"])
        self.assertIn(defaults["type"], choices["type"])
        self.assertTrue(self.body["workItems"])
        self.assertEqual(self.body["promotionMilestoneType"], "Milestone (Commit)")


if __name__ == "__main__":
    unittest.main()
