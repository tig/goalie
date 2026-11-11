"""Each work item has its own page, like an issue in a tracker (W8). A work row's title opens it, and a title takes the row's room (W8a).
Measured in headless Chrome on the built app, signed in as Chelsea. The mouse and the keys are real input through Chrome (measure_page.mjs)."""

from __future__ import annotations

import unittest

from test_web_work_item_edit import scenario
from web_browser import signed_app

# Click the first row's title. The page opens at /work/<key> with the title, the goal, the fields, and Activity. A comment posts to it.
OPEN_FROM_THE_ROW = scenario("""
  const row = document.querySelector(".wrow");
  const id = JSON.parse(row.dataset.focus).id;
  const title = row.querySelector("a.wname");
  if (!title) return { id, link: false };
  await click(title);
  for (let i = 0; i < 40 && !document.querySelector(".wipage h1"); i++) await sleep(100);
  const page = document.querySelector(".wipage");
  if (!page) return { id, link: true, path: location.pathname, page: false };
  const side = [...page.querySelectorAll(".wiside dt")].map((d) => d.textContent);
  const box = page.querySelector("textarea[aria-label=Comment]");
  await click(box);
  await type("Read on its own page");
  await click([...page.querySelectorAll("button")].find((b) => b.textContent.trim() === "Comment"));
  await sleep(900);
  return {
    id, link: true, path: location.pathname, page: true,
    h1: page.querySelector("h1").textContent,
    key: page.querySelector(".wikey")?.textContent ?? null,
    goal: page.querySelector(".crumbs a")?.getAttribute("href") ?? null,
    side,
    // A post reloads the page, which draws a new .wipage: read the one on screen now.
    said: [...document.querySelectorAll(".wipage .events .erow")].some((e) => e.textContent.includes("Read on its own page")),
  };
""", ready=".wrow")

# A long title shows whole when the row has room for it at 1280 px.
TITLE_ROOM = scenario("""
  const names = [...document.querySelectorAll(".wrow a.wname")];
  const long = names.find((n) => n.textContent.startsWith("Fix the Head of Engineering"));
  if (!long) return { found: false };
  return { found: true, whole: long.scrollWidth <= long.clientWidth + 1 };
""", ready=".wrow")


class WorkItemPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app("seed/build-team.json") as (open_page, api):
            cls.opened = open_page(1280, OPEN_FROM_THE_ROW, "/work")
            cls.item = next(i for i in api("/api/work")["items"] if i["id"] == cls.opened["id"])
            cls.room = open_page(1280, TITLE_ROOM, "/work")
            cls.direct = open_page(390, scenario("""
              const page = document.querySelector(".wipage");
              return { h1: page.querySelector("h1").textContent, overflow: document.documentElement.scrollWidth > innerWidth };
            """, ready=".wipage h1"), f"/work/{cls.opened['id'].lower()}")

    def test_a_work_rows_title_opens_its_page(self) -> None:
        self.assertTrue(self.opened["link"], "the row title is a link")
        self.assertEqual(self.opened["path"], f"/work/{self.opened['id']}")
        self.assertTrue(self.opened["page"])

    def test_the_page_shows_the_key_title_goal_and_fields(self) -> None:
        self.assertEqual(self.opened["h1"], self.item["title"])
        self.assertEqual(self.opened["key"], self.opened["id"])
        self.assertEqual(self.opened["goal"], f"/goals/{self.item['goal']}")
        self.assertEqual(self.opened["side"], ["Status", "Owner", "Start Date", "Due Date", "Goal"])

    def test_a_comment_on_the_page_shows_in_its_activity(self) -> None:
        self.assertTrue(self.opened["said"])

    def test_the_page_opens_from_its_address_at_phone_width(self) -> None:
        self.assertEqual(self.direct["h1"], self.item["title"])
        self.assertFalse(self.direct["overflow"])

    def test_a_long_title_shows_whole_when_the_row_has_room(self) -> None:
        self.assertTrue(self.room["found"])
        self.assertTrue(self.room["whole"])


if __name__ == "__main__":
    unittest.main()
