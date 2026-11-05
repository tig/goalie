"""A goal gets its Priority on its own page, from the ladder under its Description (rules NG4a, GL9). New goal does not ask for one.
Measured in headless Chrome on the built app, at desktop and phone width."""

from __future__ import annotations

import unittest

from web_browser import signed_app

NEW_GOAL = """(() => {
  if (!document.querySelector('.ngcard')) return null;
  return { picker: document.querySelectorAll('[aria-label=Priority]').length };
})()"""

LADDER = """(async () => {
  const lad = document.querySelector('section.gprio');
  if (!lad) return null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rungs = () => [...lad.querySelectorAll('.rung')].map((r) => ({ title: r.querySelector('.rtitle').textContent.trim(), here: r.classList.contains('here'), goals: [...r.querySelectorAll('.rgoal a')].map((g) => g.textContent.trim()) }));
  const order = [...document.querySelectorAll('.gbody > section, .gbody > form')].map((s) => s.className.split(' ').find((c) => c.startsWith('g') && c !== 'gsec'));
  const before = rungs();
  const handle = lad.querySelector('.rmove');
  const cut = lad.querySelectorAll('.rcut').length;
  handle.focus();
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  await sleep(150);
  const moved = rungs();
  const focused = document.activeElement === lad.querySelector('.rmove');
  const reason = lad.querySelector('textarea');
  if (reason && window.__save) {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(reason, 'More urgent than hiring');
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    [...lad.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save').click();
    await sleep(800);
  }
  return { before, moved, reason: Boolean(reason), cut, order, focused, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
})()"""


class PriorityLadder(unittest.TestCase):
    def test_new_goal_has_no_priority_and_the_goal_page_moves_it_on_the_ladder(self) -> None:
        with signed_app() as (open_page, api):
            self.assertEqual(open_page(1280, NEW_GOAL, "/goals/new"), {"picker": 0})
            phone = open_page(390, LADDER, "/goals/XW-0003")
            desk = open_page(1280, LADDER.replace("window.__save", "true"), "/goals/XW-0003")
            ranks = {p["rank"]: p["id"] for p in api("/api/priorities")["funded"]}
            saved = api("/api/goals/XW-0003")["goal"]["priority"]
        titles = [r["title"] for r in desk["before"]]
        self.assertEqual(titles, ["Regenerate the E28 canon", "Grow the XW team", "Run Excaliwire on GOALIE", "No priority"])
        self.assertEqual([r["here"] for r in desk["before"]], [False, False, True, False])
        self.assertEqual(desk["before"][0]["goals"], ["Regenerate the E28 canon by Oct 1"])
        self.assertEqual(desk["cut"], 1)
        self.assertEqual(desk["order"][:2], ["gdesc", "gprio"], "the ladder sits under the Description")
        self.assertEqual([r["here"] for r in desk["moved"]], [False, True, False, False], "ArrowUp moves the goal one rung up")
        self.assertTrue(desk["reason"], "a move asks for a reason")
        self.assertTrue(desk["focused"])
        self.assertEqual(saved, ranks[2])
        self.assertLessEqual(phone["sideways"], 0)


if __name__ == "__main__":
    unittest.main()
