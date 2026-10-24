"""GET /api/goals/:id answers the goal page for one goal (plan B3, design G1 to G24)."""

from __future__ import annotations

import json
import unittest
from typing import Any

from goalie_cli import Store, update
from live_server import get, post, running_server, signed


class GoalPageApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        assert cls.store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        auth = {"Authorization": f"Bearer {token}"}
        with running_server(cls.store.path, env) as (proc, port):
            page = lambda key: get(proc, port, f"/api/goals/{key}", auth)  # noqa: E731
            assert page("XW-0001").status == 200
            batch = [
                {"op": "create", "kind": "work_item", "ref": "$w", "fields": {"goal": "XW-0007", "title": "Draw the goal page", "owner": "chelsea", "status": "In Progress", "due_date": "2026-10-01"}, "reason": "Filed"},
                {"op": "comment", "kind": "goal", "id": "XW-0007", "text": "The page is next."},
            ]
            reply = post(proc, port, "/api/commands", {"commands": batch}, auth)
            assert reply.status == 200, reply.body
            cls.item = json.loads(reply.body)["ids"]["$w"]
            cls.replies = {key: page(key) for key in ("XW-0001", "XW-0002", "XW-0003", "XW-0004", "XW-0007")}
            cls.missing = page("XW-0999")
            cls.anonymous = get(proc, port, "/api/goals/XW-0003")
        cls.pages: dict[str, dict[str, Any]] = {key: json.loads(reply.body) for key, reply in cls.replies.items()}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_a_goal_page_answers_json(self) -> None:
        for reply in self.replies.values():
            self.assertEqual(reply.status, 200)
        self.assertEqual(self.pages["XW-0003"]["goal"]["id"], "XW-0003")
        self.assertEqual(self.pages["XW-0003"]["me"], {"id": "chelsea", "name": "Chelsea", "kind": "human"})
        self.assertEqual(self.pages["XW-0003"]["today"], "2026-10-23")

    def test_no_such_goal_is_404_and_no_actor_is_401(self) -> None:
        self.assertEqual(self.missing.status, 404)
        self.assertEqual(set(json.loads(self.missing.body)), {"error", "reason"})
        self.assertEqual(self.anonymous.status, 401)

    def test_the_judged_date_comes_first(self) -> None:
        # G5: XW-0003 is Fantasy; health is judged on its Promotion Milestone's Committed date.
        page = self.pages["XW-0003"]
        self.assertEqual(page["dates"], [{"date": "2026-11-06", "kind": "Promotion Milestone"}, {"date": "2026-11-30", "kind": "Fantasy"}])
        self.assertFalse(page["inherited"])
        self.assertEqual(self.pages["XW-0001"]["dates"], [{"date": "2026-10-01", "kind": "Committed", "slipDays": 22}])

    def test_the_promotion_milestone_names_what_is_still_open(self) -> None:
        milestone = self.pages["XW-0003"]["promotionMilestone"]
        self.assertEqual((milestone["id"], milestone["date"], milestone["openSubGoals"]), ("XW-0004", "2026-11-06", 7))
        open_items = [w for w in self.pages["XW-0007"]["workItems"] if w["status"] not in ("Completed", "Deleted")]
        self.assertGreaterEqual(milestone["openWorkItems"], len(open_items))
        self.assertIsNone(self.pages["XW-0001"]["promotionMilestone"])

    def test_the_page_links_up_and_names_its_priority_and_org_unit(self) -> None:
        self.assertEqual(self.pages["XW-0004"]["parent"]["id"], "XW-0003")
        self.assertIsNone(self.pages["XW-0003"]["parent"])
        self.assertEqual(self.pages["XW-0003"]["priority"], {"id": "PRI-3", "rank": 3, "title": "Run Excaliwire on GOALIE"})
        self.assertEqual(self.pages["XW-0003"]["orgUnit"], {"id": "excaliwire", "name": "Excaliwire", "level": "Company"})

    def test_sub_goals_are_cards(self) -> None:
        cards = self.pages["XW-0004"]["subGoals"]
        self.assertEqual([c["id"] for c in cards], [f"XW-{n:04d}" for n in range(5, 12)])
        spine = cards[0]
        self.assertEqual((spine["state"], spine["health"], spine["dates"], spine["promotionMilestone"], spine["subGoals"]), ("In Progress", "GREEN", [], False, 0))
        page = next(c for c in cards if c["id"] == "XW-0007")
        live = [w for w in self.pages["XW-0007"]["workItems"] if w["status"] != "Deleted"]
        self.assertEqual(page["workItems"], {"completed": sum(w["status"] == "Completed" for w in live), "total": len(live)})
        three = self.pages["XW-0003"]["subGoals"]
        self.assertEqual([(c["id"], c["promotionMilestone"], c["subGoals"]) for c in three], [("XW-0004", True, 7)])

    def test_close_says_completed_or_completed_late(self) -> None:
        # G15: computed against original_committed_date and today (2026-10-23).
        self.assertEqual(self.pages["XW-0002"]["closesAs"], "Completed")
        self.assertEqual(self.pages["XW-0001"]["closesAs"], "Completed Late")
        self.assertIsNone(self.pages["XW-0003"]["closesAs"])

    def test_work_items_and_their_events_show_on_their_goal(self) -> None:
        page = self.pages["XW-0007"]
        mine = next(w for w in page["workItems"] if w["id"] == self.item)
        self.assertTrue(mine["late"])
        newest = page["events"][0]
        self.assertEqual((newest["field"], newest["new"]), ("comment", "The page is next."))
        self.assertIn(("work_item", self.item), {(e["entity_kind"], e["entity"]) for e in page["events"]})
        sequences = [e["sequence"] for e in page["events"]]
        self.assertEqual(sequences, sorted(sequences, reverse=True))
        self.assertEqual(page["needsYou"], {"lateWorkItems": [self.item], "missingPtg": False})

    def test_actors_name_every_id(self) -> None:
        page = self.pages["XW-0001"]
        self.assertEqual(page["actors"]["tig"], {"id": "tig", "name": "Tig", "kind": "human"})
        ids = {page["goal"]["owner"], *(e["actor"] for e in page["events"]), *(s["owner"] for s in page["goal"]["path_to_green"]["steps"])}
        self.assertLessEqual(ids, set(page["actors"]))

    def test_lints_come_back_as_hints(self) -> None:
        # §8.1: flagged, never blocked. XW-0001 is RED, so a missing trigger is not a hint; its description names no key results.
        fields = {h["field"] for h in self.pages["XW-0001"]["hints"]}
        self.assertIn("description", fields)
        self.assertNotIn("summary", fields)


if __name__ == "__main__":
    unittest.main()
