"""The seed loads Excaliwire and the #47 goal tree through the write path."""

from __future__ import annotations

import sqlite3
import unittest

from goalie_cli import Store


class SeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        code, self.result = self.store.run("seed")
        self.assertEqual(code, 0, self.result)

    def test_seed_loads_org_unit_humans_and_owner(self) -> None:
        unit = self.store.read("org_unit", "excaliwire")
        self.assertEqual(unit["level"], "Company")
        self.assertEqual(unit["owner"], "tig")
        for actor in ("tig", "chelsea"):
            self.assertEqual(self.store.read("actor", actor)["kind"], "human")
        self.assertEqual(self.store.read("owner_settings", "owner")["owner"], "tig")

    def test_seed_loads_the_three_excaliwire_goals(self) -> None:
        xw1 = self.store.read("goal", "XW-0001")
        self.assertEqual((xw1["owner"], xw1["due_date"], xw1["date_type"], xw1["health"]), ("tig", "2026-10-01", "Committed", "RED"))
        xw2 = self.store.read("goal", "XW-0002")
        self.assertEqual((xw2["owner"], xw2["due_date"], xw2["health"]), ("tig", "2026-11-15", "YELLOW"))
        for goal in (xw1, xw2):
            step = goal["path_to_green"]["steps"][0]
            self.assertEqual(step["owner"], "tig")
            self.assertTrue(step["date"])
        xw3 = self.store.read("goal", "XW-0003")
        self.assertEqual((xw3["owner"], xw3["due_date"], xw3["date_type"]), ("chelsea", "2026-11-30", "Fantasy"))
        mlp = self.store.read("goal", xw3["promotion_milestone"])
        self.assertEqual(mlp["summary"], "Run the MLP prototype at goalie.excaliwire.com with Excaliwire's real goals loaded")
        self.assertEqual((mlp["type"], mlp["due_date"], mlp["date_type"]), ("Milestone (Commit)", "2026-11-06", "Committed"))
        self.assertEqual(mlp["parent"], "XW-0003")

    def test_seed_loads_the_seven_mlp_sub_goals(self) -> None:
        mlp = self.store.read("goal", "XW-0003")["promotion_milestone"]
        children = [e for e in self.store.events() if e["field"] == "parent" and e["new"] == mlp]
        self.assertEqual(len(children), 7)

    def test_every_seeded_goal_passes_the_rules_and_the_summary_lint(self) -> None:
        code, report = self.store.run("check")
        self.assertEqual(code, 0, report)
        self.assertEqual(report["violations"], [])
        self.assertEqual(report["lints"], [])
        self.assertEqual(report["goals"], 11)

    def test_every_seed_event_names_an_actor_and_a_reason(self) -> None:
        events = self.store.events()
        self.assertTrue(events)
        for event in events:
            self.assertIn(event["actor"], ("tig", "chelsea"))
            self.assertTrue(event["reason"])

    def test_tig_writes_the_owner_settings(self) -> None:
        settings = self.store.read("owner_settings", "owner")
        self.assertEqual(settings["settings"]["goal_key_prefix"], "XW")
        actors = {e["actor"] for e in self.store.events() if e["entity_kind"] == "owner_settings"}
        self.assertEqual(actors, {"tig"})

    def test_a_new_goal_after_the_seed_takes_the_next_xw_key(self) -> None:
        fields = {**self.store.read("goal", "XW-0005"), "summary": "Ship the next MLP slice to Tig"}
        fields = {k: v for k, v in fields.items() if k not in ("id", "version", "original_committed_date", "committed_plan_version")}
        result = self.store.write("chelsea", {"op": "create", "kind": "goal", "fields": fields, "reason": "Planned"})
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["entity"]["id"], "XW-0012")

    def test_seed_refuses_a_store_that_is_not_empty(self) -> None:
        count = len(self.store.events())
        code, result = self.store.run("seed")
        self.assertNotEqual(code, 0)
        self.assertFalse(result["ok"])
        self.assertEqual(len(self.store.events()), count)


class SeedTransactionTests(unittest.TestCase):
    def test_a_rejected_seed_write_leaves_the_store_empty(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        store.run("events")
        # A row the seed will try to create. Foreign keys are off in this connection.
        with sqlite3.connect(store.path) as db:
            db.execute("INSERT INTO priority (id, version, org_unit, period, rank, title, status) VALUES ('PRI-2', 1, 'x', '2026-Q4', 9, 'x', 'Retired')")
        code, result = store.run("seed")
        self.assertNotEqual(code, 0, result)
        self.assertEqual(store.events(), [])
        self.assertIsNone(store.read("actor", "tig"))


class CheckTests(unittest.TestCase):
    def test_check_flags_a_short_summary(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        store.run("seed")
        goal = store.read("goal", "XW-0002")
        result = store.write("tig", {"op": "update", "kind": "goal", "id": "XW-0002", "base_version": goal["version"], "fields": {"summary": "Hire two humans"}})
        self.assertTrue(result["ok"], result)
        code, report = store.run("check")
        self.assertEqual(code, 0)
        self.assertEqual(len(report["lints"]), 1)
        self.assertIn("XW-0002", report["lints"][0])


if __name__ == "__main__":
    unittest.main()
