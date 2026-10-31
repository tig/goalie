"""Right-click anywhere in GOALIE, except in a text field, opens its own menu with "Feedback...". The element picked is the note's focus (#56).
Measured in headless Chrome on the built app. The mouse and the keys are real input through Chrome (measure_page.mjs), not dispatched events. The feedback post is caught in the page."""

from __future__ import annotations

import json
import unittest

from web_browser import signed_app

SECRET = "typed-words-must-not-leave-7731"

# Every scenario starts the same way: wait for Home, catch POST /api/feedback, record each contextmenu, and give helpers to the steps.
SETUP = """
  if (!document.querySelector(".goal") || !document.querySelector(".topfeedback")) return null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const input = (command) => new Promise((resolve, reject) => {
    window.__goalieInputDone ??= {};
    const id = Math.floor(Math.random() * 1e9);
    window.__goalieInputDone[id] = (error) => (error ? reject(new Error(error)) : resolve());
    window.goalieInput(JSON.stringify({ id, ...command }));
  });
  const sent = [];
  const real = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).endsWith("/api/feedback")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, issueUrl: "https://github.com/tig/goalie/issues/7", number: 7 }), { status: 201, headers: { "content-type": "application/json" } });
    }
    return real(url, init);
  };
  // A contextmenu that GOALIE does not prevent is the browser's own menu.
  const menus = [];
  window.addEventListener("contextmenu", (e) => menus.push({ browser: !e.defaultPrevented }));
  const at = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + Math.min(10, r.width / 2), y: r.top + r.height / 2 }; };
  const rightClick = async (el) => { await input({ mouse: "right", ...at(el) }); await sleep(80); };
  const click = async (el) => { await input({ mouse: "left", ...at(el) }); await sleep(80); };
  const key = async (name, shift = false) => { await input({ key: name, shift }); await sleep(80); };
  const menu = () => document.querySelector("[role=menu]");
  const dialog = () => document.querySelector("dialog.feedback");
  const about = () => dialog()?.querySelector(".feedbackabout")?.textContent ?? null;
  const pickFeedback = async () => { const item = menu()?.querySelector("[role=menuitem]"); if (item) await click(item); };
  const send = async (note) => {
    await click(dialog().querySelector("textarea"));
    await input({ text: note });
    await sleep(50);
    await click(dialog().querySelector("button[type=submit]"));
    await sleep(300);
  };
"""


def scenario(steps: str) -> str:
    return f"(async () => {{ {SETUP} {steps} }})()"


RIGHT_CLICK_A_GOAL = scenario("""
  await rightClick(document.querySelector(".goal .title"));
  const items = menu() ? [...menu().querySelectorAll("[role=menuitem]")].map((e) => e.textContent) : null;
  const focused = document.activeElement?.getAttribute("role") ?? null;
  await pickFeedback();
  const shown = { open: dialog()?.open ?? false, about: about() };
  if (shown.open) await send("The date looks wrong.");
  return { menus, items, focused, shown, sent, status: dialog()?.querySelector("[role=status]")?.textContent ?? null };
""")


def keyboard(name: str, shift: bool) -> str:
    return scenario(f"""
  const row = document.querySelector(".goal [role=link]");
  row.focus();
  await key({json.dumps(name)}, {json.dumps(shift)});
  const box = row.getBoundingClientRect();
  const m = menu()?.getBoundingClientRect();
  return {{ open: Boolean(menu()), focused: document.activeElement?.getAttribute("role") ?? null, nearRow: Boolean(m) && m.top >= box.top && m.top <= box.bottom + 8 }};
""")


ESCAPE = scenario("""
  await rightClick(document.querySelector(".goal .title"));
  const opened = Boolean(menu());
  await key("Escape");
  return { opened, after: Boolean(menu()), dialog: dialog()?.open ?? false };
""")

TOP_BAR_BUTTON = scenario("""
  await rightClick(document.querySelector(".goal .title"));
  await pickFeedback();
  const picked = about();
  const close = [...(dialog()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Close");
  if (close) await click(close);
  await click(document.querySelector(".topfeedback"));
  const shown = { open: dialog()?.open ?? false, about: about() };
  await send("The page is slow.");
  return { picked, shown, sent };
""")

