"""Rule 35b: Home arranges goals by drag. New goal asks no Priority, so a goal with none shows in a No priority group on Home.
A goal's owner drags it into another goal (a sub-goal), onto a Priority, or to No priority, then gives a reason and saves.
Measured in headless Chrome on the built app. The drag is pointer events on the grip; the target is the element under the pointer."""

from __future__ import annotations

import unittest

from web_browser import signed_app

HELPERS = """
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const row = (id) => document.querySelector(`.row[data-gid="${id}"]`);
  const grip = (id) => row(id)?.querySelector('.ggrip');
  // A person points at the goal column. On the Timeline a row runs far past the screen, so aim at its .left part.
  const point = (el, at = 0.5) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const l = (el.querySelector(':scope > .left') ?? el).getBoundingClientRect(); return { clientX: Math.max(l.left, 0) + 60, clientY: r.top + r.height * at }; };
  const drag = async (id, target, at) => {
    const g = grip(id); const from = point(g);
    const to = point(target, at);
    const ev = (type, p) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, pointerType: 'mouse', ...p }));
    ev('pointerdown', from); await sleep(30);
    ev('pointermove', { clientX: to.clientX, clientY: to.clientY - 2 }); await sleep(30);
    ev('pointermove', to); await sleep(60);
    const shown = { into: row(target.dataset.gid)?.classList.contains('dropinto') ?? false };
    ev('pointerup', to); await sleep(120);
    return shown;
  };
  const save = async (text) => {
    const bar = document.querySelector('.movereason');
    if (!bar) return null;
    const words = bar.querySelector('.movewhat').textContent.trim();
    const input = bar.querySelector('input');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(30);
    [...bar.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save').click();
    await sleep(900);
    return words;
  };
  const noneIds = () => [...document.querySelectorAll('.group[data-gpid="none"] > .goal > .row[data-gid]')].map((r) => r.dataset.gid);
"""

OUT = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0004"]')) return null;
  """ + HELPERS + """
  const grips = [...document.querySelectorAll('.ggrip')].map((g) => g.closest('.row').dataset.gid);
  const header = document.querySelector('.group[data-gpid="none"] .nonehead')?.textContent.trim() ?? null;
  await drag('XW-0004', document.querySelector('.group[data-gpid="none"] .nonehead'), 0.5);
  const words = await save('It stands on its own now');
  return { grips, header, words, none: noneIds() };
})()"""

BACK = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0004"]')) return null;
  """ + HELPERS + """
  const before = noneIds();
  const shown = await drag('XW-0004', row('XW-0003'), 0.5);
  const words = await save('It is part of XW-0003 again');
  return { before, shown, words, none: noneIds() };
})()"""

KEYS = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0003"] .ggrip')) return null;
  """ + HELPERS + """
  const g = grip('XW-0003');
  g.focus();
  g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await sleep(100);
  return { words: document.querySelector('.movereason .movewhat')?.textContent.trim() ?? null, focused: document.activeElement === grip('XW-0003') };
})()"""


class HomeArrange(unittest.TestCase):
    def test_a_goal_is_dragged_out_to_no_priority_and_back_into_a_goal(self) -> None:
        with signed_app() as (open_page, api):
            out = open_page(1280, OUT, "/")
            after_out = api("/api/goals/XW-0004")["goal"]
            back = open_page(1280, BACK, "/?view=list")
            after_back = api("/api/goals/XW-0004")["goal"]
            keys = open_page(1280, KEYS, "/")
            phone = open_page(390, "(() => document.querySelector('.group[data-gpid=\"none\"]') ? { grips: document.querySelectorAll('.ggrip').length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null)()", "/")
        # Only goals Chelsea may change carry a grip; XW-0001 and XW-0002 are Tig's.
        self.assertIn("XW-0003", out["grips"])
        self.assertNotIn("XW-0001", out["grips"])
        self.assertNotIn("XW-0002", out["grips"])
        self.assertTrue(out["header"].startswith("No priority"), out["header"])
        self.assertEqual(out["words"], "Move it to No priority")
        self.assertEqual((after_out["parent"], after_out["priority"]), (None, None))
        self.assertIn("XW-0004", out["none"])
        self.assertEqual(back["before"], ["XW-0004"])
        self.assertTrue(back["shown"]["into"], "the row under the pointer is marked as the new parent")
        self.assertTrue(back["words"].startswith("Make it a sub-goal of Tig, Chelsea, and agents use GOALIE"), back["words"])
        self.assertEqual(after_back["parent"], "XW-0003")
        self.assertEqual(back["none"], [])
        self.assertEqual(keys, {"words": "Move it to No priority", "focused": True})
        self.assertGreater(phone["grips"], 0)
        self.assertLessEqual(phone["sideways"], 0)


if __name__ == "__main__":
    unittest.main()
