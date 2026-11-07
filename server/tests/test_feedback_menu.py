"""Right-click anywhere in GOALIE, except in a text field, opens its own menu with "Feedback...". The element picked is the note's focus (#56).
Measured in headless Chrome on the built app. The mouse and the keys are real input through Chrome (measure_page.mjs), not dispatched events. The feedback post is caught in the page."""

from __future__ import annotations

import json
import unittest

from web_browser import signed_app

SECRET = "typed-words-must-not-leave-7731"

# Every scenario starts the same way: wait for Home, catch POST /api/feedback, record each contextmenu, and give helpers to the steps.
SETUP = """
  if (!document.querySelector(".topfeedback") || !document.querySelector(READY)) return null;
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
      if (window.__refuse) return new Response(JSON.stringify({ error: "not_found", reason: "no API route POST /api/feedback" }), { status: 404, headers: { "content-type": "application/json" } });
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


def scenario(steps: str, ready: str = ".goal") -> str:
    return f"(async () => {{ const READY = {json.dumps(ready)}; {SETUP} {steps} }})()"


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
  return {{ open: Boolean(menu()), focused: document.activeElement?.getAttribute("role") ?? null, nearRow: Boolean(m) && m.top >= box.top && m.top <= box.bottom + 8, browser: menus.some((x) => x.browser) }};
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


# Shift+F10 opens GOALIE's menu. A contextmenu that then arrives on its own item (here the real ContextMenu key) must not open the browser's menu over it.
BOTH_MENUS = scenario("""
  document.querySelector(".goal [role=link]").focus();
  await key("F10", true);
  const opened = Boolean(menu());
  await key("ContextMenu");
  return { opened, menus, open: Boolean(menu()), target: document.activeElement?.getAttribute("role") ?? null };
""")

# Keyboard focus comes back to the row: after the menu closes, and after the dialog closes by Escape, by Close, or after Send.
FOCUS_BACK = scenario("""
  const row = document.querySelector(".goal [role=link]");
  const onRow = () => document.activeElement === row;
  const out = {};
  row.focus(); await key("F10", true); await key("Escape"); out.menuEscape = onRow();
  row.focus(); await key("F10", true); await key("Tab"); out.menuTab = { closed: !menu() };
  row.focus(); await key("F10", true); await key("Enter"); out.dialogOpen = dialog()?.open ?? false; await key("Escape"); out.dialogEscape = onRow();
  row.focus(); await key("F10", true); await key("Enter");
  await click([...dialog().querySelectorAll("button")].find((b) => b.textContent === "Close")); out.dialogClose = onRow();
  row.focus(); await key("F10", true); await key("Enter"); await send("Focus test."); out.sent = sent.length; await key("Escape"); out.afterSend = onRow();
  return out;
""")

OUTSIDE_CLICK = scenario("""
  await rightClick(document.querySelector(".goal .title"));
  const opened = Boolean(menu());
  await click(document.querySelector("main h1"));
  return { opened, after: Boolean(menu()) };
""")

# The picked element keeps a mark while the menu and the dialog are open, and loses it when the dialog closes.
MARK = scenario("""
  const goal = document.querySelector(".goal");
  await rightClick(goal.querySelector(".title"));
  const inMenu = [...document.querySelectorAll("[data-feedback-focused]")].map((e) => e === goal);
  await pickFeedback();
  const inDialog = [...document.querySelectorAll("[data-feedback-focused]")].map((e) => e === goal);
  await key("Escape");
  return { inMenu, inDialog, after: document.querySelectorAll("[data-feedback-focused]").length };
""")

# The feedback control and its dialog keep the browser's menu.
CHROME = scenario("""
  await rightClick(document.querySelector(".topfeedback"));
  const button = { menus: [...menus], goalie: Boolean(menu()) };
  await click(document.querySelector(".topfeedback"));
  menus.length = 0;
  await rightClick(dialog().querySelector("h2"));
  return { button, dialog: { menus: [...menus], goalie: Boolean(menu()) } };
""")

AVATAR = scenario("""
  await rightClick(document.querySelector(".goal .av"));
  await pickFeedback();
  const shown = about();
  await send("Owner looks wrong.");
  return { shown, sent };
""")

WORK_ROW = scenario("""
  const row = document.querySelector(".wrow");
  const title = row.querySelector(".wtitle").textContent;
  await rightClick(row.querySelector(".wtitle"));
  await pickFeedback();
  const shown = about();
  await send("This item is done.");
  return { title, shown, sent };
