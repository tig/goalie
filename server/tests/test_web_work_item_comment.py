"""A comment on a work item, from its row on the Work items page and on a goal page (W6c).
Measured in headless Chrome on the built app, signed in as Chelsea. The mouse and the keys are real input through Chrome (measure_page.mjs)."""

from __future__ import annotations

import unittest

from test_web_work_item_edit import scenario
from web_browser import signed_app

# Open the first row's comment box, type, and post with Enter. The row says the comment was added.
COMMENT_ON_WORK_PAGE = scenario("""
  const row = document.querySelector(".wrow");
  const id = JSON.parse(row.dataset.focus).id;
  const bubble = row.querySelector("button.wbubble");
  if (!bubble) return { id, bubble: false };
  await click(bubble);
  const box = document.querySelector(".wicomment");
  const focused = Boolean(box) && document.activeElement === box.querySelector("[aria-label=Comment]");
  await type("Blocked on the seed file");
  await key("Enter");
  await sleep(600);
  return { id, bubble: true, focused, open: Boolean(document.querySelector(".wicomment")), said: row.querySelector(".wsaid")?.textContent ?? null };
""", ready=".wrow")

# On a goal page the comment shows in Activity, under the work item's key. Escape on an empty box closes it and posts nothing.
COMMENT_ON_GOAL_PAGE = scenario("""
  const row = document.querySelector(".wrow2");
  const id = JSON.parse(row.dataset.focus).id;
  await click(row.querySelector("button.wbubble"));
  await key("Escape");
  const closed = !document.querySelector(".wicomment");
  await click(row.querySelector("button.wbubble"));
  await type("Seen on the goal page");
  await key("Enter");
  await sleep(900);
  const text = document.body.innerText;
  return { id, closed, shown: text.includes("Seen on the goal page") };
""", ready=".wrow2")


class WorkItemCommentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app("seed/build-team.json") as (open_page, api):
            cls.work = open_page(1280, COMMENT_ON_WORK_PAGE, "/work")
            item = next(i for i in api("/api/work")["items"] if i["id"] == cls.work["id"])
            cls.events = api(f"/api/goals/{item['goal']}")["events"]
            goal = next(i["goal"] for i in api("/api/work")["items"] if i["status"] == "In Progress")
            cls.goal = open_page(1280, COMMENT_ON_GOAL_PAGE, f"/goals/{goal}")
            cls.goal_events = api(f"/api/goals/{goal}")["events"]

    def test_a_work_row_has_a_comment_button_that_opens_a_focused_box(self) -> None:
        self.assertTrue(self.work["bubble"], "every work row has the comment button")
        self.assertTrue(self.work["focused"])

    def test_enter_posts_one_comment_event_on_the_work_item(self) -> None:
        said = [e for e in self.events if e["entity"] == self.work["id"] and e["field"] == "comment"]
        self.assertEqual([e["new"] for e in said], ["Blocked on the seed file"])
        self.assertFalse(self.work["open"], "a posted box closes")
        self.assertEqual(self.work["said"], "Comment added.")

    def test_the_goal_page_shows_the_comment_in_activity_and_escape_posts_nothing(self) -> None:
        self.assertTrue(self.goal["closed"])
        self.assertTrue(self.goal["shown"])
        said = [e for e in self.goal_events if e["entity"] == self.goal["id"] and e["field"] == "comment"]
        self.assertEqual([e["new"] for e in said], ["Seen on the goal page"])


if __name__ == "__main__":
    unittest.main()
