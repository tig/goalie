"""GET /api/priorities is the Priorities view for the signed-in actor, as JSON (SPEC.md §8.2, ADR 0003). The app draws and filters it."""

from __future__ import annotations

import datetime
import json
import unittest
from typing import Any

from goalie_cli import Store, create, update
from live_server import TODAY, Reply, get, running_server, signed


def days_since(iso: str) -> int:
    """Days from iso to the pinned TODAY, never the wall clock."""
    return (datetime.date.fromisoformat(TODAY) - datetime.date.fromisoformat(iso)).days


def flatten(goals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [g for goal in goals for g in [goal, *flatten(goal["children"])]]


def goals_of(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {g["id"]: g for p in body["funded"] + body["backlog"] for g in flatten(p["goals"])}


def seeded_store() -> Store:
    store = Store()
    code, result = store.run("seed")
    assert code == 0, result
    chelsea = store.read("actor", "chelsea")
    # Only the GOALIE owner, Tig, writes an actor row.
    result = store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))
    assert result["ok"], result
    return store


def fetch(store: Store, *paths: str, env: dict[str, str] | None = None) -> tuple[list[Reply], Reply]:
    """GET each path signed in as Chelsea, then the first path with no token."""
    token, issuers = signed("sub-chelsea")
    with running_server(store.path, {**issuers, **(env or {})}) as (proc, port):
        replies = [get(proc, port, path, {"Authorization": f"Bearer {token}"}) for path in paths]
        anonymous = get(proc, port, paths[0])
    return replies, anonymous


class PrioritiesApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = seeded_store()
        (cls.reply, cls.filtered), cls.anonymous = fetch(cls.store, "/api/priorities", "/api/priorities?health=RED&q=zzzz")
        cls.body = json.loads(cls.reply.body)
        cls.goals = goals_of(cls.body)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_signed_in_answers_json(self) -> None:
        self.assertEqual(self.reply.status, 200)
        self.assertTrue(self.reply.content_type.startswith("application/json"), self.reply.content_type)

    def test_no_verified_actor_answers_401_with_the_reason(self) -> None:
        self.assertEqual(self.anonymous.status, 401)
        self.assertTrue(self.anonymous.content_type.startswith("application/json"), self.anonymous.content_type)
        body = json.loads(self.anonymous.body)
        self.assertEqual(set(body), {"error", "reason"})
        self.assertIn("no token", body["reason"])
        self.assertNotIn(b"XW-0001", self.anonymous.body)

    def test_me_is_the_signed_in_actor(self) -> None:
        self.assertEqual(self.body["me"], {"id": "chelsea", "name": "Chelsea"})

    def test_the_view_names_the_org_unit_and_the_saved_definition(self) -> None:
        self.assertEqual(self.body["org"], {"id": "excaliwire", "name": "Excaliwire", "level": "Company"})
        self.assertEqual(self.body["view"]["name"], "Priorities")
        self.assertEqual(self.body["view"]["columns"], ["Summary", "Owner", "Health", "Date Type", "Promotion Milestone", "PTG"])
        self.assertEqual(self.body["today"], TODAY)

    def test_priorities_are_in_rank_order_and_the_cut_line_splits_them(self) -> None:
        self.assertEqual([p["rank"] for p in self.body["funded"]], [1, 2, 3])
        self.assertEqual([p["id"] for p in self.body["funded"]], ["PRI-1", "PRI-2", "PRI-3"])
        self.assertEqual(self.body["backlog"], [])
        self.assertEqual([g["id"] for g in self.body["funded"][0]["goals"]], ["XW-0001"])

    def test_every_date_has_its_date_type(self) -> None:
        self.assertEqual(self.goals["XW-0002"]["dates"], [{"date": "2026-11-15", "kind": "Committed"}])
        self.assertEqual(self.goals["XW-0003"]["dates"], [{"date": "2026-11-30", "kind": "Fantasy"}, {"date": "2026-11-06", "kind": "Promotion Milestone"}])

    def test_a_sub_goal_date_is_listed_only_when_it_differs_from_its_parent(self) -> None:
        self.assertEqual(self.goals["XW-0004"]["dates"], [{"date": "2026-11-06", "kind": "Committed"}])
        self.assertEqual(self.goals["XW-0005"]["dates"], [])

    def test_a_slip_names_its_days_past_the_committed_date(self) -> None:
        days = days_since("2026-10-01")
        self.assertEqual(days, 22)
        self.assertEqual(self.goals["XW-0001"]["dates"], [{"date": "2026-10-01", "kind": "Committed", "slipDays": days}])
        self.assertEqual(self.body["summary"]["slips"], [{"goal": "XW-0001", "summary": self.goals["XW-0001"]["summary"], "date": "2026-10-01", "kind": "Committed", "days": days}])

    def test_goalie_own_goal_tree_is_open_under_xw_0003(self) -> None:
        xw3 = self.body["funded"][2]["goals"][0]
        self.assertEqual(xw3["id"], "XW-0003")
        self.assertEqual([g["id"] for g in xw3["children"]], ["XW-0004"])
        self.assertEqual([g["id"] for g in xw3["children"][0]["children"]], [f"XW-{n:04d}" for n in range(5, 12)])
        self.assertEqual(self.goals["XW-0005"]["summary"], "Stand up the spine: store, rules, sign-in, event log")

    def test_owners_and_health_are_named(self) -> None:
        self.assertEqual(self.goals["XW-0001"]["owner"], {"id": "tig", "name": "Tig"})
        self.assertEqual([self.goals[g]["health"] for g in ("XW-0001", "XW-0002", "XW-0003")], ["RED", "YELLOW", "GREEN"])
        self.assertIsNone(self.goals["XW-0006"]["health"])

    def test_a_path_to_green_is_given_only_when_not_green(self) -> None:
        self.assertEqual(self.goals["XW-0001"]["ptg"], {"text": "Placeholder: Tig writes the Path to Green", "owner": {"id": "tig", "name": "Tig"}, "date": "2026-10-29"})
        self.assertNotIn("ptg", self.goals["XW-0003"])

    def test_started_is_a_date(self) -> None:
        for goal in self.goals.values():
            datetime.date.fromisoformat(goal["started"])

    def test_the_summary_counts_each_health_above_the_cut_line(self) -> None:
        summary = self.body["summary"]
        self.assertEqual(summary["counts"], {"RED": 1, "YELLOW": 1, "GREEN": 1})
        self.assertEqual(summary["healths"], ["RED", "YELLOW", "GREEN"])
        self.assertEqual(summary["drafts"], 0)

    def test_the_promotion_milestone_due_is_counted_in_days(self) -> None:
        days = -days_since("2026-11-06")
        self.assertEqual(days, 14)
        self.assertEqual(self.body["summary"]["nextPromotion"], {"milestone": "XW-0004", "date": "2026-11-06", "days": days, "goal": "XW-0003", "summary": self.goals["XW-0003"]["summary"]})

    def test_the_server_does_not_filter_or_draw(self) -> None:
        self.assertEqual(json.loads(self.filtered.body), self.body)
        text = self.reply.body.decode("utf-8")
        for drawn in ('"lane"', '"weeks"', '"label"', '"depth"', '"match"', "Committed Oct 1"):
            self.assertNotIn(drawn, text)


