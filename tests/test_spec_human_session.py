"""SPEC.md must state the ordinary human session."""

from __future__ import annotations

import re
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
            "Two humans (or agents) must be able to have the same goal open and change it during the same period (invariant).",
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
        self.assertIn("| **Comment** |", self.manual)
        self.assertIn("**Work between reviews**", self.manual)
        self.assertIn("read a goal's history", self.spec)

    def test_comments_attach_to_every_entity(self) -> None:
        self.assertIn(
            "Any entity in the model can have comments (invariant).",
            self.spec,
        )
        self.assertIn("A comment is not its own entity.", self.spec)
        self.assertIn(
            "In the first version a comment must not reply to another comment (invariant).",
            self.spec,
        )
        self.assertIn("Threaded comments must not be required now.", self.spec)
        self.assertIn(
            "The model has eight entities: Goal, Org Unit, Priority, Actor, Doc, Event, Draft, and an optional Work Item.",
            self.spec,
        )
        self.assertIn(
            "A comment must not be its own entity.",
            self.spec,
        )

    def test_views_are_screens_not_database_views(self) -> None:
        self.assertIn(
            "A view is a screen a human opens in the app, and a saved definition of which goals it shows, which columns it shows, and how it sorts (invariant).",
            self.spec,
        )
        self.assertIn("It is not a database view.", self.spec)
        self.assertIn(
            "A database view alone must not satisfy this requirement.",
            self.spec,
        )
        self.assertIn(
            "A screen with no saved definition must not satisfy it either.",
            self.spec,
        )
        self.assertIn("It must not be a database view.", self.spec)

    def test_owner_settings_and_user_settings(self) -> None:
        self.assertIn(
            "Only the GOALIE owner may change them (invariant). A user must not change them.",
            self.spec,
        )
        self.assertIn(
            "Each user may change only their own user settings (invariant).",
            self.spec,
        )
        self.assertIn(
            "A user must not change owner settings, and must not change another user's settings.",
            self.spec,
        )
        self.assertIn(
            "| Favorite views | None beyond the standard views ([§8.2 (Views)](#s8-2)). The user may mark views as favorites. |",
            self.spec,
        )
        self.assertIn("| Appearance | Light. The user may choose dark. |", self.spec)
        self.assertIn(
            "The default appearance is light, and a user may choose dark.",
            self.spec,
        )

    def test_section_refs_are_anchored_gloss_links(self) -> None:
        self.assertIn('<a id="s3-9"></a>', self.spec)
        self.assertIn("[§3.9 (Principle 9)](#s3-9)", self.spec)
        for match in re.finditer(r"§\d+(?:\.\d+)?", self.spec):
            self.assertEqual(
                self.spec[match.start() - 1 : match.start()],
                "[",
                match.group(),
            )
        for match in re.finditer(r"\[§[^\]]+\]\([^)]+\)", self.spec):
            self.assertRegex(
                match.group(),
                r"\[§\d+(?:\.\d+)? \([^)]+\)\]\(#s\d+(?:-\d+)?\)",
            )
        ids = set(re.findall(r'<a id="(s\d+(?:-\d+)?)"></a>', self.spec))
        hrefs = set(re.findall(r"\]\(#(s\d+(?:-\d+)?)\)", self.spec))
        self.assertEqual(hrefs - ids, set())
