"""One skipped conformance test per marked invariant in SPEC.md Draft 0.2."""

from __future__ import annotations

import unittest
from pathlib import Path

SPEC = Path(__file__).resolve().parents[1] / "SPEC.md"

_MARKS = ("(invariant", "invariant)", "invariant for")

_SECTION_13_HEADINGS = (
    "13. **Structured fields.",
    "14. **Versions.",
    "15. **Commit check.",
    "16. **Sequence.",
    "17. **Live views.",
    "18. **Resume.",
    "19. **Concurrent Markdown.",
    "20. **Presence.",
    "21. **Same stream.",
    "22. **Drafts.",
    "23. **Ordinary session.",
    "24. **History on the record.",
    "25. **Two actors, one goal.",
    "26. **Page and list.",
    "27. **Comments.",
    "28. **Views are screens.",
    "29. **Owner and user settings.",
)


def _marked_line_numbers(text: str) -> set[int]:
    return {
        number
        for number, line in enumerate(text.splitlines(), start=1)
        if any(mark in line for mark in _MARKS)
    }


class ConformanceTests(unittest.TestCase):
    # SPEC.md line that carries an invariant mark, and the one test that owns the line.
    # A later mark on that line can belong to another test. That test's docstring says so.
    INVARIANT_LINES = {
        49: "test_between_reviews_work_starts_at_my_goals",
        57: "test_write_names_the_version_it_read",
        73: "test_goal_has_exactly_one_human_owner",
        74: "test_goal_date_carries_a_date_type",
        76: "test_org_unit_has_a_named_human_owner",
        88: "test_original_committed_date_is_not_rewritten",
        90: "test_state_or_date_change_carries_a_written_reason",
        134: "test_goal_date_carries_a_date_type",
        143: "test_uncommitted_date_has_a_promotion_milestone",
        151: "test_committed_date_cannot_be_demoted",
        159: "test_version_is_stored_on_each_writable_entity",
        161: "test_structured_fields_are_not_merged",
        172: "test_goal_has_exactly_one_human_owner",
        177: "test_goal_date_carries_a_date_type",
        178: "test_uncommitted_date_has_a_promotion_milestone",
        180: "test_promotion_pins_committed_plan_version",
        181: "test_committed_goal_needs_a_pencil_plan",
        183: "test_original_committed_date_is_not_rewritten",
        184: "test_state_or_date_change_carries_a_written_reason",
        187: "test_state_or_date_change_carries_a_written_reason",
        189: "test_yellow_or_red_goal_has_a_path_to_green",
        196: "test_org_unit_has_a_named_human_owner",
        208: "test_priority_ranks_are_unique",
        227: "test_doc_is_a_page",
        229: "test_markdown_edit_is_not_lost",
        234: "test_event_sequence_only_increases",
        236: "test_every_change_is_an_event",
        241: "test_work_items_are_the_list_under_the_goal",
        272: "test_draft_appears_live_and_does_not_take_effect_until_approval",
        347: "test_structured_fields_are_not_merged",
        348: "test_write_names_the_version_it_read",
        349: "test_commit_check_is_one_server_transaction",
        353: "test_deleted_goal_stays_findable",
        359: "test_view_is_a_screen_plus_a_saved_definition",
        365: "test_between_reviews_work_starts_at_my_goals",
        366: "test_committed_change_appears_within_the_live_update_time",
        367: "test_client_resumes_from_the_last_sequence",
        368: "test_view_shows_presence",
        460: "test_only_the_goalie_owner_changes_owner_settings",
        478: "test_a_user_changes_only_their_own_settings",
    }

    SKIP_WHY = {
        "test_goal_has_exactly_one_human_owner": "Filled by #4.",
        "test_goal_date_carries_a_date_type": "Filled by #4.",
        "test_org_unit_has_a_named_human_owner": "Filled by #4.",
        "test_original_committed_date_is_not_rewritten": "Filled by #4.",
        "test_state_or_date_change_carries_a_written_reason": "Filled by #4.",
        "test_uncommitted_date_has_a_promotion_milestone": "Filled by #4.",
        "test_committed_date_cannot_be_demoted": "Filled by #4.",
        "test_committed_goal_needs_a_pencil_plan": "Filled by #4.",
        "test_yellow_or_red_goal_has_a_path_to_green": "Filled by #4.",
        "test_priority_ranks_are_unique": "Filled by #4.",
        "test_write_names_the_version_it_read": "Filled by #4.",
        "test_structured_fields_are_not_merged": "Filled by #4.",
        "test_commit_check_is_one_server_transaction": "Filled by #4.",
        "test_deleted_goal_stays_findable": "Filled by #4.",
        "test_comment_is_an_event_on_the_entity": "Filled by #4.",
        "test_stale_draft_approval_is_rejected": "Filled by #4.",
        "test_version_is_stored_on_each_writable_entity": "Filled by #3.",
        "test_sequence_is_stored_on_the_event_log": "Filled by #3.",
        "test_drafts_are_stored": "Filled by #3.",
        "test_comments_are_stored_as_events": "Filled by #3.",
        "test_every_change_is_an_event": "Filled by #3.",
        "test_committed_plan_version_column_is_stored": "Filled by #3.",
        "test_event_sequence_only_increases": "Filled by #5.",
        "test_client_resumes_from_the_last_sequence": "Filled by #5.",
        "test_views_and_agents_share_one_stream": "Filled by #5.",
        "test_only_the_goalie_owner_changes_owner_settings": "Filled by #5.",
        "test_a_user_changes_only_their_own_settings": "Filled by #5.",
        "test_doc_is_a_page": "Filled by #7.",
        "test_markdown_edit_is_not_lost": "Filled by #7.",
        "test_saved_doc_version_comes_from_the_merged_text": "Filled by #7.",
        "test_promotion_pins_committed_plan_version": "Filled by #7.",
        "test_view_is_a_screen_plus_a_saved_definition": "Filled by #8.",
        "test_between_reviews_work_starts_at_my_goals": "Filled by #8.",
        "test_committed_change_appears_within_the_live_update_time": "Filled by #8.",
        "test_view_shows_presence": "Filled by #8.",
        "test_history_is_readable_on_the_record": "Filled by #8.",
        "test_user_settings_include_favorite_views_and_appearance": "Filled by #8.",
        "test_draft_appears_live_and_does_not_take_effect_until_approval": "Filled by #9.",
        "test_work_items_are_the_list_under_the_goal": "Filled by #12.",
        "test_human_can_file_a_work_item_with_no_agent": "Filled by #12.",
        "test_work_item_extension_stays_optional": "Filled by #12.",
        "test_work_item_comment_is_an_event": "Filled by #12.",
        "test_mcp_can_comment": "Filled by #6.",
        "test_mcp_can_approve_or_reject_a_draft": "Filled by #6.",
        "test_mcp_can_subscribe_to_the_same_stream": "Filled by #6.",
    }

    @classmethod
    def setUpClass(cls) -> None:
        method = getattr(cls, "test_scaffold_names_every_marked_invariant")
        if getattr(method, "__unittest_skip__", False):
            raise AssertionError("the scaffold test must not be skipped")

    @unittest.skip("Filled by #4.")
    def test_goal_has_exactly_one_human_owner(self) -> None:
        """§3 principle 1 and the §6.1 owner field are the same test. SPEC.md lines 73 and 172."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_goal_date_carries_a_date_type(self) -> None:
        """§3 principle 2, §5, and the §6.1 date_type field are the same test. SPEC.md lines 74, 134, and 177."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_org_unit_has_a_named_human_owner(self) -> None:
        """§3 principle 4 and §6.2 are the same test. SPEC.md lines 76 and 196."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_original_committed_date_is_not_rewritten(self) -> None:
        """§3 principle 8 and the §6.1 original_committed_date field are the same test. SPEC.md lines 88 and 183. Only the GOALIE owner may correct a data-entry error, with a logged reason."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_state_or_date_change_carries_a_written_reason(self) -> None:
        """§3 principle 9, the §6.1 state field, and the §6.1 changed_due_date field are the same test. SPEC.md lines 90, 184, and 187."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_uncommitted_date_has_a_promotion_milestone(self) -> None:
        """§5 and the §6.1 promotion_milestone shape are the same test. SPEC.md lines 143 and 178. The linked goal must be Milestone (Commit), Committed, due before the goal, and owned by a human. It is empty when Committed."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_committed_date_cannot_be_demoted(self) -> None:
        """§5 is this test. SPEC.md line 151."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_committed_goal_needs_a_pencil_plan(self) -> None:
        """The §6.1 plan_maturity field is this test. SPEC.md line 181."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_yellow_or_red_goal_has_a_path_to_green(self) -> None:
        """The §6.1 path_to_green field is this test. SPEC.md line 189."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_priority_ranks_are_unique(self) -> None:
        """§6.3 is this test. SPEC.md line 208."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_write_names_the_version_it_read(self) -> None:
        """§6, §8.1 stale writes, and §13 item 14 are the same test. This is the rule, not column storage. SPEC.md line 348 is this test. On line 159, the write sentence and the stale-write sentence are this test, and the version sentence is test_version_is_stored_on_each_writable_entity. The scaffold map assigns line 159 to that storage test. Line 57 is the two-actors mark. It is split across this test, test_markdown_edit_is_not_lost, test_committed_change_appears_within_the_live_update_time, and test_every_change_is_an_event. There is no umbrella test. The scaffold map assigns line 57 to this test."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_structured_fields_are_not_merged(self) -> None:
        """§6, §8.1, and §13 item 13 are the same test. SPEC.md lines 161 and 347. Both marks on each line are this test. Structured fields change only through validated writes. Automatic merging must not apply. The ordinary-session mark on line 49 includes editing those fields. That mark is split across test_between_reviews_work_starts_at_my_goals, this test, test_doc_is_a_page, test_comment_is_an_event_on_the_entity, and test_human_can_file_a_work_item_with_no_agent. The scaffold map assigns line 49 to test_between_reviews_work_starts_at_my_goals."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_commit_check_is_one_server_transaction(self) -> None:
        """§8.1 and §13 item 15 are the same test. SPEC.md line 349. A failed check must not become visible."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_deleted_goal_stays_findable(self) -> None:
        """§8.1 and the deleted-goal sentence of §13 item 24 are the same test. SPEC.md line 353. The rest of §13 item 24 is test_history_is_readable_on_the_record."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_comment_is_an_event_on_the_entity(self) -> None:
        """§6.6, §13 item 27, and the §4 Comment row are the same test. On SPEC.md line 234, the sentences that any entity can have comments and that a comment must not reply to another comment are this test. The scaffold map assigns line 234 to test_event_sequence_only_increases. A comment is an Event, not its own entity. The ordinary-session comment under line 49 is this test. A work-item comment is test_work_item_comment_is_an_event."""
        self.fail("not filled")

    @unittest.skip("Filled by #4.")
    def test_stale_draft_approval_is_rejected(self) -> None:
        """§6.9 is this test. On SPEC.md line 272, approval is a write against base_version, and a stale approval must be rejected and must return current state. The scaffold map assigns line 272 to test_draft_appears_live_and_does_not_take_effect_until_approval."""
        self.fail("not filled")

    @unittest.skip("Filled by #3.")
    def test_version_is_stored_on_each_writable_entity(self) -> None:
        """§6 says every writable entity has a version, and storing that version is this test. SPEC.md line 159's first sentence is this test. The write sentence and the stale-write sentence on that line are test_write_names_the_version_it_read. This test must not replace that rule test."""
        self.fail("not filled")

    @unittest.skip("Filled by #3.")
    def test_sequence_is_stored_on_the_event_log(self) -> None:
        """§6.6 names the sequence column, and storing it is this test. Monotonic behavior is test_event_sequence_only_increases. SPEC.md line 234's first mark is that test, and the scaffold map assigns the line there. This test must not replace the stream tests."""
        self.fail("not filled")

    @unittest.skip("Filled by #3.")
    def test_drafts_are_stored(self) -> None:
        """§6.9 fields are stored by this test. The live-approval marks on SPEC.md line 272 are test_draft_appears_live_and_does_not_take_effect_until_approval and test_stale_draft_approval_is_rejected. This test must not replace those rule tests."""
        self.fail("not filled")

    @unittest.skip("Filled by #3.")
    def test_comments_are_stored_as_events(self) -> None:
        """Comments are stored as Event rows by this test. The comment rule is test_comment_is_an_event_on_the_entity. This test must not replace that rule test."""
        self.fail("not filled")

    @unittest.skip("Filled by #3.")
    def test_every_change_is_an_event(self) -> None:
        """§6.6 and the opening of §13 item 24 are this test. §1.2 says work a person did must not disappear without an Event. SPEC.md line 236's first sentence is this test. The later sentences on that line are test_history_is_readable_on_the_record. The Event clause of line 57 is this test. The scaffold map assigns line 57 to test_write_names_the_version_it_read and line 236 to this test."""
        self.fail("not filled")

    @unittest.skip("Filled by #3.")
    def test_committed_plan_version_column_is_stored(self) -> None:
        """The §6.1 committed_plan_version column is stored by this test. Pinning it is test_promotion_pins_committed_plan_version. SPEC.md line 180 is that pin test. This test must not replace the pin test."""
        self.fail("not filled")

    @unittest.skip("Filled by #5.")
    def test_event_sequence_only_increases(self) -> None:
        """§6.6 and §13 item 16 are the same test for the monotonic sequence. SPEC.md line 234's first mark is this test, and the scaffold map assigns that line here. The same line also states the shared stream, resume, comments, and the Draft decision Event. Those statements are test_views_and_agents_share_one_stream, test_client_resumes_from_the_last_sequence, test_comment_is_an_event_on_the_entity, and test_draft_appears_live_and_does_not_take_effect_until_approval."""
        self.fail("not filled")

    @unittest.skip("Filled by #5.")
    def test_client_resumes_from_the_last_sequence(self) -> None:
        """§6.6, §8.2 Resume, and §13 item 18 are the same test. SPEC.md line 367 is this test, including the sentence that the client receives every Event with a greater sequence. The same two sentences on line 234 are this test. The scaffold map assigns line 234 to test_event_sequence_only_increases."""
        self.fail("not filled")

    @unittest.skip("Filled by #5.")
    def test_views_and_agents_share_one_stream(self) -> None:
        """§6.6 and §13 items 16 and 21 are the same test. One stream. Views and agents both use it. On SPEC.md line 234, the sentence that the Event log is the change stream views and agents subscribe to is this test. The scaffold map assigns line 234 to test_event_sequence_only_increases. The MCP subscribe path is test_mcp_can_subscribe_to_the_same_stream, not a second copy of this test."""
        self.fail("not filled")

    @unittest.skip("Filled by #5.")
    def test_only_the_goalie_owner_changes_owner_settings(self) -> None:
        """§12 and §13 item 29 are this test for owner settings. SPEC.md line 460. A user must not change owner settings. The same ban is restated on line 478, which the scaffold map assigns to test_a_user_changes_only_their_own_settings."""
        self.fail("not filled")

    @unittest.skip("Filled by #5.")
    def test_a_user_changes_only_their_own_settings(self) -> None:
        """§12 and §13 item 29 are this test for one user's own settings. SPEC.md line 478. A user must not change another user's settings. The sentence also restates that a user must not change owner settings, which is test_only_the_goalie_owner_changes_owner_settings."""
        self.fail("not filled")

    @unittest.skip("Filled by #7.")
    def test_doc_is_a_page(self) -> None:
        """§6.5, the first sentence of §13 item 26, and the §1.2 linked-plan bullet are the same test. SPEC.md line 227 is this test. Both marks are this test. A Doc is a page a human opens and writes, with no agent required. It is not only a stored body. The ordinary-session mark on line 49 includes writing that page. The scaffold map assigns line 49 to test_between_reviews_work_starts_at_my_goals."""
        self.fail("not filled")

    @unittest.skip("Filled by #7.")
    def test_markdown_edit_is_not_lost(self) -> None:
        """§6.5, §1.2, and §13 items 19 and 25 are this test for the edit. An edit must not be lost. More than one actor may edit a Doc body or a goal description at the same time. On SPEC.md line 229, those two sentences are this test, and the saved-version sentence is test_saved_doc_version_comes_from_the_merged_text. The scaffold map assigns line 229 to this test. The Markdown clause of line 57 is this test."""
        self.fail("not filled")

    @unittest.skip("Filled by #7.")
    def test_saved_doc_version_comes_from_the_merged_text(self) -> None:
        """§6.5 and §13 item 19 are the same test. On SPEC.md line 229, the sentence that a saved Doc version is taken from that text is this test. The scaffold map assigns line 229 to test_markdown_edit_is_not_lost."""
        self.fail("not filled")

    @unittest.skip("Filled by #7.")
    def test_promotion_pins_committed_plan_version(self) -> None:
        """§5 promotion to Committed, §6.1, and §13 item 19 are the same test. SPEC.md line 180. Later edits to the Doc must not change the pinned version. Storing the column is test_committed_plan_version_column_is_stored."""
        self.fail("not filled")

    @unittest.skip("Filled by #8.")
    def test_view_is_a_screen_plus_a_saved_definition(self) -> None:
        """§8.2 and §13 item 28 are the same test. SPEC.md line 359. Not a database view. A database view alone must not satisfy it. A screen with no saved definition must not satisfy it."""
        self.fail("not filled")

    @unittest.skip("Filled by #8.")
    def test_between_reviews_work_starts_at_my_goals(self) -> None:
        """§8.2 and §1.2 are the same test for between-reviews work. SPEC.md line 365. My goals and the org-unit view are where a human works between reviews. Line 49 is the ordinary-session mark. It is split across this test, test_structured_fields_are_not_merged, test_doc_is_a_page, test_comment_is_an_event_on_the_entity, and test_human_can_file_a_work_item_with_no_agent. There is no umbrella test. The scaffold map assigns line 49 to this test."""
        self.fail("not filled")

    @unittest.skip("Filled by #8.")
    def test_committed_change_appears_within_the_live_update_time(self) -> None:
        """§8.2, §13 item 17, and §13 item 25 are the same test. SPEC.md line 366. The default is 1 second. The time is configurable. The live-update clause of line 57 is this test. The scaffold map assigns line 57 to test_write_names_the_version_it_read."""
        self.fail("not filled")

    @unittest.skip("Filled by #8.")
    def test_view_shows_presence(self) -> None:
        """§8.2, §13 item 20, and §1.2 are the same test. SPEC.md line 368. Human or agent."""
        self.fail("not filled")

    @unittest.skip("Filled by #8.")
    def test_history_is_readable_on_the_record(self) -> None:
        """The §6.6 read path and §13 item 24, except the deleted-goal sentence, are the same test. That deleted-goal sentence is test_deleted_goal_stays_findable. On SPEC.md line 236, the sentences after the first are this test. A human reads Events on the record, follows one goal across a plan period, and reads a comment on its entity. Export is not the only way. Current fields are not a substitute for the trail. The scaffold map assigns line 236 to test_every_change_is_an_event."""
        self.fail("not filled")

    @unittest.skip("Filled by #8.")
    def test_user_settings_include_favorite_views_and_appearance(self) -> None:
        """§12 user settings and §13 item 29 are this test for favorite views and appearance. Favorites default to none beyond the standard views. Appearance defaults to light, and a user may choose dark. Who may write the row is test_only_the_goalie_owner_changes_owner_settings and test_a_user_changes_only_their_own_settings. Those permission marks are SPEC.md lines 460 and 478. This content has no separate invariant mark."""
        self.fail("not filled")

    @unittest.skip("Filled by #9.")
    def test_draft_appears_live_and_does_not_take_effect_until_approval(self) -> None:
        """§6.9, the §4 Draft row, §10, and §13 item 22 are the same test. SPEC.md line 272's first two marks are this test. The Draft appears live. It must not take effect until a human approves it. Approving or rejecting it is its own Event, with an actor and a reason. The same Event sentence on line 234 is this test. The scaffold map assigns line 234 to test_event_sequence_only_increases and line 272 to this test. Stale approval stays test_stale_draft_approval_is_rejected."""
        self.fail("not filled")

    @unittest.skip("Filled by #12.")
    def test_work_items_are_the_list_under_the_goal(self) -> None:
        """§6.7 and §13 item 26 are this test when the extension is on. SPEC.md line 241's first mark is this test, and the scaffold map assigns the line here. The second mark on that line is test_human_can_file_a_work_item_with_no_agent."""
        self.fail("not filled")

    @unittest.skip("Filled by #12.")
    def test_human_can_file_a_work_item_with_no_agent(self) -> None:
        """§6.7, §1.2, and §13 item 23 are the same test. On SPEC.md line 241, the sentence that a human can file a work item with no agent is this test. The scaffold map assigns line 241 to test_work_items_are_the_list_under_the_goal. The ordinary-session mark on line 49 includes this bullet. That line maps to test_between_reviews_work_starts_at_my_goals."""
        self.fail("not filled")

    @unittest.skip("Filled by #12.")
    def test_work_item_extension_stays_optional(self) -> None:
        """§6.7 and §13 item 26 are this test. SPEC.md line 241 says the extension stays optional. That sentence has no invariant mark. The marked sentences on that line are test_work_items_are_the_list_under_the_goal and test_human_can_file_a_work_item_with_no_agent."""
        self.fail("not filled")

    @unittest.skip("Filled by #12.")
    def test_work_item_comment_is_an_event(self) -> None:
        """A comment on a work item is an Event, not a field. §6.6 and §6.7 are this test. The general comment rule remains test_comment_is_an_event_on_the_entity. There is no separate invariant mark for this case."""
        self.fail("not filled")

    @unittest.skip("Filled by #6.")
    def test_mcp_can_comment(self) -> None:
        """This is the MCP path for a comment, not a second copy of test_comment_is_an_event_on_the_entity. §10 and §13 item 8."""
        self.fail("not filled")

    @unittest.skip("Filled by #6.")
    def test_mcp_can_approve_or_reject_a_draft(self) -> None:
        """This is the MCP path to approve or reject a Draft, not a second copy of test_draft_appears_live_and_does_not_take_effect_until_approval or test_stale_draft_approval_is_rejected. §10 and §6.9."""
        self.fail("not filled")

    @unittest.skip("Filled by #6.")
    def test_mcp_can_subscribe_to_the_same_stream(self) -> None:
        """This is the MCP path for subscribing to the same stream, not a second copy of test_views_and_agents_share_one_stream. §6.6, §10, and §13 item 21."""
        self.fail("not filled")

    def test_scaffold_names_every_marked_invariant(self) -> None:
        """Every SPEC.md line with an invariant mark must map to one skipped test, and §13 items 13 through 29 must be present."""
        spec = SPEC.read_text(encoding="utf-8")
        marked = _marked_line_numbers(spec)
        self.assertEqual(set(self.INVARIANT_LINES), marked)
        methods = {
            name
            for name, value in vars(type(self)).items()
            if name.startswith("test_") and callable(value)
        }
        scaffold = "test_scaffold_names_every_marked_invariant"
        self.assertEqual(set(self.SKIP_WHY), methods - {scaffold})
        self.assertFalse(
            getattr(getattr(type(self), scaffold), "__unittest_skip__", False)
        )
        for name, why in self.SKIP_WHY.items():
            method = getattr(type(self), name)
            self.assertTrue(getattr(method, "__unittest_skip__", False), name)
            self.assertEqual(getattr(method, "__unittest_skip_why__", None), why)
        for line, name in self.INVARIANT_LINES.items():
            self.assertIn(name, self.SKIP_WHY, line)
            self.assertNotEqual(name, scaffold, line)
        for heading in _SECTION_13_HEADINGS:
            self.assertIn(heading, spec, heading)


if __name__ == "__main__":
    unittest.main()
