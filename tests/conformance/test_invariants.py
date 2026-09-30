"""One skipped test per invariant SPEC.md marks.

Issue #4 replaces each skipTest with a real assertion. This file does not implement the rules.
"""

from __future__ import annotations

import unittest


class MarkedInvariants(unittest.TestCase):
    def test_3_principle_1_exactly_one_human_owner(self) -> None:
        self.skipTest(
            "SPEC §3 principle 1: Every goal has exactly one owner, and that owner is a human"
        )

    def test_3_principle_2_date_says_what_kind(self) -> None:
        self.skipTest(
            "SPEC §3 principle 2: Every goal has a date, and every date says what kind it is: Committed, Ambition, or Fantasy (§5)"
        )

    def test_3_principle_4_named_human_owner(self) -> None:
        self.skipTest(
            "SPEC §3 principle 4: Each org unit has a named human owner"
        )

    def test_3_principle_8_original_committed_date_not_rewritten(self) -> None:
        self.skipTest(
            "SPEC §3 principle 8: The Original Committed Date is not rewritten"
        )

    def test_3_principle_9_written_reason(self) -> None:
        self.skipTest(
            "SPEC §3 principle 9: Changes of state or date carry a written reason"
        )

    def test_5_date_carries_its_type(self) -> None:
        self.skipTest(
            "SPEC §5: Every goal's date carries its type"
        )

    def test_5_has_promotion_milestone(self) -> None:
        self.skipTest(
            "SPEC §5: A goal whose Date Type is Ambition or Fantasy has a Promotion Milestone"
        )

    def test_5_committed_date_not_demoted(self) -> None:
        self.skipTest(
            "SPEC §5: A Committed date can't be demoted"
        )

    def test_6_1_owner_exactly_one_human(self) -> None:
        self.skipTest(
            "SPEC §6.1 owner: Exactly one human"
        )

    def test_6_1_date_type(self) -> None:
        self.skipTest(
            "SPEC §6.1 date_type: See §5"
        )

    def test_6_1_promotion_milestone(self) -> None:
        self.skipTest(
            "SPEC §6.1 promotion_milestone: The linked goal has `type = Milestone (Commit)`, `date_type = Committed`, a due date before this goal's, and a human owner"
        )

    def test_6_1_plan_maturity_pencil(self) -> None:
        self.skipTest(
            "SPEC §6.1 plan_maturity: Committed needs Pencil"
        )

    def test_6_1_original_committed_date_not_editable(self) -> None:
        self.skipTest(
            "SPEC §6.1 original_committed_date: Not editable afterwards"
        )

    def test_6_1_changed_due_date_reason(self) -> None:
        self.skipTest(
            "SPEC §6.1 changed_due_date: Each change has a reason and is logged"
        )

    def test_6_1_state_reason(self) -> None:
        self.skipTest(
            "SPEC §6.1 state: Each change has a reason"
        )

    def test_6_1_path_to_green(self) -> None:
        self.skipTest(
            "SPEC §6.1 path_to_green: Required when YELLOW or RED"
        )

    def test_6_2_org_unit_owner_is_human(self) -> None:
        self.skipTest(
            "SPEC §6.2: Each org unit's owner is a human"
        )

    def test_6_3_unique_rank(self) -> None:
        self.skipTest(
            "SPEC §6.3 rank: No two current entries in the same list share a rank"
        )

    def test_7_1_uncommitted_date_has_promotion_milestone(self) -> None:
        self.skipTest(
            "SPEC §7.1: at any moment, a goal whose date is not Committed has a Promotion Milestone with a Committed date"
        )
