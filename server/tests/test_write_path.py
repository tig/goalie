"""The one write path: versions, the Event log, and the §8.1 rules."""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import unittest
from typing import Any

from goalie_cli import SERVER, Store, create, update

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
        self.ok(update("goal", "GOAL-57", 1, {"summary": "Commit the self-serve launch date this fall"}, "Clearer"))
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
        self.rejected(create("goal", "GOAL-60", {"owner": JANE}, "Planned"), "required-field")

    def test_agent_names_a_human_operator(self) -> None:
        self.rejected(create("actor", "bot", {"kind": "agent", "display_name": "Bot"}), "agent-operator")

    def test_every_goal_has_a_date_and_a_date_type(self) -> None:
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "date_type": None}, "Planned"), "date-and-date-type")
        self.rejected(create("goal", "GOAL-43", {**EXAMPLE, "due_date": None}, "Planned"), "date-and-date-type")

    def test_committed_needs_pencil(self) -> None:
        self.rejected(create("goal", "GOAL-58", committed_milestone(type="Milestone (Launch)", plan_maturity="Crayon"), "Planned"), "committed-needs-pencil")

    def test_date_state_and_health_changes_need_a_reason(self) -> None:
        self.rejected(create("goal", "GOAL-42", EXAMPLE), "reason-required")
        self.rejected(update("goal", "GOAL-57", 1, {"state": "Completed"}), "reason-required")
        self.rejected(update("goal", "GOAL-57", 1, {"due_date": "2026-11-14"}), "reason-required")

    def test_every_change_to_a_goal_needs_a_reason(self) -> None:
        # Codebase QA, SPEC.md §13 item 24: every change to a goal, a work item, or a priority is an Event with a reason.
        for change in ({"description": "A new description."}, {"plan_maturity": "Crayon", "type": "Metric (Business)"}, {"summary": "Commit the self-serve launch date now"}):
            result = self.rejected(update("goal", "GOAL-57", 1, change), "reason-required")
            self.assertEqual(next(v for v in result["violations"] if v["rule"] == "reason-required")["field"], "reason")
        self.rejected(create("goal", "GOAL-42", EXAMPLE), "reason-required")
        self.rejected(update("priority", "PRI-3", 1, {"title": "Cut time to value"}), "reason-required")
        self.ok(update("goal", "GOAL-57", 1, {"description": "A new description."}, "Clearer"))

    def test_a_slip_moves_the_date_later(self) -> None:
        # Codebase QA: a changed_due_date on or before the current date is not a slip.
        for date in ("2026-11-15", "2026-11-01"):
            result = self.rejected(update("goal", "GOAL-57", 1, {"changed_due_date": date}, "Slip"), "slip-moves-later")
            self.assertEqual(result["violations"][-1]["field"], "changed_due_date")
        self.ok(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-11-30"}, "Slip"))
        self.rejected(update("goal", "GOAL-57", 2, {"changed_due_date": "2026-11-20"}, "Slip back"), "slip-moves-later")

    def test_a_slip_cannot_be_cleared_to_step_around_it(self) -> None:
        # Codebase QA Q12: slip, clear, slip earlier moved the date back 9 days.
        self.ok(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-11-25"}, "Slip"))
        result = self.rejected(update("goal", "GOAL-57", 2, {"changed_due_date": None}, "Undo"), "slip-moves-later")
        self.assertEqual(result["violations"][-1]["field"], "changed_due_date")

    def test_a_reason_message_names_fields_in_spec_words(self) -> None:
        # Codebase QA Q15.
        result = self.rejected(update("goal", "GOAL-57", 1, {"plan_maturity": "Pencil", "severity": "sev1"}), "reason-required")
        message = next(v["message"] for v in result["violations"] if v["rule"] == "reason-required")
        self.assertIn("Severity", message)
        self.assertNotIn("plan_maturity", message)

    def test_a_blank_required_text_is_missing(self) -> None:
        result = self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "summary": "   "}, "Planned"), "required-field")
        self.assertEqual(result["violations"][0]["field"], "summary")

    def test_rank_change_needs_a_reason(self) -> None:
        self.rejected(update("priority", "PRI-3", 1, {"rank": 2}), "reason-required")

    def test_yellow_or_red_needs_a_path_to_green(self) -> None:
        self.rejected(update("goal", "GOAL-57", 1, {"health": "RED"}, "Date at risk"), "ptg-when-yellow-or-red")

    def test_in_progress_needs_health(self) -> None:
        result = self.rejected(update("goal", "GOAL-57", 1, {"health": None}, "Unknown"), "health-while-in-progress")
        # U8: the New goal rail shows these words as written.
        self.assertIn("An In Progress goal needs a health: GREEN, YELLOW, or RED.", [v["message"] for v in result["violations"]])

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
        self.rejected(update("goal", "GOAL-7", 1, {"plan_maturity": "Crayon"}, "Rethink"), "committed-needs-pencil")
        self.assertEqual(len(self.store.events()), count)
        self.assertEqual(self.store.read("goal", "GOAL-7")["plan_maturity"], "Pencil")
        self.assertEqual(self.store.read("goal", "GOAL-7")["version"], 1)

    def test_unknown_actor_cannot_write(self) -> None:
        result = self.store.write("mallory", create("org_unit", "team/x", {"name": "X", "level": "Team", "owner": JANE}))
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "unknown_actor")

    def test_the_event_log_is_indexed_by_entity(self) -> None:
        # Review E21: reading one goal's Events must not scan the whole log.
        with sqlite3.connect(self.store.path) as db:
            plan = " ".join(row[3] for row in db.execute("EXPLAIN QUERY PLAN SELECT * FROM event WHERE entity_kind = 'goal' AND entity = 'GOAL-57' ORDER BY sequence"))
        self.assertIn("USING INDEX", plan)
        self.assertNotIn("TEMP B-TREE", plan)

    def test_event_log_is_append_only(self) -> None:
        with sqlite3.connect(self.store.path) as db:
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("UPDATE event SET reason = 'x'")
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("DELETE FROM event")


    def test_a_date_must_be_a_real_calendar_date(self) -> None:
        # Review Q7: a date that is not on the calendar is named as such, not as a missing date.
        for entity, date in (("GOAL-42", "2026-13-45"), ("GOAL-43", "2027-02-29")):
            result = self.rejected(create("goal", entity, {**EXAMPLE, "due_date": date}, "Planned"), "real-date")
            self.assertNotIn("date-and-date-type", [v["rule"] for v in result["violations"]])
            self.assertIn(date, result["violations"][0]["message"])
        self.rejected(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-11-31"}, "Slip"), "real-date")

    def test_a_changed_date_is_only_for_a_committed_goal(self) -> None:
        # SPEC.md §6.1: changed_due_date is optional, and only when Committed.
        result = self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "date_type": "Fantasy", "changed_due_date": "2027-04-30"}, "Planned"), "changed-date-only-when-committed")
        self.assertIn("GOAL-42", result["violations"][-1]["message"])

    def test_a_date_lies_between_1970_and_9999(self) -> None:
        # Review Q10.
        self.rejected(create("goal", "GOAL-42", {**EXAMPLE, "due_date": "1969-12-31"}, "Planned"), "real-date")
        self.rejected(update("goal", "GOAL-57", 1, {"changed_due_date": "0099-01-01"}, "Slip"), "real-date")

    def test_a_command_that_is_not_an_object_is_a_bad_command(self) -> None:
        env = {**os.environ, "GOALIE_DB": str(self.store.path)}
        for raw in (b"null", b"[]", b'"update"', b"7"):
            proc = subprocess.run(["node", "--no-warnings", "src/cli.ts", "write", "--as", JANE], cwd=SERVER, env=env, input=raw, capture_output=True, timeout=30)
            self.assertNotIn(b"TypeError", proc.stderr, raw)
            self.assertEqual(json.loads(proc.stdout)["error"], "bad_command", raw)
        result = self.store.run("write", "--as", JANE, stdin={"op": "create", "kind": "doc", "fields": ["kind"]})[1]
        self.assertEqual(result["error"], "bad_command", result)

    # B2: the rules for the goal page and goal creation (docs/engineering/goal-page-and-create.md, Rules).

    def test_a_promotion_milestone_is_committed_without_a_pencil_plan(self) -> None:
        # D1, plan E-6: a Milestone (Commit) is exempt. Any other Committed goal still needs Pencil.
        self.ok(create("goal", "GOAL-58", committed_milestone(plan_maturity="Crayon"), "Planned"))
        result = self.rejected(create("goal", "GOAL-59", committed_milestone(type="Milestone (Launch)", plan_maturity="Crayon"), "Planned"), "committed-needs-pencil")
        self.assertEqual(result["violations"][0]["field"], "plan_maturity")

    def test_a_sub_goal_takes_its_parents_date_until_it_sets_its_own(self) -> None:
        # D2, plan E-7: null due_date and date_type resolve from the nearest ancestor.
        inherit = {**committed_milestone(type="Milestone (Launch)", summary="Write the release notes for launch", parent="GOAL-57", plan_maturity="Crayon"), "due_date": None, "date_type": None, "plan": None}
        self.ok(create("goal", "GOAL-60", inherit, "Planned"))
        self.ok(create("goal", "GOAL-61", {**inherit, "parent": "GOAL-60"}, "Planned"))
        self.ok(update("goal", "GOAL-60", 1, {"state": "Completed", "health": None}, "Done"))

    def test_a_goal_with_no_parent_has_its_own_date(self) -> None:
        result = self.rejected(create("goal", "GOAL-60", {**EXAMPLE, "parent": None, "due_date": None, "date_type": None}, "Planned"), "date-and-date-type")
        self.assertEqual(result["violations"][0]["field"], "due_date")
        self.rejected(create("goal", "GOAL-61", {**EXAMPLE, "date_type": None}, "Planned"), "date-and-date-type")

    def test_a_sub_goal_on_an_uncommitted_date_shares_its_parents_milestone(self) -> None:
        self.ok(create("goal", "GOAL-42", EXAMPLE, "Planned"))
        sub = {**EXAMPLE, "summary": "Draw the onboarding screens", "parent": "GOAL-42", "due_date": None, "date_type": None, "promotion_milestone": None}
        self.ok(create("goal", "GOAL-43", sub, "Planned"))

    def test_a_path_to_green_has_steps_with_owners_and_dates_and_criteria(self) -> None:
        # D6: the PathToGreen shape.
        step = {"text": "Hire a designer", "owner": JANE, "date": "2026-11-01"}
        for ptg in (
            "Hire a designer",
            {"steps": [], "criteria": "Designer starts"},
            {"steps": [{**step, "owner": "nobody"}], "criteria": "Designer starts"},
            {"steps": [{**step, "date": "2026-13-01"}], "criteria": "Designer starts"},
            {"steps": [{**step, "text": " "}], "criteria": "Designer starts"},
            {"steps": [step], "criteria": ""},
        ):
            result = self.rejected(update("goal", "GOAL-57", 1, {"health": "RED", "path_to_green": ptg}, "At risk"), "ptg-when-yellow-or-red")
            self.assertEqual(result["violations"][-1]["field"], "path_to_green", ptg)
        self.ok(update("goal", "GOAL-57", 1, {"health": "YELLOW", "path_to_green": {"steps": [step], "criteria": "Designer starts"}}, "At risk"))

    def test_completed_is_on_or_before_the_original_committed_date(self) -> None:
        # §7.2, completed-on-time. Today is pinned to 2026-10-23.
        self.rejected(update("goal", "GOAL-57", 1, {"state": "Completed Late", "health": None}, "Done"), "completed-on-time")
        self.ok(create("goal", "GOAL-58", committed_milestone(due_date="2026-10-01"), "Planned"))
        result = self.rejected(update("goal", "GOAL-58", 1, {"state": "Completed", "health": None}, "Done"), "completed-on-time")
        self.assertEqual(result["violations"][-1]["field"], "state")
        self.ok(update("goal", "GOAL-58", 1, {"state": "Completed Late", "health": None}, "Done"))

    def test_a_close_clears_health_and_the_history_keeps_it(self) -> None:
        # D3, Codebase QA P4: health is kept while In Progress (SPEC.md §6.1). A close that leaves it out clears it, through the API too.
        self.ok(create("goal", "GOAL-58", committed_milestone(due_date="2026-10-01"), "Planned"))
        result = self.ok(update("goal", "GOAL-58", 1, {"state": "Completed Late"}, "Done"))
        self.assertIsNone(result["entity"]["health"])
        health = next(e for e in result["events"] if e["field"] == "health")
        self.assertEqual((health["old"], health["new"]), ("GREEN", None))

    def test_a_sub_goal_closes_on_time_against_its_parents_date(self) -> None:
        # Head of Engineering: the rule and the goal page each had a copy, and they differed for a sub-goal with its parent's date.
        self.ok(create("goal", "GOAL-58", committed_milestone(type="Milestone (Launch)", due_date="2026-10-01"), "Planned"))
        inherit = {**committed_milestone(type="Milestone (Launch)", summary="Write the release notes for launch", parent="GOAL-58"), "due_date": None, "date_type": None, "plan": None}
        self.ok(create("goal", "GOAL-60", inherit, "Planned"))
        self.rejected(update("goal", "GOAL-60", 1, {"state": "Completed", "health": None}, "Done"), "completed-on-time")
        self.ok(update("goal", "GOAL-60", 1, {"state": "Completed Late", "health": None}, "Done"))

    def test_a_promotion_to_ambition_needs_a_new_milestone(self) -> None:
        # §5: promotion-new-milestone.
        self.ok(create("goal", "GOAL-42", {**EXAMPLE, "date_type": "Fantasy"}, "Planned"))
        result = self.rejected(update("goal", "GOAL-42", 1, {"date_type": "Ambition"}, "Promote"), "promotion-new-milestone")
        self.assertEqual(result["violations"][-1]["field"], "promotion_milestone")

    def test_a_committed_date_moves_only_by_a_slip(self) -> None:
        # Review Q1: rewriting due_date in place would erase the slip (SPEC.md §6.1: no silent re-baselines).
        result = self.rejected(update("goal", "GOAL-57", 1, {"due_date": "2026-12-15"}, "New date"), "no-silent-re-baseline")
        self.assertIn("changed_due_date", result["violations"][-1]["message"])
        self.assertEqual(self.store.read("goal", "GOAL-57")["due_date"], "2026-11-15")
        self.ok(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-12-15"}, "Vendor slipped"))

    def test_an_uncommitted_date_can_move_and_be_committed_with_a_new_date(self) -> None:
        self.ok(create("goal", "GOAL-42", EXAMPLE, "Planned"))
        self.ok(update("goal", "GOAL-42", 1, {"due_date": "2027-02-28"}, "Sooner"))
        committed = self.ok(update("goal", "GOAL-42", 2, {"date_type": "Committed", "promotion_milestone": None, "plan_maturity": "Pencil", "due_date": "2027-01-31"}, "Committed in the 5Ps"))
        self.assertEqual(committed["entity"]["original_committed_date"], "2027-01-31")

    def test_a_create_names_each_missing_required_field(self) -> None:
        # Review Q8: no raw SQLite text.
        result = self.rejected(create("goal", "GOAL-60", {}, "Planned"), "required-field")
        messages = " ".join(v["message"] for v in result["violations"])
        # Codebase QA: people read this message, so it names the field in SPEC words; `field` keeps the key.
        self.assertIn("Summary is required.", messages)
        # Plan Maturity now has a default (N-F4); Org Unit still has none.
        self.assertIn("Org Unit is required.", messages)
        self.assertNotIn("goal.", messages)
        self.assertNotIn("constraint failed", messages)

    def test_a_base_version_must_be_a_number(self) -> None:
        # Review Q9: a string base_version is a bad command, not a stale write.
        result = self.write(update("goal", "GOAL-57", "1", {"health": "YELLOW"}, "Risk"))
        self.assertEqual(result["error"], "bad_command", result)
        self.assertIn("base_version", result["message"])

    def test_a_slip_changes_the_date_and_keeps_the_original_committed_date(self) -> None:
        self.rejected(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-11-30"}), "reason-required")
        result = self.ok(update("goal", "GOAL-57", 1, {"changed_due_date": "2026-11-30"}, "Vendor slipped"))
        self.assertEqual(result["entity"]["original_committed_date"], "2026-11-15")
        self.assertEqual(result["events"][0]["reason"], "Vendor slipped")

    def test_a_goal_cannot_be_its_own_ancestor(self) -> None:
        self.rejected(update("goal", "GOAL-7", 1, {"parent": "GOAL-7"}), "parent-not-cycle")
        self.ok(update("goal", "GOAL-57", 1, {"parent": "GOAL-7"}, "Serves the annual goal"))
        self.rejected(update("goal", "GOAL-7", 1, {"parent": "GOAL-57"}), "parent-not-cycle")

    def test_fantasy_is_promoted_one_step_at_a_time(self) -> None:
        self.ok(create("goal", "GOAL-42", {**EXAMPLE, "date_type": "Fantasy"}, "Planned"))
        committed = {"date_type": "Committed", "promotion_milestone": None, "plan_maturity": "Pencil"}
        self.rejected(update("goal", "GOAL-42", 1, committed, "Promote"), "date-lifecycle")
        self.ok(create("goal", "GOAL-58", committed_milestone(due_date="2026-12-15"), "Next milestone"))
        self.ok(update("goal", "GOAL-42", 1, {"date_type": "Ambition", "promotion_milestone": "GOAL-58"}, "Promote"))
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


class WorkItemTests(unittest.TestCase):
    """The work-item extension (SPEC.md §6.7, D7, D8)."""

    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        for actor, command in [
            (JANE, create("actor", JANE, {"kind": "human", "display_name": "Jane"})),
            (JANE, create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": JANE})),
            (JANE, create("actor", "bot2", {"kind": "agent", "display_name": "Bot 2", "operator": JANE})),
            (JANE, create("org_unit", "company", {"name": "Example", "level": "Company", "owner": JANE})),
            (JANE, create("owner_settings", "owner", {"owner": JANE, "settings": {"work_items": True}})),
            (JANE, create("goal", "GOAL-1", committed_milestone(org_unit="company", level="Company"), "Planned")),
        ]:
            result = self.store.write(actor, command)
            assert result["ok"], (command, result)
        self.item = {"goal": "GOAL-1", "title": "Draw the goal page", "owner": "bot", "status": "In Progress", "due_date": "2026-11-02"}

    def refused(self, actor: str, command: dict[str, Any], rule: str, field: str | None = None) -> Any:
        result = self.store.write(actor, command)
        self.assertFalse(result["ok"], result)
        violation = next((v for v in result.get("violations", []) if v["rule"] == rule), None)
        self.assertIsNotNone(violation, result)
        if field:
            self.assertEqual(violation["field"], field)
        return result

    def test_a_human_files_a_work_item_with_a_four_digit_key(self) -> None:
        result = self.store.write(JANE, create("work_item", None, self.item, "Filed"))
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["entity"]["id"], "WI-0001")

    def test_work_items_are_refused_when_the_extension_is_off(self) -> None:
        settings = self.store.read("owner_settings", "owner")
        assert self.store.write(JANE, update("owner_settings", "owner", settings["version"], {"settings": {}}))["ok"]
        self.refused(JANE, create("work_item", "WI-0001", self.item, "Filed"), "work-items-off")

    def test_status_is_a_state_word(self) -> None:
        self.refused(JANE, create("work_item", "WI-0001", {**self.item, "status": "Done"}, "Filed"), "work-item-status", "status")

    def test_a_blank_title_is_missing(self) -> None:
        self.refused(JANE, create("work_item", "WI-0001", {**self.item, "title": " "}, "Filed"), "required-field", "title")

    def test_a_due_date_is_a_real_date(self) -> None:
        self.refused(JANE, create("work_item", "WI-0001", {**self.item, "due_date": "2026-02-30"}, "Filed"), "real-date", "due_date")

    def test_status_owner_and_due_date_changes_need_a_reason(self) -> None:
        assert self.store.write(JANE, create("work_item", "WI-0001", self.item, "Filed"))["ok"]
        for change in ({"status": "Completed"}, {"owner": JANE}, {"due_date": "2026-11-09"}):
            self.refused(JANE, update("work_item", "WI-0001", 1, change), "reason-required")
        self.assertTrue(self.store.write(JANE, update("work_item", "WI-0001", 1, {"status": "Completed"}, "Shipped"))["ok"])

    def test_an_agent_writes_only_the_work_items_it_owns(self) -> None:
        assert self.store.write(JANE, create("work_item", "WI-0001", self.item, "Filed"))["ok"]
        self.assertTrue(self.store.write("bot", update("work_item", "WI-0001", 1, {"status": "Completed"}, "Shipped"))["ok"])
        self.refused("bot2", update("work_item", "WI-0001", 2, {"title": "Taken over"}), "agent-own-work-items", "owner")
        self.refused("bot", update("work_item", "WI-0001", 2, {"owner": "bot2"}, "Hand off"), "agent-own-work-items", "owner")
        self.assertTrue(self.store.write("bot2", create("work_item", "WI-0002", {**self.item, "owner": "bot2"}, "Filed"))["ok"])
        self.refused("bot2", create("work_item", "WI-0003", self.item, "Filed"), "agent-own-work-items", "owner")


class PermissionTests(unittest.TestCase):
    """Only the GOALIE owner writes actor and org_unit rows. An agent never does. An agent's Draft is its own (SPEC.md §6.9, §10, §12)."""

    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        for actor, command in [
            (JANE, create("actor", JANE, {"kind": "human", "display_name": "Jane", "subject": "sub-jane"})),
            (JANE, create("actor", "tig", {"kind": "human", "display_name": "Tig", "subject": "sub-tig"})),
            (JANE, create("org_unit", "company", {"name": "Example", "level": "Company", "owner": "tig"})),
            ("tig", create("owner_settings", "owner", {"owner": "tig", "settings": {}})),
            ("tig", create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": "tig", "app_id": "app-bot"})),
            ("tig", create("goal", "GOAL-1", committed_milestone(owner="tig", org_unit="company", level="Company"), "Planned")),
        ]:
            result = self.store.write(actor, command)
            assert result["ok"], (command, result)

    def refused(self, actor: str, command: dict[str, Any], rule: str) -> None:
        result = self.store.write(actor, command)
        self.assertFalse(result["ok"], result)
        self.assertIn(rule, [v["rule"] for v in result.get("violations", [])], result)

    def test_an_agent_cannot_make_itself_human(self) -> None:
        self.refused("bot", update("actor", "bot", 1, {"kind": "human", "operator": None}), "owner-writes-actors")
        self.assertEqual(self.store.read("actor", "bot")["kind"], "agent")

    def test_an_agent_cannot_create_a_human(self) -> None:
        self.refused("bot", create("actor", "eve", {"kind": "human", "display_name": "Eve", "subject": "sub-eve"}), "owner-writes-actors")

    def test_an_agent_cannot_change_its_operator_or_app_id(self) -> None:
        self.refused("bot", update("actor", "bot", 1, {"operator": JANE}), "owner-writes-actors")
        self.refused("bot", update("actor", "bot", 1, {"app_id": "app-other"}), "owner-writes-actors")

    def test_an_agent_cannot_rename_the_org_unit(self) -> None:
        self.refused("bot", update("org_unit", "company", 1, {"name": "Taken"}), "owner-writes-actors")

    def test_a_human_who_is_not_the_owner_cannot_rewrite_a_token_mapping(self) -> None:
        self.refused(JANE, update("actor", "tig", 1, {"subject": "sub-jane"}), "owner-writes-actors")
        self.refused(JANE, update("actor", JANE, 1, {"subject": "sub-other"}), "owner-writes-actors")
        self.refused(JANE, update("org_unit", "company", 1, {"name": "Renamed"}), "owner-writes-actors")
        self.assertEqual(self.store.read("actor", "tig")["subject"], "sub-tig")

    def test_one_subject_or_app_id_maps_to_one_actor(self) -> None:
        # ADR 0005: one subject maps to one actor. Codebase QA P6: the refusal is a rule in words, not SQLite text.
        for command, field in [
            (update("actor", JANE, 1, {"subject": "sub-tig"}), "subject"),
            (create("actor", "bot2", {"kind": "agent", "display_name": "Bot 2", "operator": "tig", "app_id": "app-bot"}), "app_id"),
        ]:
            result = self.store.write("tig", command)
            self.assertFalse(result["ok"], result)
            violation = next(v for v in result.get("violations", []) if v["rule"] == "one-actor-per-sign-in")
            self.assertEqual(violation["field"], field)
            self.assertNotIn("UNIQUE", violation["message"])
        self.assertEqual(self.store.read("actor", JANE)["subject"], "sub-jane")

    def test_the_goalie_owner_writes_actors_and_org_units(self) -> None:
        self.assertTrue(self.store.write("tig", update("actor", JANE, 1, {"subject": "sub-jane-2"}))["ok"])
        self.assertTrue(self.store.write("tig", update("org_unit", "company", 1, {"name": "Example Inc"}))["ok"])

    def test_before_there_is_an_owner_an_agent_still_cannot_write_actors(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        assert store.write(JANE, create("actor", JANE, {"kind": "human", "display_name": "Jane"}))["ok"]
        assert store.write(JANE, create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": JANE}))["ok"]
        result = store.write("bot", create("actor", "eve", {"kind": "human", "display_name": "Eve"}))
        self.assertIn("owner-writes-actors", [v["rule"] for v in result.get("violations", [])], result)

    def test_an_agent_drafts_only_as_itself(self) -> None:
        draft = {"entity": "GOAL-1", "base_version": 1, "change": {"health": "YELLOW"}, "reason": "Evidence"}
        self.refused("bot", create("draft", "DRAFT-1", {**draft, "actor": "tig"}), "draft-by-its-agent")
        self.refused("tig", create("draft", "DRAFT-2", {**draft, "actor": "tig"}), "draft-by-its-agent")
        self.assertTrue(self.store.write("bot", create("draft", "DRAFT-3", {**draft, "actor": "bot"}))["ok"])

    def test_only_a_drafts_own_agent_updates_it(self) -> None:
        # Codebase QA: another agent, or a human, could rewrite an agent's Draft.
        assert self.store.write("tig", create("actor", "bot3", {"kind": "agent", "display_name": "Bot 3", "operator": "tig"}))["ok"]
        draft = {"entity": "GOAL-1", "actor": "bot", "base_version": 1, "change": {"health": "YELLOW"}, "reason": "Evidence"}
        assert self.store.write("bot", create("draft", "DRAFT-1", draft))["ok"]
        self.refused("bot3", update("draft", "DRAFT-1", 1, {"change": {"health": "RED"}, "actor": "bot3"}), "draft-by-its-agent")
        self.refused("bot3", update("draft", "DRAFT-1", 1, {"change": {"health": "RED"}}), "draft-by-its-agent")
        self.refused(JANE, update("draft", "DRAFT-1", 1, {"change": {"health": "RED"}}, "edited"), "draft-by-its-agent")
        self.refused("bot", update("draft", "DRAFT-1", 1, {"actor": "bot3"}), "draft-by-its-agent")
        self.assertEqual(self.store.read("draft", "DRAFT-1")["change"], {"health": "YELLOW"})
        self.assertTrue(self.store.write("bot", update("draft", "DRAFT-1", 1, {"change": {"health": "RED"}}, "More evidence"))["ok"])

class CliInputTests(unittest.TestCase):
    """Review Q11: the local tool answers bad stdin with a named rejection, not a crash."""

    def test_bad_json_on_stdin_is_a_bad_command(self) -> None:
        store = Store()
        self.addCleanup(store.close)
        env = {**os.environ, "GOALIE_DB": str(store.path)}
        for args in (["write", "--as", JANE], ["whoami"]):
            proc = subprocess.run(["node", "--no-warnings", "src/cli.ts", *args], cwd=SERVER, env=env, input=b"{not json", capture_output=True, timeout=30)
            self.assertEqual(proc.returncode, 2, args)
            self.assertNotIn(b"SyntaxError", proc.stderr)
            result = json.loads(proc.stdout)
            self.assertEqual(result["error"], "bad_command", args)
            self.assertIn("JSON", result["message"])


if __name__ == "__main__":
    unittest.main()
