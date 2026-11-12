"""A work item is edited in place: its title, owner, start date, and due date, with a reason, on the Work items page and on a goal page (#66, W6).
Measured in headless Chrome on the built app, signed in as Chelsea. The mouse and the keys are real input through Chrome (measure_page.mjs)."""

from __future__ import annotations

import json
import unittest

from web_browser import signed_app

SETUP = """
  if (!document.querySelector(READY)) return null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const input = (command) => new Promise((resolve, reject) => {
    window.__goalieInputDone ??= {};
    const id = Math.floor(Math.random() * 1e9);
    window.__goalieInputDone[id] = (error) => (error ? reject(new Error(error)) : resolve());
    window.goalieInput(JSON.stringify({ id, ...command }));
  });
  const at = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const click = async (el) => { await input({ mouse: "left", ...at(el) }); await sleep(120); };
  const type = async (text) => { await input({ text }); await sleep(60); };
  const key = async (name) => { await input({ key: name }); await sleep(120); };
  const editor = () => document.querySelector(".wiedit");
"""


def scenario(steps: str, ready: str) -> str:
    return f"(async () => {{ const READY = {json.dumps(ready)}; {SETUP} {steps} }})()"


# Open the first row's pencil, type a new title over the old one, give a reason, and save with Enter.
EDIT_ON_WORK_PAGE = scenario("""
  const row = document.querySelector(".wrow");
  const id = JSON.parse(row.dataset.focus).id;
  const pencil = row.querySelector("button.pencil");
  if (!pencil) return { id, pencil: false };
  await click(pencil);
  const box = editor();
  const before = box ? { title: box.querySelector("input[aria-label=Title]").value, focused: document.activeElement === box.querySelector("input[aria-label=Title]") } : null;
  await type("Edited by test 66");
  await click(box.querySelector("input[aria-label=Reason]"));
  await type("Tig asked");
  await key("Enter");
  await sleep(600);
  const after = await (await fetch("/api/work")).json();
  return { id, pencil: true, before, title: after.items.find((i) => i.id === id).title, open: Boolean(editor()) };
""", ready=".wrow")

# Escape closes the editor and keeps the stored title.
ESCAPE_ON_GOAL_PAGE = scenario("""
  const row = document.querySelector(".wrow2");
  const pencil = row?.querySelector("button.pencil");
  if (!pencil) return { pencil: false };
  const title = row.querySelector(".wtitle").textContent;
  await click(pencil);
  const opened = Boolean(editor());
  await type(" changed");
  await key("Escape");
  return { pencil: true, opened, closed: !editor(), title: row.querySelector(".wtitle").textContent === title };
""", ready=".wrow2")

# #73: the editor has a Start Date. A date input takes no typed text in a way that is the same in every locale, so the value is set as the date picker sets it.
START_ON_WORK_PAGE = scenario("""
  const row = document.querySelectorAll(".wrow")[1];
  const id = JSON.parse(row.dataset.focus).id;
  await click(row.querySelector("button.pencil"));
  const box = editor();
  const start = box?.querySelector("input[aria-label='Start Date']");
  if (!start) return { id, start: false };
  const item = (await (await fetch("/api/work")).json()).items.find((i) => i.id === id);
  const day = item.due_date ?? "2026-11-01";
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(start, day);
  start.dispatchEvent(new Event("input", { bubbles: true }));
  await click(box.querySelector("input[aria-label=Reason]"));
  await type("Work starts");
  await key("Enter");
  await sleep(600);
  const after = (await (await fetch("/api/work")).json()).items.find((i) => i.id === id);
  return { id, start: true, day, saved: after.start_date, open: Boolean(editor()) };
""", ready=".wrow")


class WorkItemEditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app("seed/build-team.json") as (open_page, api):
            cls.work = open_page(1280, EDIT_ON_WORK_PAGE, "/work")
            cls.start = open_page(1280, START_ON_WORK_PAGE, "/work")
            goal = next(i["goal"] for i in api("/api/work")["items"] if i["status"] == "In Progress")
            cls.goal = open_page(1280, ESCAPE_ON_GOAL_PAGE, f"/goals/{goal}")

    def test_a_work_row_has_a_pencil_that_opens_its_editor_with_the_title_selected(self) -> None:
        self.assertTrue(self.work["pencil"], "a human sees the pencil on every work row")
        self.assertTrue(self.work["before"]["focused"])

    def test_typing_a_title_and_a_reason_and_pressing_enter_saves_it(self) -> None:
        self.assertEqual(self.work["title"], "Edited by test 66")
        self.assertFalse(self.work["open"], "a saved editor closes")

    def test_the_goal_page_has_the_same_editor_and_escape_keeps_the_title(self) -> None:
        self.assertEqual(self.goal, {"pencil": True, "opened": True, "closed": True, "title": True})

    def test_the_editor_saves_a_start_date(self) -> None:
        self.assertTrue(self.start["start"], "the editor shows Start Date")
        self.assertEqual(self.start["saved"], self.start["day"])
        self.assertFalse(self.start["open"])


if __name__ == "__main__":
    unittest.main()
