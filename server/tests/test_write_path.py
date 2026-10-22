"""The one write path: versions, the Event log, and the §8.1 rules."""

from __future__ import annotations

import sqlite3
import unittest
from typing import Any

from goalie_cli import Store, create, update

JANE = "jane@example.com"


def committed_milestone(**fields: Any) -> dict[str, Any]:
    goal = {
        "summary": "Commit the self-serve launch date",
        "owner": JANE,
        "org_unit": "program/growth",
        "level": "Program or Function",
        "type": "Milestone (Commit)",
        "due_date": "2026-11-15",
        "date_type": "Committed",
        "plan": "docs/plans/self-serve-date.md",
        "plan_maturity": "Pencil",
        "severity": "sev2",
        "state": "In Progress",
        "health": "GREEN",
        "origination": "New",
    }
    goal.update(fields)
    return goal


EXAMPLE = {
    "summary": "Launch self-serve onboarding",
    "owner": JANE,
    "org_unit": "program/growth",
    "level": "Program or Function",
    "type": "Milestone (Launch)",
    "due_date": "2027-03-31",
    "date_type": "Ambition",
    "promotion_milestone": "GOAL-57",
    "plan": "docs/plans/self-serve-onboarding.md",
    "plan_maturity": "Crayon",
    "work_product": [{"repo": "github.com/example/onboarding"}],
    "state": "In Progress",
    "health": "GREEN",
    "severity": "sev2",
    "priority": "PRI-3",
    "origination": "New",
    "parent": "GOAL-7",
}


class WritePathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        self.ok(create("actor", JANE, {"kind": "human", "display_name": "Jane"}))
        self.ok(create("org_unit", "company", {"name": "Example", "level": "Company", "owner": JANE}))
        self.ok(create("org_unit", "program/growth", {"name": "Growth", "level": "Program or Function", "parent": "company", "owner": JANE}))
        self.ok(create("priority", "PRI-3", {"org_unit": "program/growth", "period": "2026", "rank": 3, "title": "Cut time-to-value", "status": "Current"}, "Set in the Growth 5Ps"))
        self.ok(create("goal", "GOAL-7", committed_milestone(summary="Double activated accounts this year", org_unit="company", level="Company", type="Metric (Business)", due_date="2026-12-31"), "Set in the plan"))
        self.ok(create("goal", "GOAL-57", committed_milestone(), "Set in the plan"))

    def write(self, command: dict[str, Any]) -> Any:
        return self.store.write(JANE, command)

    def ok(self, command: dict[str, Any]) -> Any:
        result = self.write(command)
        self.assertTrue(result["ok"], result)
        return result

    def rejected(self, command: dict[str, Any], rule: str) -> Any:
        result = self.write(command)
        self.assertFalse(result["ok"], result)
        self.assertEqual(result["error"], "invalid", result)
        self.assertIn(rule, [v["rule"] for v in result["violations"]], result)
        return result

    def test_example_record_is_stored_and_read_back(self) -> None:
        self.ok(create("goal", "GOAL-42", EXAMPLE, "Planned in the Growth 5Ps"))
        goal = self.store.read("goal", "GOAL-42")
        for field, value in EXAMPLE.items():
            self.assertEqual(goal[field], value, field)
        self.assertEqual(goal["version"], 1)

    def test_every_change_is_an_event_with_an_increasing_sequence(self) -> None:
        self.ok(create("goal", "GOAL-42", EXAMPLE, "Planned in the Growth 5Ps"))
        before = self.store.events()[-1]["sequence"]
        result = self.ok(update("goal", "GOAL-42", 1, {"health": "YELLOW", "path_to_green": {"steps": [{"owner": JANE, "date": "2026-11-01", "text": "Hire a designer"}], "criteria": "Designer starts", "trigger": "No hire by Nov 1"}}, "Design capacity is short"))
        self.assertEqual(result["entity"]["version"], 2)
        events = self.store.events(before)
        self.assertEqual([e["field"] for e in events], ["health", "path_to_green"])
        health = events[0]
        self.assertEqual(health["actor"], JANE)
        self.assertEqual(health["entity_kind"], "goal")
        self.assertEqual(health["entity"], "GOAL-42")
        self.assertEqual(health["old"], "GREEN")
        self.assertEqual(health["new"], "YELLOW")
        self.assertEqual(health["reason"], "Design capacity is short")
        sequences = [e["sequence"] for e in self.store.events()]
        self.assertEqual(sequences, sorted(set(sequences)))
        self.assertGreater(health["sequence"], before)

    def test_stale_write_is_rejected_with_the_current_state(self) -> None:
        self.ok(update("goal", "GOAL-57", 1, {"summary": "Commit the self-serve launch date this fall"}))
        result = self.write(update("goal", "GOAL-57", 1, {"severity": "sev1"}))
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "stale")
        self.assertEqual(result["current"]["version"], 2)
        self.assertEqual(result["current"]["severity"], "sev2")

    def test_ambition_without_promotion_milestone_is_rejected_by_name(self) -> None:
        goal = dict(EXAMPLE)
        del goal["promotion_milestone"]
        result = self.rejected(create("goal", "GOAL-42", goal, "Planned"), "promotion-milestone")
        self.assertIn("Promotion Milestone", result["violations"][0]["message"])

    def test_promotion_milestone_must_be_committed_commit_milestone_with_earlier_date(self) -> None:
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "promotion_milestone": "GOAL-7"}, "Planned"), "promotion-milestone")
        self.ok(create("goal", "GOAL-58", committed_milestone(due_date="2027-04-30"), "Planned"))
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "promotion_milestone": "GOAL-58"}, "Planned"), "promotion-milestone")

    def test_a_milestone_change_that_breaks_a_dependent_goal_is_rejected(self) -> None:
        self.ok(create("goal", "GOAL-42", EXAMPLE, "Planned"))
        self.rejected(update("goal", "GOAL-57", 1, {"changed_due_date": "2027-05-01", "due_date": "2027-05-01"}, "Slip"), "promotion-milestone")

    def test_owner_must_be_one_human(self) -> None:
        self.ok(create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": JANE}))
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "owner": "bot"}, "Planned"), "one-human-owner")
        self.rejected(create("org_unit", "team/bots", {"name": "Bots", "level": "Team", "owner": "bot"}), "one-human-owner")

    def test_an_owner_cannot_become_an_agent(self) -> None:
        self.ok(create("actor", "tig", {"kind": "human", "display_name": "Tig"}))
        self.rejected(update("actor", JANE, 1, {"kind": "agent", "operator": "tig"}), "one-human-owner")
        self.assertEqual(self.store.read("actor", JANE)["kind"], "human")

    def test_an_operator_cannot_become_an_agent(self) -> None:
        self.ok(create("actor", "tig", {"kind": "human", "display_name": "Tig"}))
        self.ok(create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": "tig"}))
        self.rejected(update("actor", "tig", 1, {"kind": "agent", "operator": JANE}), "agent-operator")

    def test_a_value_the_schema_rejects_is_a_named_rejection(self) -> None:
        self.rejected(update("goal", "GOAL-57", 1, {"state": "Done"}, "Shipped"), "field-value")
        self.rejected(create("goal", "GOAL-60", {"owner": JANE}, "Planned"), "field-value")

    def test_agent_names_a_human_operator(self) -> None:
        self.rejected(create("actor", "bot", {"kind": "agent", "display_name": "Bot"}), "agent-operator")

    def test_every_goal_has_a_date_and_a_date_type(self) -> None:
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "date_type": None}, "Planned"), "date-and-date-type")
        self.rejected(create("goal", "GOAL-43", {**EXAMPLE, "due_date": None}, "Planned"), "date-and-date-type")

    def test_committed_needs_pencil(self) -> None:
        self.rejected(create("goal", "GOAL-58", committed_milestone(plan_maturity="Crayon"), "Planned"), "committed-needs-pencil")

    def test_date_state_and_health_changes_need_a_reason(self) -> None:
        self.rejected(create("goal", "GOAL-42", EXAMPLE), "reason-required")
        self.rejected(update("goal", "GOAL-57", 1, {"state": "Completed"}), "reason-required")
        self.rejected(update("goal", "GOAL-57", 1, {"due_date": "2026-11-14"}), "reason-required")

    def test_rank_change_needs_a_reason(self) -> None:
        self.rejected(update("priority", "PRI-3", 1, {"rank": 2}), "reason-required")

    def test_yellow_or_red_needs_a_path_to_green(self) -> None:
        self.rejected(update("goal", "GOAL-57", 1, {"health": "RED"}, "Date at risk"), "ptg-when-yellow-or-red")

    def test_in_progress_needs_health(self) -> None:
        self.rejected(update("goal", "GOAL-57", 1, {"health": None}, "Unknown"), "health-while-in-progress")

    def test_no_ties_in_a_priority_list(self) -> None:
        self.rejected(create("priority", "PRI-4", {"org_unit": "program/growth", "period": "2026", "rank": 3, "title": "Win SMB", "status": "Current"}, "Added"), "no-rank-ties")
        self.ok(create("priority", "PRI-5", {"org_unit": "program/growth", "period": "2027", "rank": 3, "title": "Win SMB", "status": "Current"}, "Added"))

    def test_committed_date_cannot_be_demoted(self) -> None:
        self.rejected(update("goal", "GOAL-7", 1, {"date_type": "Ambition", "promotion_milestone": "GOAL-57"}, "Too hard"), "committed-not-demotable")

    def test_original_committed_date_is_set_once_by_the_system(self) -> None:
        self.assertEqual(self.store.read("goal", "GOAL-57")["original_committed_date"], "2026-11-15")
        self.rejected(update("goal", "GOAL-57", 1, {"original_committed_date": "2026-12-01"}, "Fix"), "system-field")

    def test_rejected_write_appends_no_event_and_changes_no_row(self) -> None:
        count = len(self.store.events())
        self.rejected(update("goal", "GOAL-57", 1, {"plan_maturity": "Crayon"}, "Rethink"), "committed-needs-pencil")
        self.assertEqual(len(self.store.events()), count)
        self.assertEqual(self.store.read("goal", "GOAL-57")["plan_maturity"], "Pencil")
        self.assertEqual(self.store.read("goal", "GOAL-57")["version"], 1)

    def test_unknown_actor_cannot_write(self) -> None:
        result = self.store.write("mallory", create("org_unit", "team/x", {"name": "X", "level": "Team", "owner": JANE}))
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "unknown_actor")

    def test_event_log_is_append_only(self) -> None:
        with sqlite3.connect(self.store.path) as db:
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("UPDATE event SET reason = 'x'")
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("DELETE FROM event")


    def test_a_date_must_be_a_real_calendar_date(self) -> None:
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "due_date": "2026-13-45"}, "Planned"), "date-and-date-type")
        self.rejected(create("goal", "GOAL-43", {**EXAMPLE, "due_date": "2027-02-29"}, "Planned"), "date-and-date-type")
        self.rejected(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-11-31"}, "Slip"), "field-value")

    def test_a_goal_cannot_be_its_own_ancestor(self) -> None:
        self.rejected(update("goal", "GOAL-7", 1, {"parent": "GOAL-7"}), "parent-not-cycle")
        self.ok(update("goal", "GOAL-57", 1, {"parent": "GOAL-7"}))
        self.rejected(update("goal", "GOAL-7", 1, {"parent": "GOAL-57"}), "parent-not-cycle")

    def test_fantasy_is_promoted_one_step_at_a_time(self) -> None:
        self.ok(create("goal", "GOAL-42", {**EXAMPLE, "date_type": "Fantasy"}, "Planned"))
        committed = {"date_type": "Committed", "promotion_milestone": None, "plan_maturity": "Pencil"}
        self.rejected(update("goal", "GOAL-42", 1, committed, "Promote"), "date-lifecycle")
        self.ok(update("goal", "GOAL-42", 1, {"date_type": "Ambition"}, "Promote"))
        self.ok(update("goal", "GOAL-42", 2, committed, "Promote"))

    def test_only_a_committed_goal_is_completed(self) -> None:
        self.ok(create("goal", "GOAL-42", {**EXAMPLE, "date_type": "Fantasy"}, "Planned"))
        self.rejected(update("goal", "GOAL-42", 1, {"state": "Completed", "health": None}, "Done"), "completed-needs-committed")

    def test_state_follows_the_state_lifecycle(self) -> None:
        self.ok(create("goal", "GOAL-42", {**EXAMPLE, "state": "Backlog", "health": None}, "Planned"))
        self.rejected(update("goal", "GOAL-42", 1, {"state": "Completed Late"}, "Done"), "state-lifecycle")
        self.ok(update("goal", "GOAL-57", 1, {"state": "Completed", "health": None}, "Done"))
        self.rejected(update("goal", "GOAL-57", 2, {"state": "Backlog"}, "Reopen"), "state-lifecycle")

    def test_a_wrong_typed_value_is_a_named_rejection(self) -> None:
        self.rejected(update("goal", "GOAL-57", 1, {"summary": {"text": "Commit the date"}}), "field-value")
        self.rejected(update("priority", "PRI-3", 1, {"rank": [2]}, "Re-rank"), "field-value")
        self.rejected(update("priority", "PRI-3", 1, {"cut_line": "true"}), "field-value")

    def test_an_agent_writes_a_draft_not_a_goal_or_a_priority(self) -> None:
        self.ok(create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": JANE}))
        result = self.store.write("bot", update("goal", "GOAL-57", 1, {"health": "YELLOW"}, "Evidence"))
        self.assertEqual(result["error"], "invalid", result)
        self.assertIn("agent-writes-a-draft", [v["rule"] for v in result["violations"]])
        result = self.store.write("bot", create("goal", "GOAL-42", EXAMPLE, "Planned"))
        self.assertIn("agent-writes-a-draft", [v["rule"] for v in result.get("violations", [])], result)
        result = self.store.write("bot", update("priority", "PRI-3", 1, {"rank": 1}, "Evidence"))
        self.assertIn("agent-writes-a-draft", [v["rule"] for v in result.get("violations", [])], result)
        draft = {"entity": "GOAL-57", "actor": "bot", "base_version": 1, "change": {"health": "YELLOW"}, "reason": "Evidence"}
        result = self.store.write("bot", create("draft", "DRAFT-1", draft))
        self.assertTrue(result["ok"], result)
        self.assertEqual(self.store.read("goal", "GOAL-57")["health"], "GREEN")

    def test_only_the_goalie_owner_writes_owner_settings(self) -> None:
        self.ok(create("actor", "tig", {"kind": "human", "display_name": "Tig"}))
        result = self.store.write("tig", create("owner_settings", "owner", {"owner": JANE, "settings": {}}))
        self.assertIn("owner-settings", [v["rule"] for v in result.get("violations", [])], result)
        self.ok(create("owner_settings", "owner", {"owner": JANE, "settings": {}}))
        result = self.store.write("tig", update("owner_settings", "owner", 1, {"settings": {"goal_key_prefix": "TIG"}}))
        self.assertIn("owner-settings", [v["rule"] for v in result.get("violations", [])], result)
        self.ok(update("owner_settings", "owner", 1, {"settings": {"goal_key_prefix": "EX"}}))

    def test_a_human_writes_only_their_own_user_settings(self) -> None:
        self.ok(create("actor", "tig", {"kind": "human", "display_name": "Tig"}))
        self.ok(create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": JANE}))
        self.rejected(create("user_settings", "tig", {"appearance": "dark"}), "user-settings")
        result = self.store.write("bot", create("user_settings", "bot", {}))
        self.assertIn("user-settings", [v["rule"] for v in result.get("violations", [])], result)
        self.ok(create("user_settings", JANE, {"appearance": "dark"}))

    def test_a_new_goal_key_uses_the_owner_settings_prefix(self) -> None:
        fields = committed_milestone(summary="Commit the enterprise launch date")
        self.assertEqual(self.ok({"op": "create", "kind": "goal", "fields": fields, "reason": "Planned"})["entity"]["id"], "GOAL-0003")
        self.ok(create("owner_settings", "owner", {"owner": JANE, "settings": {"goal_key_prefix": "EX"}}))
        self.assertEqual(self.ok({"op": "create", "kind": "goal", "fields": fields, "reason": "Planned"})["entity"]["id"], "EX-0004")


class BootstrapTests(unittest.TestCase):
    def test_first_write_creates_the_acting_human(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        rejected = store.write("tig", create("actor", "someone", {"kind": "human", "display_name": "Someone"}))
        self.assertEqual(rejected["error"], "unknown_actor")
        result = store.write("tig", create("actor", "tig", {"kind": "human", "display_name": "Tig"}))
        self.assertTrue(result["ok"], result)
        self.assertEqual(store.events()[0]["actor"], "tig")


if __name__ == "__main__":
    unittest.main()
