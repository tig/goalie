"""On a phone, a long press anywhere in GOALIE, except in a text field, opens its own menu with "Feedback...", as a right-click does on a desktop (#58).
iOS Safari sends no contextmenu on a long press, so GOALIE times the press itself. Measured in headless Chrome at phone widths with real touch input
(Input.dispatchTouchEvent through measure_page.mjs). A real iPhone and a real Android phone are not measured here."""

from __future__ import annotations

import unittest

from test_feedback_menu import SECRET, scenario
from web_browser import signed_app

# The page becomes a touch screen first, and its layout settles, so at() measures the touch layout. touch(el, command) presses one finger on el.
TOUCH = """
  await input({ touch: "on" });
  await sleep(200);
  const touch = async (el, command) => { await input({ touch: "long", ...at(el), ...command }); await sleep(150); };
"""

LONG_PRESS_A_GOAL = scenario(TOUCH + """
  const path = location.pathname;
  await touch(document.querySelector(".goal .title"));
  const count = document.querySelectorAll("[role=menu]").length;
  const items = menu() ? [...menu().querySelectorAll("[role=menuitem]")].map((e) => e.textContent) : null;
  const stayed = location.pathname === path;
  await pickFeedback();
  const shown = { open: dialog()?.open ?? false, about: about() };
  if (shown.open) await send("Long press note.");
  return { count, items, stayed, browser: menus.some((x) => x.browser), shown, sent };
""")

# A long press in a text field keeps the phone's own text menu: GOALIE opens nothing and prevents nothing.
TEXT_FIELD = scenario(TOUCH + f"""
  const box = document.querySelector("input[type=search]");
  box.focus();
  await input({{ text: {SECRET!r} }});
  await touch(box);
  return {{ goalie: Boolean(menu()), prevented: menus.some((x) => !x.browser) }};
""")

# A finger that moves is a scroll or a drag, and a short tap is a tap: neither opens the menu.
MOVED_AND_TAPPED = scenario(TOUCH + """
  await touch(document.querySelector(".goal .title"), { dy: 40 });
  const moved = Boolean(menu());
  await touch(document.querySelector(".board h2"), { touch: "tap" });
  return { moved, tapped: Boolean(menu()) };
""")


class FeedbackTouchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app("seed/build-team.json") as (open_page, api):
            first = api("/api/priorities")["funded"][0]
            cls.goal = {"label": first["goals"][0]["summary"], "id": first["goals"][0]["id"], "kind": "goal", "breadcrumb": ["Home", first["title"]]}
            cls.pressed = {w: open_page(w, LONG_PRESS_A_GOAL) for w in (375, 360)}
            cls.field = {w: open_page(w, TEXT_FIELD) for w in (375, 360)}
            cls.moved = {w: open_page(w, MOVED_AND_TAPPED) for w in (375, 360)}

    def test_a_long_press_on_a_goal_opens_one_goalie_menu_with_feedback(self) -> None:
        for width, got in self.pressed.items():
            with self.subTest(width=width):
                self.assertEqual(got["count"], 1, got)
                self.assertEqual(got["items"], ["Feedback..."])
                self.assertFalse(got["browser"], "the browser's own menu must not open")

    def test_a_long_press_does_not_follow_the_row(self) -> None:
        for width, got in self.pressed.items():
            with self.subTest(width=width):
                self.assertTrue(got["stayed"], got)

    def test_feedback_after_a_long_press_shows_and_sends_that_goal(self) -> None:
        for width, got in self.pressed.items():
            with self.subTest(width=width):
                self.assertEqual(got["shown"], {"open": True, "about": f"About: {self.goal['label']} (goal)"})
                self.assertEqual([s["focus"] for s in got["sent"]], [self.goal])

    def test_a_long_press_in_a_text_field_keeps_the_system_menu(self) -> None:
        for width, got in self.field.items():
            with self.subTest(width=width):
                self.assertEqual(got, {"goalie": False, "prevented": False})

    def test_a_moving_finger_or_a_tap_opens_no_menu(self) -> None:
        for width, got in self.moved.items():
            with self.subTest(width=width):
                self.assertEqual(got, {"moved": False, "tapped": False})


if __name__ == "__main__":
    unittest.main()
