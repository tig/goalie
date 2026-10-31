"""Right-click anywhere in GOALIE opens its own menu with "Feedback...". The element picked is the note's focus (#56). Measured in headless Chrome on the built app, with the feedback post caught in the page."""

from __future__ import annotations

import json
import unittest

from web_browser import signed_app

SECRET = "typed-words-must-not-leave-7731"

# Every scenario starts the same way: wait for Home, catch POST /api/feedback, and give helpers to the steps.
SETUP = """
  if (!document.querySelector(".goal") || !document.querySelector(".topfeedback")) return null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const sent = [];
  const real = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).endsWith("/api/feedback")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, issueUrl: "https://github.com/tig/goalie/issues/7", number: 7 }), { status: 201, headers: { "content-type": "application/json" } });
    }
    return real(url, init);
  };
  const rightClick = (el, keyboard = false) => {
    const r = el.getBoundingClientRect();
    const at = keyboard ? {} : { clientX: r.left + 5, clientY: r.top + 5, button: 2 };
    return el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...at }));
  };
  const menu = () => document.querySelector("[role=menu]");
  const dialog = () => document.querySelector("dialog.feedback");
  const type = (el, text) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const send = async (note) => {
    type(dialog().querySelector("textarea"), note);
    await sleep(50);
    dialog().querySelector("button[type=submit]").click();
    await sleep(300);
  };
  const about = () => dialog()?.querySelector(".feedbackabout")?.textContent ?? null;
"""


def scenario(steps: str) -> str:
    return f"(async () => {{ {SETUP} {steps} }})()"


RIGHT_CLICK_A_GOAL = scenario("""
  const goal = document.querySelector(".goal .title");
  const browserMenu = rightClick(goal);
  await sleep(50);
  const items = menu() ? [...menu().querySelectorAll("[role=menuitem]")].map((e) => e.textContent) : null;
  const focused = document.activeElement?.getAttribute("role") ?? null;
  menu()?.querySelector("[role=menuitem]")?.click();
  await sleep(50);
  const shown = { open: dialog()?.open ?? false, about: about() };
  if (shown.open) await send("The date looks wrong.");
  return { browserMenu, items, focused, shown, sent, status: dialog()?.querySelector("[role=status]")?.textContent ?? null };
""")

KEYBOARD_ON_A_GOAL = scenario("""
  const row = document.querySelector(".goal [role=link]");
  row.focus();
  rightClick(row, true);
  await sleep(50);
  const box = row.getBoundingClientRect();
  const m = menu()?.getBoundingClientRect();
  return { open: Boolean(menu()), focused: document.activeElement?.getAttribute("role") ?? null, nearRow: Boolean(m) && m.top >= box.top && m.top <= box.bottom + 8 };
""")

ESCAPE = scenario("""
  rightClick(document.querySelector(".goal .title"));
  await sleep(50);
  const opened = Boolean(menu());
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(50);
  return { opened, after: Boolean(menu()), dialog: dialog()?.open ?? false };
""")

TOP_BAR_BUTTON = scenario("""
  rightClick(document.querySelector(".goal .title"));
  await sleep(50);
  menu()?.querySelector("[role=menuitem]")?.click();
  await sleep(50);
  const picked = about();
  [...(dialog()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Close")?.click();
  await sleep(50);
  document.querySelector(".topfeedback").click();
  await sleep(50);
  const shown = { open: dialog()?.open ?? false, about: about() };
  await send("The page is slow.");
  return { picked, shown, sent };
""")

TYPED_TEXT = scenario(f"""
  const box = document.querySelector("input[type=search]");
  box.focus();
  type(box, {json.dumps(SECRET)});
  await sleep(300);
  rightClick(box);
  await sleep(50);
  const opened = Boolean(menu());
  menu()?.querySelector("[role=menuitem]")?.click();
  await sleep(50);
  const open = dialog()?.open ?? false;
  const shown = dialog()?.textContent ?? "";
  await send("Search did not find it.");
  return {{ opened, open, shown, sent }};
""")


class FeedbackMenuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app() as (open_page, api):
            first = api("/api/priorities")["funded"][0]
            goal = first["goals"][0]
            cls.goal = {"label": goal["summary"], "id": goal["id"], "kind": "goal", "breadcrumb": ["Home", first["title"]]}
            cls.picked, cls.keyboard, cls.escape, cls.top_bar, cls.typed = (open_page(1280, s) for s in (RIGHT_CLICK_A_GOAL, KEYBOARD_ON_A_GOAL, ESCAPE, TOP_BAR_BUTTON, TYPED_TEXT))

    def test_right_click_on_a_goal_opens_the_goalie_menu_with_feedback(self) -> None:
        self.assertFalse(self.picked["browserMenu"], "the browser's own menu must not open")
        self.assertEqual(self.picked["items"], ["Feedback..."])

    def test_choosing_feedback_opens_the_dialog_showing_that_goal(self) -> None:
        self.assertEqual(self.picked["shown"], {"open": True, "about": f"About: {self.goal['label']} (goal)"})

    def test_sending_posts_that_goals_focus(self) -> None:
        self.assertEqual(len(self.picked["sent"]), 1, self.picked)
        self.assertEqual(self.picked["sent"][0]["focus"], self.goal)
        self.assertEqual(self.picked["sent"][0]["note"], "The date looks wrong.")
        self.assertEqual(self.picked["status"], "Filed as issue #7")

    def test_the_menu_is_reachable_by_keyboard(self) -> None:
        # The ContextMenu key and Shift+F10 send contextmenu to the focused element with no pointer position.
        self.assertEqual(self.picked["focused"], "menuitem")
        self.assertEqual(self.keyboard, {"open": True, "focused": "menuitem", "nearRow": True})

    def test_escape_closes_the_menu(self) -> None:
        self.assertEqual(self.escape, {"opened": True, "after": False, "dialog": False})

    def test_the_top_bar_button_sends_no_focus(self) -> None:
        # Even right after a right-click picked a goal, the top-bar button picks nothing.
        self.assertEqual(self.top_bar["picked"], f"About: {self.goal['label']} (goal)")
        self.assertEqual(self.top_bar["shown"], {"open": True, "about": None})
        self.assertEqual(len(self.top_bar["sent"]), 1, self.top_bar)
        self.assertNotIn("focus", self.top_bar["sent"][0])

    def test_nothing_typed_in_a_field_is_posted(self) -> None:
        # Right-click on the search box, with words typed in it, still opens the menu and the dialog.
        self.assertEqual((self.typed["opened"], self.typed["open"]), (True, True), self.typed)
        self.assertEqual(len(self.typed["sent"]), 1, self.typed)
        self.assertNotIn(SECRET, json.dumps(self.typed["sent"]))
        self.assertNotIn(SECRET, self.typed["shown"])


if __name__ == "__main__":
    unittest.main()
