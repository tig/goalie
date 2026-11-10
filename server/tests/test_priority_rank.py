"""Drag to reorder on Home: one POST /api/commands batch sets the ranks of an org unit's current Priorities (SPEC.md §6.3)."""

from __future__ import annotations

import json
import sqlite3
import unittest
from typing import Any

from goalie_cli import Store, update
from live_server import get, post, running_server, signed_many


def rank(id: str, version: int, to: int, reason: str | None = "Growth comes first this quarter") -> dict[str, Any]:
    command: dict[str, Any] = {"op": "update", "kind": "priority", "id": id, "base_version": version, "fields": {"rank": to}}
    if reason is not None:
        command["reason"] = reason
    return command


class PriorityRankTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        code, result = self.store.run("seed")
        assert code == 0, result
        for actor in ("tig", "chelsea"):
            row = self.store.read("actor", actor)
            assert self.store.write("tig", update("actor", actor, row["version"], {"subject": f"sub-{actor}"}))["ok"]
        tokens, env = signed_many("sub-tig", "sub-chelsea")
        self.auth = {who: {"Authorization": f"Bearer {tokens[f'sub-{who}']}"} for who in ("tig", "chelsea")}
        server = running_server(self.store.path, env)
        self.proc, self.port = server.__enter__()
        self.addCleanup(server.__exit__, None, None, None)
        assert get(self.proc, self.port, "/health").status == 200

    def send(self, who: str, commands: list[dict[str, Any]], check: bool = False) -> tuple[int, Any]:
        reply = post(self.proc, self.port, "/api/commands", {"commands": commands, **({"check": True} if check else {})}, self.auth[who])
        return reply.status, json.loads(reply.body)

    def ranks(self) -> dict[str, int]:
        return {key: self.store.read("priority", key)["rank"] for key in ("PRI-1", "PRI-2", "PRI-3")}

    def rules(self, body: Any) -> list[str]:
        return [v["rule"] for v in body.get("all", body.get("violations", []))]

    def test_a_swap_in_one_batch_ties_on_the_way_and_is_saved(self) -> None:
        # PRI-1 moves to 2 first, while PRI-2 still holds 2. Ties are checked when the batch ends.
        status, body = self.send("tig", [rank("PRI-1", 1, 2), rank("PRI-2", 1, 1)])
        self.assertEqual(status, 200, body)
        self.assertEqual(self.ranks(), {"PRI-1": 2, "PRI-2": 1, "PRI-3": 3})
        # Each rank change is one Event, with the reason.
        self.assertEqual([(e["entity"], e["field"], e["old"], e["new"], e["reason"]) for e in body["events"]], [("PRI-1", "rank", 1, 2, "Growth comes first this quarter"), ("PRI-2", "rank", 2, 1, "Growth comes first this quarter")])

    def test_a_check_of_a_swap_is_ok_and_stores_nothing(self) -> None:
        status, body = self.send("tig", [rank("PRI-1", 1, 2), rank("PRI-2", 1, 1)], check=True)
        self.assertEqual(status, 200, body)
        self.assertEqual(self.ranks(), {"PRI-1": 1, "PRI-2": 2, "PRI-3": 3})

    def test_the_cut_line_stays_with_its_priority(self) -> None:
        status, body = self.send("tig", [rank("PRI-3", 1, 1), rank("PRI-1", 1, 2), rank("PRI-2", 1, 3)])
        self.assertEqual(status, 200, body)
        self.assertEqual([self.store.read("priority", key)["cut_line"] for key in ("PRI-1", "PRI-2", "PRI-3")], [None, None, True])

    def test_the_list_owner_moves_the_cut_line_in_one_batch(self) -> None:
        # Rule 35b: Home keeps the Backlog in its place, so a move writes the cut line onto the last Priority above it.
        def cut(key: str, value: bool, version: int = 1) -> dict[str, Any]:
            return {"op": "update", "kind": "priority", "id": key, "base_version": version, "fields": {"cut_line": value}, "reason": "Moved on Home."}

        status, body = self.send("chelsea", [cut("PRI-3", False), cut("PRI-2", True)])
        self.assertEqual(status, 422, body)
        self.assertIn("owner-ranks-priorities", self.rules(body))
        status, body = self.send("tig", [cut("PRI-3", False), cut("PRI-2", True)])
        self.assertEqual(status, 200, body)
        self.assertEqual([self.store.read("priority", key)["cut_line"] for key in ("PRI-1", "PRI-2", "PRI-3")], [None, True, False])
        # A new Priority can take the cut line as it is made.
        new = {"op": "create", "kind": "priority", "fields": {"org_unit": "excaliwire", "period": "2026-Q4", "rank": 4, "title": "X", "cut_line": True}, "reason": "Moved on Home."}
        status, body = self.send("tig", [cut("PRI-2", False, 2), new])
        self.assertEqual(status, 200, body)
        self.assertEqual(self.store.read("priority", "PRI-4")["cut_line"], True)

    def test_a_priority_retires_through_the_api_and_takes_no_other_status(self) -> None:
        # Ported from #94: a Priority its only goal leaves on Home retires, so ranks still run 1 to n.
        retire = {"op": "update", "kind": "priority", "id": "PRI-3", "base_version": 1, "fields": {"status": "Retired", "cut_line": False}, "reason": "Moved on Home."}
        status, body = self.send("tig", [{**retire, "fields": {"status": "Current"}}])
        self.assertEqual(status, 400, body)
        status, body = self.send("chelsea", [retire])
        self.assertEqual(status, 422, body)
        self.assertIn("owner-ranks-priorities", self.rules(body))
        status, body = self.send("tig", [retire])
        self.assertEqual(status, 200, body)
        self.assertEqual(self.store.read("priority", "PRI-3")["status"], "Retired")

    def test_ranks_end_one_to_n_with_no_gap_and_no_tie(self) -> None:
        status, body = self.send("tig", [rank("PRI-1", 1, 5)])
        self.assertEqual(status, 422, body)
        self.assertIn("ranks-one-to-n", self.rules(body))
        status, body = self.send("tig", [rank("PRI-1", 1, 2)])
        self.assertEqual(status, 422, body)
        self.assertIn("no-rank-ties", self.rules(body))
        self.assertEqual(self.ranks(), {"PRI-1": 1, "PRI-2": 2, "PRI-3": 3})

    def test_only_the_org_units_owner_or_the_goalie_owner_re_ranks(self) -> None:
        # SPEC.md §6.3: the list's owner is the org unit's owner. Tig owns excaliwire and is the GOALIE owner.
        status, body = self.send("chelsea", [rank("PRI-1", 1, 2), rank("PRI-2", 1, 1)])
        self.assertEqual(status, 422, body)
        self.assertIn("owner-ranks-priorities", self.rules(body))
        self.assertEqual(self.ranks(), {"PRI-1": 1, "PRI-2": 2, "PRI-3": 3})

    def test_the_priorities_view_says_who_may_rank_and_each_version(self) -> None:
        views = {who: json.loads(get(self.proc, self.port, "/api/priorities", self.auth[who]).body) for who in ("tig", "chelsea")}
        self.assertTrue(views["tig"]["mayRank"])
        self.assertFalse(views["chelsea"]["mayRank"])
        self.assertEqual({p["id"]: p["version"] for p in views["tig"]["funded"] + views["tig"]["backlog"]}, {"PRI-1": 1, "PRI-2": 1, "PRI-3": 1})

    def test_a_re_rank_needs_a_reason(self) -> None:
        status, body = self.send("tig", [rank("PRI-1", 1, 2, None), rank("PRI-2", 1, 1, None)])
        self.assertEqual(status, 422, body)
        self.assertIn("reason-required", self.rules(body))

    def test_a_goal_placed_first_on_home_gets_its_own_priority_in_one_batch(self) -> None:
        # Rule 35b: XW-0004 is a sub-goal. Dropped above number 1, it gets a new Priority at rank 1 and the others move down one.
        goal = self.store.read("goal", "XW-0004")
        new = {"op": "create", "kind": "priority", "ref": "$p1", "fields": {"org_unit": "excaliwire", "period": "2026-Q4", "rank": 1, "title": goal["summary"]}, "reason": "Moved on Home. Make it number 1."}
        moved = {"op": "update", "kind": "goal", "id": "XW-0004", "base_version": goal["version"], "fields": {"priority": "$p1", "parent": None}, "reason": "Moved on Home. Make it number 1."}
        status, body = self.send("tig", [rank("PRI-1", 1, 2), rank("PRI-2", 1, 3), rank("PRI-3", 1, 4), new, moved])
        self.assertEqual(status, 200, body)
        made = self.store.read("priority", "PRI-4")
        self.assertEqual((made["rank"], made["title"], made["status"]), (1, goal["summary"], "Current"))
        self.assertEqual((self.store.read("goal", "XW-0004")["priority"], self.store.read("goal", "XW-0004")["parent"]), ("PRI-4", None))
        self.assertEqual(self.ranks(), {"PRI-1": 2, "PRI-2": 3, "PRI-3": 4})
        # Only the list's owner makes a Priority.
        status, body = self.send("chelsea", [{**new, "fields": {**new["fields"], "rank": 5}}])
        self.assertEqual(status, 422, body)
        self.assertIn("owner-ranks-priorities", self.rules(body))

    def test_the_api_changes_only_a_priority_rank_or_cut_line_or_makes_one_with_its_list_period_rank_and_title(self) -> None:
        status, body = self.send("tig", [{"op": "update", "kind": "priority", "id": "PRI-1", "base_version": 1, "fields": {"title": "Renamed"}, "reason": "No"}])
        self.assertEqual(status, 400, body)
        status, body = self.send("tig", [{"op": "create", "kind": "priority", "fields": {"rank": 4}, "reason": "No"}])
        self.assertEqual(status, 400, body)
        status, body = self.send("tig", [{"op": "create", "kind": "priority", "fields": {"org_unit": "excaliwire", "period": "2026-Q4", "rank": 4, "title": "X", "description": "Y"}, "reason": "No"}])
        self.assertEqual(status, 400, body)
        with sqlite3.connect(self.store.path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM priority").fetchone()[0], 3)


if __name__ == "__main__":
    unittest.main()
