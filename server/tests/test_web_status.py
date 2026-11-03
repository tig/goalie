"""A work item's status is one pill with a menu, the same on the Work items page and on a goal page (W7).
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
  const click = async (el) => { el.scrollIntoView({ block: "center" }); await input({ mouse: "left", ...at(el) }); await sleep(150); };
  const type = async (text) => { await input({ text }); await sleep(60); };
  const key = async (name) => { await input({ key: name }); await sleep(150); };
  const item = (name) => [...document.querySelectorAll("[role=menu] [role=menuitemradio]")].find((b) => b.textContent.includes(name));
"""


def scenario(steps: str, ready: str) -> str:
    return f"(async () => {{ const READY = {json.dumps(ready)}; {SETUP} {steps} }})()"


# Completed saves in one press, with the reason "Marked Completed": no reason row opens.
COMPLETE_ON_WORK_PAGE = scenario("""
  const row = [...document.querySelectorAll(".wrow")].find((r) => r.querySelector(".spill")?.textContent.includes("In Progress"));
  if (!row) return { pill: false };
  const id = JSON.parse(row.dataset.focus).id;
  const controls = row.querySelectorAll("input[type=checkbox], select").length;
  await click(row.querySelector(".spill"));
  const menu = [...document.querySelectorAll("[role=menu] [role=menuitemradio]")].map((b) => b.textContent.trim());
  await click(item("Completed"));
  const asked = Boolean(row.querySelector(".tickreason input"));
  await sleep(800);
  const after = await (await fetch("/api/work")).json();
  return { pill: true, controls, menu, asked, status: after.items.find((i) => i.id === id).status };
""", ready=".wrow")

# Any other status asks for its reason: the field takes the keys, Save waits for a reason, and Enter saves.
BACKLOG_ON_WORK_PAGE = scenario("""
  const row = [...document.querySelectorAll(".wrow")].find((r) => r.querySelector(".spill")?.textContent.includes("In Progress"));
  const id = JSON.parse(row.dataset.focus).id;
  await click(row.querySelector(".spill"));
  await click(item("Backlog"));
  const reason = row.querySelector(".tickreason input");
  const focused = document.activeElement === reason;
  const waits = row.querySelector(".tickreason button.primary")?.disabled ?? null;
  await type("Not this week");
  await key("Enter");
  await sleep(800);
  const after = await (await fetch("/api/work")).json();
  return { focused, waits, status: after.items.find((i) => i.id === id).status };
""", ready=".wrow")

# On a goal page, choose Backlog, then Escape: the reason box closes and the pill shows the stored status again.
ESCAPE_ON_GOAL_PAGE = scenario("""
  const row = document.querySelector(".wrow2");
  const pill = row?.querySelector(".spill");
  if (!pill) return { pill: false };
  const before = pill.textContent.trim();
  await click(pill);
  await click(item(before.includes("Backlog") ? "In Progress" : "Backlog"));
  const opened = Boolean(row.querySelector(".tickreason"));
  await key("Escape");
  return { pill: true, opened, closed: !row.querySelector(".tickreason"), same: row.querySelector(".spill").textContent.trim() === before };
""", ready=".wrow2")


class StatusPillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app("seed/build-team.json") as (open_page, api):
            cls.work = open_page(1280, COMPLETE_ON_WORK_PAGE, "/work")
            cls.backlog = open_page(1280, BACKLOG_ON_WORK_PAGE, "/work")
            goal = next(i["goal"] for i in api("/api/work")["items"] if i["status"] in ("In Progress", "Backlog"))
            cls.goal = open_page(1280, ESCAPE_ON_GOAL_PAGE, f"/goals/{goal}")

    def test_a_row_has_one_status_control_a_pill_with_a_menu_of_every_status(self) -> None:
        self.assertTrue(self.work["pill"], "each work row has a status pill")
        self.assertEqual(self.work["controls"], 0, "no checkbox and no select beside it")
        self.assertEqual(self.work["menu"], ["Backlog", "In Progress", "Completed", "Deleted"])

    def test_completed_saves_in_one_press_without_asking_a_reason(self) -> None:
        self.assertFalse(self.work["asked"], "no reason row for Completed")
        self.assertEqual(self.work["status"], "Completed")

    def test_another_status_asks_for_its_reason_and_enter_saves_it(self) -> None:
        self.assertTrue(self.backlog["focused"], "the reason field takes the keys at once")
        self.assertTrue(self.backlog["waits"], "Save waits for a reason")
        self.assertEqual(self.backlog["status"], "Backlog")

    def test_escape_on_a_goal_page_undoes_the_choice(self) -> None:
        self.assertTrue(self.goal["pill"], "a goal page work row has the same pill")
        self.assertTrue(self.goal["opened"])
        self.assertTrue(self.goal["closed"])
        self.assertTrue(self.goal["same"])


if __name__ == "__main__":
    unittest.main()
