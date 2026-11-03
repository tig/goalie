"""Complete closes an In Progress goal in two steps: press Complete, write the reason, press Enter (tig/goalie#68, GL6e).
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
  const button = (text) => [...document.querySelectorAll(".gprops button")].find((b) => b.textContent.trim() === text);
"""


def scenario(steps: str, ready: str) -> str:
    return f"(async () => {{ const READY = {json.dumps(ready)}; {SETUP} {steps} }})()"


COMPLETE = scenario("""
  const id = JSON.parse(document.querySelector("main.goalpage").dataset.focus).id;
  const complete = button("Complete");
  if (!complete) return { id, button: false };
  await click(complete);
  const panel = document.querySelector("section.panel[aria-label=Complete]");
  const focused = document.activeElement === panel?.querySelector("textarea");
  const says = panel?.querySelector("p.small")?.textContent ?? null;
  await type("Shipped");
  await key("Enter");
  await sleep(800);
  const goal = (await (await fetch(`/api/goals/${id}`)).json()).goal;
  return { id, button: true, focused, says, state: goal.state, status: document.querySelector(".gstatus")?.textContent ?? null };
""", ready=".gprops")


class CompleteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app() as (open_page, api):
            # A goal Chelsea owns, In Progress, whose Committed date is still ahead, so it closes as Completed.
            mine = next(g for g in ("XW-0005", "XW-0004") if api(f"/api/goals/{g}")["goal"]["owner"] == "chelsea" and api(f"/api/goals/{g}")["closesAs"] == "Completed")
            cls.done = open_page(1280, COMPLETE, f"/goals/{mine}")

    def test_complete_is_one_press_and_its_reason_field_takes_the_keys(self) -> None:
        self.assertTrue(self.done["button"], "an owner sees Complete on an In Progress goal")
        self.assertTrue(self.done["focused"], "the reason field takes the keys at once")
        self.assertIn("Completed", self.done["says"])

    def test_enter_closes_the_goal_as_completed(self) -> None:
        self.assertEqual(self.done["state"], "Completed")
        self.assertEqual(self.done["status"], "Closed as Completed.")


if __name__ == "__main__":
    unittest.main()