class PrioritiesDefinitionTests(unittest.TestCase):
    """The API keeps the saved definition: open goals at the org unit's level, and current-period Priorities."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.store = seeded_store()
        period = "2026-Q4"
        owner_writes = [
            create("org_unit", "xw-team", {"name": "XW Team", "level": "Team", "parent": "excaliwire", "owner": "tig"}, "Test data"),
            create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": "tig"}),
        ]
        for command in owner_writes:
            result = cls.store.write("tig", command)
            assert result["ok"], (command, result)
        writes = [
            create("priority", "PRI-4", {"org_unit": "excaliwire", "period": period, "rank": 4, "title": "An empty Priority", "status": "Current"}, "Test data"),
            create("priority", "PRI-OLD", {"org_unit": "excaliwire", "period": "2020-Q1", "rank": 5, "title": "A Priority of an old period", "status": "Current"}, "Test data"),
            create("goal", "XW-0090", {**OLD_GOAL, "summary": "An old Committed date in the view", "priority": "PRI-1"}, "Test data"),
            create("goal", "XW-0091", {**OLD_GOAL, "summary": "A Team goal on a company Priority", "priority": "PRI-1", "org_unit": "xw-team", "level": "Team"}, "Test data"),
            create("goal", "XW-0092", {**OLD_GOAL, "summary": "A Completed goal", "priority": "PRI-2", "state": "Completed", "health": None, "path_to_green": None}, "Test data"),
        ]
        drafts = [
            create("draft", "DR-1", {"entity": "XW-0001", "actor": "bot", "base_version": 1, "change": {"health": "YELLOW"}, "reason": "test"}, "Test data"),
            create("draft", "DR-2", {"entity": "XW-0091", "actor": "bot", "base_version": 1, "change": {"health": "YELLOW"}, "reason": "A goal outside the view"}, "Test data"),
        ]
        for actor, command in [*(("chelsea", c) for c in writes), *(("bot", c) for c in drafts)]:
            result = cls.store.write(actor, command)
            assert result["ok"], (command, result)
        (reply,), _ = fetch(cls.store, "/api/priorities")
        cls.body = json.loads(reply.body)
        cls.goals = goals_of(cls.body)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_an_empty_priority_is_listed_below_the_cut_line_with_its_rank(self) -> None:
        self.assertEqual(self.body["backlog"], [{"id": "PRI-4", "rank": 4, "title": "An empty Priority", "goals": []}])

    def test_a_priority_of_another_period_is_not_listed(self) -> None:
        self.assertNotIn("PRI-OLD", json.dumps(self.body))

    def test_a_goal_at_another_level_is_not_listed(self) -> None:
        self.assertNotIn("XW-0091", self.goals)

    def test_a_completed_goal_is_not_listed(self) -> None:
        self.assertNotIn("XW-0092", self.goals)

    def test_an_old_committed_date_is_a_slip(self) -> None:
        self.assertEqual(self.goals["XW-0090"]["dates"], [{"date": "2025-01-15", "kind": "Committed", "slipDays": days_since("2025-01-15")}])

    def test_the_drafts_count_counts_only_this_views_drafts(self) -> None:
        # Review E20: DR-2 is on a goal the view does not show.
        self.assertEqual(self.body["summary"]["drafts"], 1)


class TodayTests(unittest.TestCase):
    """Today is the org's calendar day (review: at 18:40 MDT the API said tomorrow). GOALIE_TODAY pins it."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.store = seeded_store()
        # Kiritimati is UTC+14 and Pago Pago is UTC-11. Their dates always differ, so no test reads the wall clock.
        far = {"GOALIE_TODAY": ""}
        cls.east = cls.today(far | {"TZ": "Pacific/Kiritimati"})
        cls.west = cls.today(far | {"TZ": "Pacific/Pago_Pago"})
        cls.pinned = cls.today({"GOALIE_TODAY": "2027-01-04", "TZ": "Pacific/Kiritimati"})
        owner = cls.store.read("owner_settings", "owner")
        result = cls.store.write("tig", update("owner_settings", "owner", owner["version"], {"settings": {**owner["settings"], "time_zone": "Pacific/Pago_Pago"}}))
        assert result["ok"], result
        cls.setting = cls.today(far | {"TZ": "Pacific/Kiritimati"})

    @classmethod
    def today(cls, env: dict[str, str]) -> dict[str, Any]:
        (reply,), _ = fetch(cls.store, "/api/priorities", env=env)
        assert reply.status == 200, reply.body
        return json.loads(reply.body)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_today_is_the_process_time_zone_day_by_default(self) -> None:
        self.assertGreater(self.east["today"], self.west["today"])

    def test_the_owner_setting_names_the_time_zone(self) -> None:
        self.assertEqual(self.setting["today"], self.west["today"])

    def test_goalie_today_pins_the_day(self) -> None:
        self.assertEqual(self.pinned["today"], "2027-01-04")

    def test_a_slip_counts_days_to_the_org_day(self) -> None:
        east = goals_of(self.east)["XW-0001"]["dates"][0]["slipDays"]
        west = goals_of(self.west)["XW-0001"]["dates"][0]["slipDays"]
        self.assertEqual(east - west, (datetime.date.fromisoformat(self.east["today"]) - datetime.date.fromisoformat(self.west["today"])).days)

    def test_a_goal_starts_on_the_org_day(self) -> None:
        self.assertGreater(goals_of(self.east)["XW-0001"]["started"], goals_of(self.west)["XW-0001"]["started"])


OLD_GOAL = {
    "description": "A test goal.",
    "owner": "tig",
    "org_unit": "excaliwire",
    "level": "Company",
    "type": "Milestone (Launch)",
    "due_date": "2025-01-15",
    "date_type": "Committed",
    "plan": "docs/release-plan.md",
    "plan_maturity": "Pencil",
    "severity": "sev2",
    "state": "In Progress",
    "health": "RED",
    "path_to_green": {"steps": [{"owner": "tig", "date": "2026-10-29", "text": "Test step"}]},
    "origination": "New",
}


if __name__ == "__main__":
    unittest.main()
