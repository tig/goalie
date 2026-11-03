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


# Press a row's pill, choose Completed, see Save wait for a reason, write one, and save with Enter.
COMPLETE_ON_WORK_PAGE = scenario("""
  const row = [...document.querySelectorAll(".wrow")].find((r) => r.querySelector(".spill")?.textContent.includes("In Progress"));
  if (!row) return { pill: false };
  const id = JSON.parse(row.dataset.focus).id;
  const controls = row.querySelectorAll("input[type=checkbox], select").length;
  await click(row.querySelector(".spill"));
  const menu = [...document.querySelectorAll("[role=menu] [role=menuitemradio]")].map((b) => b.textContent.trim());
  await click(item("Completed"));
  const reason = row.querySelector(".tickreason input");
  const focused = document.activeElement === reason;
  const waits = row.querySelector(".tickreason button.primary")?.disabled ?? null;
  await type("Shipped");
  await key("Enter");
  await sleep(800);
  const after = await (await fetch("/api/work")).json();
  return { pill: true, controls, menu, focused, waits, status: after.items.find((i) => i.id === id).status };
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
            goal = next(i["goal"] for i in api("/api/work")["items"] if i["status"] == "In Progress")
            cls.goal = open_page(1280, ESCAPE_ON_GOAL_PAGE, f"/goals/{goal}")

    def test_a_row_has_one_status_control_a_pill_with_a_menu_of_every_status(self) -> None:
        self.assertTrue(self.work["pill"], "each work row has a status pill")
        self.assertEqual(self.work["controls"], 0, "no checkbox and no select beside it")
        self.assertEqual(self.work["menu"], ["Backlog", "In Progress", "Completed", "Deleted"])

    def test_a_new_status_asks_for_its_reason_and_enter_saves_it(self) -> None:
        self.assertTrue(self.work["focused"], "the reason field takes the keys at once")
        self.assertTrue(self.work["waits"], "Save waits for a reason")
        self.assertEqual(self.work["status"], "Completed")

    def test_escape_on_a_goal_page_undoes_the_choice(self) -> None:
        self.assertTrue(self.goal["pill"], "a goal page work row has the same pill")
        self.assertTrue(self.goal["opened"])
        self.assertTrue(self.goal["closed"])
        self.assertTrue(self.goal["same"])


if __name__ == "__main__":
    unittest.main()
