"""GET /api/my-goals is the My goals view (SPEC.md §8.2), and GET /api/goals?q= is goal search over every goal (#71)."""

from __future__ import annotations

import json
import unittest
from typing import Any

from goalie_cli import create
from test_priorities_api import OLD_GOAL, fetch, seeded_store

# Chelsea's goals in the seed: XW-0003 on PRI-3, and XW-0004 to XW-0011 under it.
SEEDED_MINE = {f"XW-{n:04d}" for n in range(3, 12)}


class MyGoalsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = seeded_store()
        mine = {**OLD_GOAL, "owner": "chelsea", "state": "Backlog", "health": None, "path_to_green": None}
        writes = [
            # #71: a goal saved with Priority None, on no parent, is on no other screen.
            create("goal", "XW-0095", {**mine, "summary": "Ship a goal with no priority"}, "Test data"),
            create("goal", "XW-0096", {**mine, "summary": "A Completed goal of mine", "state": "Completed"}, "Test data"),
            create("goal", "XW-0097", {**mine, "summary": "A Deleted goal of mine", "state": "Deleted"}, "Test data"),
        ]
        for command in writes:
            result = cls.store.write("chelsea", command)
            assert result["ok"], (command, result)
        (mine_reply, hits, upper, blank), cls.anonymous = fetch(cls.store, "/api/my-goals", "/api/goals?q=no%20priority", "/api/goals?q=XW-0097", "/api/goals?q=%20")
        cls.body = json.loads(mine_reply.body)
        cls.rows: dict[str, dict[str, Any]] = {g["id"]: g for g in cls.body["goals"]}
        cls.hits = json.loads(hits.body)
        cls.upper = json.loads(upper.body)
        cls.blank = blank

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_no_verified_actor_answers_401(self) -> None:
        self.assertEqual(self.anonymous.status, 401)

    def test_the_view_is_my_goals_with_its_saved_columns(self) -> None:
        self.assertEqual(self.body["view"]["name"], "My goals")
        self.assertEqual(self.body["view"]["columns"], ["Summary", "Priority", "State", "Health", "Date Type", "Promotion Milestone", "PTG"])
        self.assertEqual(self.body["me"], {"id": "chelsea", "name": "Chelsea"})

    def test_it_holds_every_open_goal_i_own_and_no_other(self) -> None:
        self.assertEqual(set(self.rows), SEEDED_MINE | {"XW-0095"})

    def test_a_goal_with_no_priority_is_in_it(self) -> None:
        self.assertIsNone(self.rows["XW-0095"]["priority"])

    def test_a_sub_goal_names_the_priority_it_serves_through_its_parent(self) -> None:
        self.assertEqual(self.rows["XW-0003"]["priority"], self.rows["XW-0011"]["priority"])
        self.assertIsNotNone(self.rows["XW-0011"]["priority"])

    def test_it_sorts_red_yellow_green_then_no_health(self) -> None:
        order = {"RED": 0, "YELLOW": 1, "GREEN": 2, None: 3}
        ranks = [order[g["health"]] for g in self.body["goals"]]
        self.assertEqual(ranks, sorted(ranks))

    def test_search_finds_a_goal_with_no_priority(self) -> None:
        self.assertEqual([g["id"] for g in self.hits["goals"]], ["XW-0095"])
        self.assertEqual(self.hits["goals"][0]["owner"], {"id": "chelsea", "name": "Chelsea"})
        self.assertIsNone(self.hits["goals"][0]["priority"])

    def test_search_finds_a_deleted_goal_by_its_key(self) -> None:
        # SPEC.md §8.1: deleted records stay findable.
        self.assertEqual([(g["id"], g["state"]) for g in self.upper["goals"]], [("XW-0097", "Deleted")])

    def test_search_with_no_text_is_refused(self) -> None:
        self.assertEqual(self.blank.status, 400)


if __name__ == "__main__":
    unittest.main()