""", ready=".wrow")

GOAL_PAGE = scenario("""
  await rightClick(document.querySelector(".gtitle"));
  await pickFeedback();
  const title = about();
  await send("Title note.");
  await key("Escape");
  const state = [...document.querySelectorAll(".prop .plabel")].find((e) => e.textContent === "State");
  await rightClick(state);
  await pickFeedback();
  const field = about();
  await send("State note.");
  await key("Escape");
  const owner = [...document.querySelectorAll(".prop .plabel")].find((e) => e.textContent === "Owner");
  await rightClick(owner);
  await pickFeedback();
  const ownerField = about();
  await send("Owner note.");
  return { title, field, ownerField, sent };
""", ready=".gtitle")

# Chelsea, tig/goalie#68: a pick names the smallest part under the pointer. A section, an Activity entry, and a button each name themselves, not the whole goal.
GRANULAR = scenario("""
  const pick = async (el, note) => {
    el.scrollIntoView({ block: "center" });
    await rightClick(el);
    await pickFeedback();
    const shown = about();
    await send(note);
    await key("Escape");
    return shown;
  };
  const section = await pick(document.querySelector(".gdesc h2"), "Section note.");
  const chip = await pick(document.querySelector(".gtalk .fchip"), "Chip note.");
  const entry = await pick(document.querySelector(".gtalk .erow p"), "Entry note.");
  return { section, chip, entry, sent };
""", ready=".gtalk .erow")

# Every edit form on a goal page is the pick for anything inside it: the field form, a panel, the two add rows, and the comment box.
EDIT_FORMS = scenario("""
  const byText = (text) => [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === text || b.getAttribute("aria-label") === text);
  const aboutIn = async (root) => {
    await rightClick([...root.querySelectorAll("button")].at(-1));
    await pickFeedback();
    const shown = about();
    await key("Escape");
    // Close the form, so the next one can open.
    const cancel = [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel");
    if (cancel) await click(cancel);
    return shown;
  };
  const out = {};
  await click(byText("Change Owner")); out.change = await aboutIn(document.querySelector(".pform"));
  await click(byText("At risk")); const panel = document.querySelector("section.panel:not(.addrow)"); out.panel = [await aboutIn(panel), panel.getAttribute("aria-label")];
  await click(byText("+ Add sub-goal")); out.subGoal = await aboutIn(document.querySelector("section.addrow[aria-label='Sub-goal']"));
  await click(byText("+ Add work item")); out.workItem = await aboutIn(document.querySelector("section.addrow[aria-label='Work item']"));
  out.comment = await aboutIn(document.querySelector("form.commentbox"));
  return out;
""", ready=".gtitle")

# A note that was not sent stays in the box. A note that was sent leaves it.
KEPT = scenario("""
  window.__refuse = true;
  await click(document.querySelector(".topfeedback"));
  await send("Keep this note.");
  const refused = { value: dialog().querySelector("textarea").value, status: dialog().querySelector("[role=status]").textContent };
  window.__refuse = false;
  await click(dialog().querySelector("button[type=submit]"));
  await sleep(300);
  return { refused, sent: { value: dialog().querySelector("textarea").value, status: dialog().querySelector("[role=status]").textContent } };
""")

# A right-click at the screen's right edge opens the menu 8 px inside it.
EDGE = scenario("""
  const row = document.querySelector(".goal [role=link]").getBoundingClientRect();
  await input({ mouse: "right", x: innerWidth - 3, y: row.top + row.height / 2 });
  await sleep(80);
  const m = menu()?.getBoundingClientRect();
  return { width: innerWidth, right: m ? m.right : null };
""")

CALENDAR_CHIP = scenario("""
  const chip = document.querySelector(".chip");
  const title = chip.querySelector(".ctitle").textContent;
  await rightClick(chip);
  await pickFeedback();
  return { title, shown: about() };
""", ready=".chip")

# Dubric's case on #57: pick Tig in the New goal form's Owner select, then right-click the owner avatar beside it.
NEW_GOAL_FORM = scenario("""
  const select = document.querySelector(".ownerpick select");
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "tig");
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(100);
  const avatar = document.querySelector(".ownerpick .av");
  const showing = avatar.getAttribute("aria-label");
  await rightClick(avatar);
  await pickFeedback();
  const shown = about();
  await send("The owner list is long.");
  return { showing, shown, sent };
