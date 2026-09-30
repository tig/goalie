"""SPEC.md must state the ordinary human session."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class HumanSessionSpec(unittest.TestCase):
    def setUp(self) -> None:
        self.spec = (ROOT / "SPEC.md").read_text(encoding="utf-8")
        self.manual = (ROOT / "USERS_MANUAL.md").read_text(encoding="utf-8")

    def test_ordinary_session_needs_no_agent(self) -> None:
        self.assertIn("### 1.2 How a human spends time", self.spec)
        self.assertIn(
            "A human must be able to do the following with no agent present (invariant):",
            self.spec,
        )
        self.assertIn(
            "Open *My goals* or an org unit's view, then open a goal and read its fields.",
            self.spec,
        )
        self.assertIn(
            "A human must be able to open *My goals* or an org-unit view, open a goal, read and edit its fields, write the linked plan, and comment, with no agent required.",
            self.spec,
        )

    def test_history_is_on_the_record(self) -> None:
        self.assertIn(
            "Every change to a goal, a Doc, a work item, or a priority, and every comment, is an Event (invariant).",
            self.spec,
        )
        self.assertIn(
            "A human reads those Events on the goal, Doc, work item, or priority they belong to (invariant).",
            self.spec,
        )
        self.assertIn(
            "The current fields are not a substitute for the trail (invariant).",
            self.spec,
        )
        self.assertIn(
            "Export must not be the only way to read it.",
            self.spec,
        )
        self.assertIn(
            "A deleted goal must stay findable, and its history must stay readable.",
            self.spec,
        )

    def test_two_humans_share_one_goal(self) -> None:
        self.assertIn(
            "Two humans must be able to have the same goal open and change it during the same period (invariant).",
            self.spec,
        )
        self.assertIn(
            "They share the goal's fields, its comments, its linked plan, and its work items when that extension is on.",
            self.spec,
        )
        self.assertIn(
            "Work a person did must not disappear without an Event.",
            self.spec,
        )

    def test_doc_is_a_page_and_work_items_stay_optional(self) -> None:
        self.assertIn("| **Doc** |", self.spec)
        self.assertIn(
            "A Doc is a page a human opens and writes, not only a stored body (invariant).",
            self.spec,
        )
        self.assertIn(
            "work items are the group's list of work under a goal",
            self.spec,
        )
        self.assertIn("### 6.7 Work Item (optional extension)", self.spec)
        self.assertIn(
            "The work-item extension must not be required.",
            self.spec,
        )

    def test_manual_has_the_between_reviews_procedure(self) -> None:
        self.assertIn("| **Doc** |", self.manual)
        self.assertIn("**Work between reviews**", self.manual)
        self.assertIn("read a goal's history", self.spec)