TEXT_FIELD = scenario(f"""
  const box = document.querySelector("input[type=search]");
  await click(box);
  await input({{ text: {json.dumps(SECRET)} }});
  await sleep(300);
  await rightClick(box);
  const inField = {{ menus: [...menus], goalie: Boolean(menu()) }};
  if (menu()) await key("Escape");
  await rightClick(document.querySelector(".board h2"));
  const opened = Boolean(menu());
  await pickFeedback();
  const open = dialog()?.open ?? false;
  const shown = dialog()?.textContent ?? "";
  await send("Search did not find it.");
  return {{ inField, opened, open, shown, sent }};
""")


class FeedbackMenuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app() as (open_page, api):
            first = api("/api/priorities")["funded"][0]
            goal = first["goals"][0]
            cls.goal = {"label": goal["summary"], "id": goal["id"], "kind": "goal", "breadcrumb": ["Home", first["title"]]}
            pages = (RIGHT_CLICK_A_GOAL, keyboard("F10", True), keyboard("ContextMenu", False), ESCAPE, TOP_BAR_BUTTON, TEXT_FIELD)
            cls.picked, cls.shift_f10, cls.menu_key, cls.escape, cls.top_bar, cls.field = (open_page(1280, s) for s in pages)

    def test_right_click_on_a_goal_opens_the_goalie_menu_with_feedback(self) -> None:
        self.assertEqual(self.picked["menus"], [{"browser": False}], "the browser's own menu must not open")
        self.assertEqual(self.picked["items"], ["Feedback..."])

    def test_choosing_feedback_opens_the_dialog_showing_that_goal(self) -> None:
        self.assertEqual(self.picked["shown"], {"open": True, "about": f"About: {self.goal['label']} (goal)"})

    def test_sending_posts_that_goals_focus(self) -> None:
        self.assertEqual(len(self.picked["sent"]), 1, self.picked)
        self.assertEqual(self.picked["sent"][0]["focus"], self.goal)
        self.assertEqual(self.picked["sent"][0]["note"], "The date looks wrong.")
        self.assertEqual(self.picked["status"], "Filed as issue #7")

    def test_the_menu_takes_keyboard_focus(self) -> None:
        self.assertEqual(self.picked["focused"], "menuitem")

    def test_shift_f10_opens_the_menu_on_the_focused_element(self) -> None:
        self.assertEqual(self.shift_f10, {"open": True, "focused": "menuitem", "nearRow": True})

    def test_the_context_menu_key_opens_the_menu_on_the_focused_element(self) -> None:
        self.assertEqual(self.menu_key, {"open": True, "focused": "menuitem", "nearRow": True})

    def test_escape_closes_the_menu(self) -> None:
        self.assertEqual(self.escape, {"opened": True, "after": False, "dialog": False})

    def test_the_top_bar_button_sends_no_focus(self) -> None:
        # Even right after a right-click picked a goal, the top-bar button picks nothing.
        self.assertEqual(self.top_bar["picked"], f"About: {self.goal['label']} (goal)")
        self.assertEqual(self.top_bar["shown"], {"open": True, "about": None})
        self.assertEqual(len(self.top_bar["sent"]), 1, self.top_bar)
        self.assertNotIn("focus", self.top_bar["sent"][0])

    def test_a_text_field_keeps_the_browsers_menu(self) -> None:
        # As in the Canon Viewer: its menu opens only on a picked element, and its text fields keep the browser's menu, so paste and spelling work.
        self.assertEqual(self.field["inField"], {"menus": [{"browser": True}], "goalie": False})

    def test_nothing_typed_in_a_field_is_posted(self) -> None:
        self.assertEqual((self.field["opened"], self.field["open"]), (True, True), self.field)
        self.assertEqual(len(self.field["sent"]), 1, self.field)
        self.assertNotIn(SECRET, json.dumps(self.field["sent"]))
        self.assertNotIn(SECRET, self.field["shown"])


if __name__ == "__main__":
    unittest.main()