""", ready=".ownerpick select")


# Escape while feedback is open on Github... closes feedback only. A second Escape closes the owner menu.
OWNER_ESCAPE = scenario("""
  const button = document.querySelector(".me button.av");
  if (!button) return { error: "no owner button" };
  const label = button.getAttribute("aria-label");
  await click(button);
  const item = document.querySelector(".usermenu [role=menuitem]");
  if (!item) return { error: "owner menu did not open", label };
  await rightClick(item);
  if (!document.querySelector("[data-feedback-ui][role=menu]")) return { error: "feedback menu did not open", label };
  await key("Escape");
  const afterFirst = {
    feedback: Boolean(document.querySelector("[data-feedback-ui][role=menu]")),
    owner: Boolean(document.querySelector(".usermenu")),
    role: document.activeElement?.getAttribute("role") ?? null,
    text: (document.activeElement?.textContent || "").trim(),
  };
  await key("Escape");
  return {
    label,
    afterFirst,
    afterSecond: {
      owner: Boolean(document.querySelector(".usermenu")),
      label: document.activeElement?.getAttribute("aria-label") ?? null,
      same: document.activeElement === document.querySelector(".me button.av"),
    },
  };
""", ready=".me button.av")


class OwnerMenuEscapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app(actor="tig") as (open_page, _api):
            cls.result = open_page(1280, OWNER_ESCAPE)

    def test_escape_closes_feedback_then_the_owner_menu(self) -> None:
        """The first Escape closes feedback and returns to Github.... The second closes the owner menu and returns to the avatar."""
        got = self.result
        self.assertNotIn("error", got, got)
        self.assertEqual(got["afterFirst"], {"feedback": False, "owner": True, "role": "menuitem", "text": "Github..."})
        self.assertEqual(got["afterSecond"], {"owner": False, "label": got["label"], "same": True})


class FeedbackMenuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # The build-team seed adds work items, so the Work items page has rows.
        with signed_app("seed/build-team.json") as (open_page, api):
            first = api("/api/priorities")["funded"][0]
            goal = first["goals"][0]
            cls.goal = {"label": goal["summary"], "id": goal["id"], "kind": "goal", "breadcrumb": ["Home", first["title"]]}
            cls.owner = goal["owner"]
            pages = (RIGHT_CLICK_A_GOAL, keyboard("F10", True), keyboard("ContextMenu", False), ESCAPE, TOP_BAR_BUTTON, TEXT_FIELD, BOTH_MENUS, FOCUS_BACK, OUTSIDE_CLICK, MARK, CHROME, AVATAR)
            cls.picked, cls.shift_f10, cls.menu_key, cls.escape, cls.top_bar, cls.field, cls.both, cls.back, cls.outside, cls.mark, cls.chrome, cls.avatar = (open_page(1280, s) for s in pages)
            cls.work_ids = {i["id"] for i in api("/api/work")["items"]}
            cls.work = open_page(1280, WORK_ROW, "/work")
            cls.goal_page = open_page(1280, GOAL_PAGE, f"/goals/{goal['id']}")
            cls.granular = open_page(1280, GRANULAR, f"/goals/{goal['id']}")
            cls.form = open_page(1280, NEW_GOAL_FORM, "/goals/new")
            cls.kept, cls.edge = open_page(1280, KEPT), open_page(1280, EDGE)
            cls.chip = open_page(1280, CALENDAR_CHIP, "/?view=calendar")
            # A goal Chelsea owns, so she may change it and its edit forms open.
            mine = next(g["id"] for p in api("/api/priorities")["funded"] for g in p["goals"] if g["owner"]["id"] == "chelsea")
            cls.forms = open_page(1280, EDIT_FORMS, f"/goals/{mine}")

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
        self.assertEqual(self.shift_f10, {"open": True, "focused": "menuitem", "nearRow": True, "browser": False})

    def test_the_context_menu_key_opens_the_menu_on_the_focused_element(self) -> None:
        self.assertEqual(self.menu_key, {"open": True, "focused": "menuitem", "nearRow": True, "browser": False})

    def test_a_contextmenu_on_goalies_open_menu_is_prevented(self) -> None:
        self.assertTrue(self.both["opened"], self.both)
        self.assertEqual(self.both["menus"], [{"browser": False}], self.both)
        self.assertTrue(self.both["open"], self.both)

    def test_keyboard_focus_comes_back_to_the_row(self) -> None:
        self.assertEqual(self.back, {"menuEscape": True, "menuTab": {"closed": True}, "dialogOpen": True, "dialogEscape": True, "dialogClose": True, "sent": 1, "afterSend": True})

    def test_a_click_outside_closes_the_menu(self) -> None:
        self.assertEqual(self.outside, {"opened": True, "after": False})

    def test_the_picked_element_is_marked_until_the_dialog_closes(self) -> None:
        self.assertEqual(self.mark, {"inMenu": [True], "inDialog": [True], "after": 0})

    def test_the_feedback_control_and_dialog_keep_the_browsers_menu(self) -> None:
        self.assertEqual(self.chrome, {"button": {"menus": [{"browser": True}], "goalie": False}, "dialog": {"menus": [{"browser": True}], "goalie": False}})

    def test_an_avatar_is_its_actor(self) -> None:
        name = self.owner["name"]
        self.assertEqual(self.avatar["shown"], f"About: {name} (actor)")
        self.assertEqual(self.avatar["sent"][0]["focus"], {"label": name, "id": self.owner["id"], "kind": "actor", "breadcrumb": self.goal["breadcrumb"] + [self.goal["label"]]})

    def test_a_work_row_is_its_work_item(self) -> None:
        self.assertEqual(self.work["shown"], f"About: {self.work['title']} (work item)")
        focus = self.work["sent"][0]["focus"]
        self.assertEqual((focus["kind"], focus["label"], focus["breadcrumb"]), ("work item", self.work["title"], ["Work items"]))
        self.assertIn(focus["id"], self.work_ids)

    def test_the_goal_page_is_its_goal_and_a_field_is_its_name_only(self) -> None:
        self.assertEqual(self.goal_page["title"], f"About: {self.goal['label']} (goal)")
        self.assertEqual(self.goal_page["sent"][0]["focus"], {"label": self.goal["label"], "id": self.goal["id"], "kind": "goal", "breadcrumb": ["Goal page"]})
        self.assertEqual(self.goal_page["field"], "About: State (field)")
        self.assertEqual(self.goal_page["sent"][1]["focus"], {"label": "State", "id": "State", "kind": "field", "breadcrumb": ["Goal page", self.goal["label"]]})
        # A field with a value to change is its name and its field id, never its value.
        self.assertEqual(self.goal_page["ownerField"], "About: Owner (field)")
        self.assertEqual(self.goal_page["sent"][2]["focus"], {"label": "Owner", "id": "owner", "kind": "field", "breadcrumb": ["Goal page", self.goal["label"]]})

    def test_a_section_an_activity_entry_and_a_button_each_name_themselves(self) -> None:
        # tig/goalie#68: the note said "the whole goal" for a right-click on part of it.
        at = ["Goal page", self.goal["label"]]
        self.assertEqual(len(self.granular["sent"]), 3, self.granular)
        section, chip, entry = (x["focus"] for x in self.granular["sent"])
        self.assertEqual(section, {"label": "Description", "id": "Description", "kind": "section", "breadcrumb": at})
        self.assertEqual((chip["kind"], chip["label"].split()[0], chip["breadcrumb"]), ("control", "All", at + ["Activity"]))
        self.assertIn(entry["kind"], ("comment", "change"))
        self.assertEqual(entry["breadcrumb"], at + ["Activity"])

    def test_a_calendar_chip_is_its_goal(self) -> None:
        self.assertEqual(self.chip["shown"], f"About: {self.chip['title']} (goal)")

    def test_a_note_not_sent_stays_and_a_sent_note_leaves(self) -> None:
        self.assertEqual(self.kept, {"refused": {"value": "Keep this note.", "status": "Feedback is not available. Your issue was not sent."}, "sent": {"value": "", "status": "Filed as issue #7"}})

    def test_the_menu_stays_8_px_inside_the_screen(self) -> None:
        self.assertIsNotNone(self.edge["right"], self.edge)
        self.assertLessEqual(self.edge["right"], self.edge["width"] - 8, self.edge)
        self.assertGreater(self.edge["right"], self.edge["width"] - 40, self.edge)

    def test_every_edit_form_on_a_goal_page_is_the_pick_inside_it(self) -> None:
        panel, title = self.forms["panel"]
        self.assertEqual({**self.forms, "panel": panel}, {"change": "About: Change Owner (form)", "panel": f"About: {title} (form)", "subGoal": "About: Sub-goal (form)", "workItem": "About: Work item (form)", "comment": "About: Comment (form)"})

    def test_in_the_new_goal_form_the_form_is_the_focus_not_the_owner_picked(self) -> None:
        self.assertEqual(self.form["showing"], "Tig", self.form)
        self.assertEqual(self.form["shown"], "About: New goal (form)")
        self.assertEqual(self.form["sent"][0]["focus"], {"label": "New goal", "id": "New goal", "kind": "form", "breadcrumb": ["New goal"]})
        self.assertNotIn("Tig", json.dumps(self.form["sent"]))

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
