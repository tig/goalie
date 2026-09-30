"""SPEC.md and USERS_MANUAL.md must state real-time collaboration."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CollaborationSpec(unittest.TestCase):
    def setUp(self) -> None:
        self.spec = (ROOT / "SPEC.md").read_text(encoding="utf-8")
        self.manual = (ROOT / "USERS_MANUAL.md").read_text(encoding="utf-8")

    def test_claim_1_structured_fields_are_not_merged(self) -> None:
        self.assertIn(
            "Structured fields are state, date type, health, PTG, rank, and every other field that is not Markdown text.",
            self.spec,
        )
        self.assertIn("Automatic merging must not apply to them (invariant).", self.spec)
        self.assertIn(
            "One actor sets the plan to Crayon while another promotes the goal to Committed, which breaks §5.",
            self.spec,
        )
        self.assertIn(
            "An automatic merge would also leave no single actor and no single reason, which breaks §3.9 and §6.6.",
            self.spec,
        )
        self.assertIn("must not merge them automatically.", self.spec)

    def test_claim_2_stale_write_is_rejected(self) -> None:
        self.assertIn(
            "A write names the version of the entity it read (invariant).",
            self.spec,
        )
        self.assertIn(
            "A write against a stale version is rejected, and the rejection returns the current state (invariant).",
            self.spec,
        )
        self.assertIn(
            "A write against a stale version must be rejected, and the rejection must return the current state.",
            self.spec,
        )

    def test_claim_3_invariants_checked_on_commit(self) -> None:
        self.assertIn(
            "Invariants are checked on the committed result, on the server, in one transaction (invariant).",
            self.spec,
        )
        self.assertIn(
            "Invariants must be checked on the committed result, on the server, in one transaction.",
            self.spec,
        )
        self.assertIn("A failed check must not become visible.", self.spec)

    def test_claim_4_event_sequence_is_the_change_stream(self) -> None:
        self.assertIn(
            "Every Event has a sequence number that only increases (invariant).",
            self.spec,
        )
        self.assertIn(
            "The Event log is the change stream that views and agents subscribe to (invariant).",
            self.spec,
        )
        self.assertIn(
            "Every Event must have a sequence number that only increases.",
            self.spec,
        )

    def test_claim_5_live_views_within_configured_time(self) -> None:
        self.assertIn(
            "A committed change appears in every open view that shows it within the configured time (invariant). The default is 1 s (§12).",
            self.spec,
        )
        self.assertIn(
            "| Time for a committed change to reach every open view | 1 s |",
            self.spec,
        )
        self.assertIn("That time must be configurable. The default is 1 s.", self.spec)

    def test_claim_6_reconnect_misses_nothing(self) -> None:
        self.assertIn(
            "A client that reconnects resumes from the last sequence number it received (invariant).",
            self.spec,
        )
        self.assertIn(
            "It receives every Event with a greater sequence, so it misses nothing (invariant).",
            self.spec,
        )
        self.assertIn("must miss nothing.", self.spec)

    def test_claim_7_concurrent_markdown_and_pinned_plan(self) -> None:
        self.assertIn(
            "More than one actor may edit a Doc body, or a goal's description, at the same time (invariant).",
            self.spec,
        )
        self.assertIn("An edit must not be lost (invariant).", self.spec)
        self.assertIn("A saved Doc version is taken from that text (invariant).", self.spec)
        self.assertIn("`committed_plan_version`", self.spec)
        self.assertIn("pins the plan's Doc version", self.spec)
        self.assertIn(
            "Promotion to Committed must pin the plan's Doc version.",
            self.spec,
        )

    def test_claim_8_views_show_presence(self) -> None:
        self.assertIn("| **Presence** |", self.spec)
        self.assertIn(
            "A view shows the Presence of every actor viewing or editing an entity it shows, human or agent (invariant).",
            self.spec,
        )
        self.assertIn(
            "A view must show the Presence of every actor viewing or editing an entity, human or agent.",
            self.spec,
        )

    def test_claim_9_agents_use_the_same_stream(self) -> None:
        self.assertIn(
            "An agent must subscribe to the same change stream that views use.",
            self.spec,
        )
        self.assertIn("the same change stream that views use", self.spec)

    def test_claim_10_draft_waits_for_a_human(self) -> None:
        self.assertIn("| **Draft** |", self.spec)
        self.assertIn(
            "It must not take effect until a human approves it (invariant).",
            self.spec,
        )
        self.assertIn(
            "Approving or rejecting a Draft is its own Event, with an actor and a reason (invariant).",
            self.spec,
        )
        self.assertIn(
            "An agent's Draft must appear live on the goal.",
            self.spec,
        )
        self.assertIn(
            "Approving or rejecting a Draft must be its own Event, with an actor and a reason.",
            self.spec,
        )

    def test_lexicon_includes_version(self) -> None:
        self.assertIn("| **Version** |", self.spec)
        self.assertIn(
            "The model has eight entities: Goal, Org Unit, Priority, Actor, Doc, Event, Draft, and an optional Work Item.",
            self.spec,
        )

    def test_section_13_keeps_webhooks_and_numbers_new_items(self) -> None:
        self.assertIn(
            "9. **Events / webhooks,** so agents can react to changes.",
            self.spec,
        )
        for number in range(13, 23):
            self.assertIn(f"{number}. **", self.spec)

    def test_example_priority_rank_stays_unexpanded(self) -> None:
        self.assertIn('priority #3: "Cut time-to-value"', self.spec)

    def test_manual_lexicon_rules_and_procedure(self) -> None:
        self.assertIn("| **Draft** |", self.manual)
        self.assertIn("| **Presence** |", self.manual)
        self.assertIn("| **Version** |", self.manual)
        self.assertIn("**Approve or reject a Draft**", self.manual)
        self.assertIn("within 1 s", self.manual)
        self.assertIn("must not merge them", self.manual)
