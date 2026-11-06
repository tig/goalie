"""Rule 35b: Home is one ranked list of goals. Each top goal shows its own number, its Priority's rank (SPEC.md §6.3), with no Priority title rows (rule 10b).
A ranker drags a goal to a new number or below the Backlog line; the drop saves at once, the app writes the reason, and a note offers Undo.
A goal's owner still drags it into another goal. Measured in headless Chrome on the built app. The drag is pointer events on the grip; the target is the element under the pointer."""

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
    const ghost = document.querySelector('.dragghost')?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
    ev('pointerup', to); await sleep(120);
    return ghost;
  };
  const saved = async () => {
    await sleep(900);
    const note = document.querySelector('.movenote');
    return note ? { words: note.querySelector('.movewhat').textContent.trim(), undo: [...note.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Undo') } : null;
  };
  // The top rows in order, each "<number> <goal>" and its side of the Backlog line.
  const list = () => [...document.querySelectorAll('.row[data-side]')].map((r) => `${r.querySelector('.rnum')?.textContent.trim() ?? ''} ${r.dataset.gid} ${r.dataset.side}`);
"""

RANKER = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0003"] .ggrip')) return null;
  """ + HELPERS + """
  const first = { list: list(), heads: document.querySelectorAll('.phead:not(.nonehead)').length, divider: document.querySelector('.cut')?.textContent.trim() ?? null };
  const ghost = await drag('XW-0003', row('XW-0001'), 0.1);
  const up = { note: await saved(), list: list() };
  const ghostDown = await drag('XW-0001', document.querySelector('.cut'), 0.5);
  const down = { note: await saved(), list: list() };
  [...document.querySelectorAll('.movenote button')].find((b) => b.textContent.trim() === 'Undo').click();
  await saved();
  const undone = list();
  // The keyboard: arrow down on a focused grip picks the next place, Enter moves it there.
  grip('XW-0002').focus();
  const key = async (k) => { grip('XW-0002').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await sleep(100); };
  await key('ArrowDown');
  const waiting = document.querySelector('.movenote .movewhat')?.textContent.trim() ?? null;
  await key('Enter');
  const keyed = { note: await saved(), list: list() };
  return { first, ghost, up, ghostDown, down, undone, waiting, keyed };
})()"""

OWNER = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0004"]')) return null;
  """ + HELPERS + """
  const top = { grip: grip('XW-0003')?.classList.contains('off') ?? null, title: grip('XW-0003')?.title ?? null };
  const sub = grip('XW-0004') ? !grip('XW-0004').classList.contains('off') : false;
  return { list: list(), top, sub };
})()"""


class HomeRankedGoals(unittest.TestCase):
    def test_a_ranker_drags_goals_to_new_numbers_and_below_the_backlog_line(self) -> None:
        with signed_app(who="tig") as (open_page, api):
            got = open_page(1280, RANKER, "/")
            view = api("/api/priorities")
            phone = open_page(390, "(() => document.querySelector('.row[data-side]') ? { numbers: [...document.querySelectorAll('.row[data-side] .rnum')].map((n) => n.textContent.trim()), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null)()", "/")
        self.assertIsNotNone(got, "Tig sees a grip on XW-0003")
        # No Priority title rows: each goal carries its own number, and the divider says Backlog.
        self.assertEqual(got["first"]["heads"], 0)
        self.assertEqual(got["first"]["list"], ["1 XW-0001 funded", "2 XW-0002 funded", "3 XW-0003 funded"])
        self.assertEqual(got["first"]["divider"], "Backlog")
        # Dropped above number 1, XW-0003 becomes number 1 and the others move down.
        self.assertTrue(got["ghost"].endswith("→ Move it to number 1"), got["ghost"])
        self.assertEqual(got["up"]["note"], {"words": "is now number 1.", "undo": True})
        self.assertEqual(got["up"]["list"], ["1 XW-0003 funded", "2 XW-0001 funded", "3 XW-0002 funded"])
        # Dropped on the Backlog line, XW-0001 goes below it.
        self.assertTrue(got["ghostDown"].endswith("→ Move it to Backlog, number 3"), got["ghostDown"])
        self.assertEqual(got["down"]["note"]["words"], "is now number 3, in Backlog.")
        self.assertEqual(got["down"]["list"], ["1 XW-0003 funded", "2 XW-0002 funded", "3 XW-0001 backlog"])
        self.assertEqual(got["undone"], ["1 XW-0003 funded", "2 XW-0001 funded", "3 XW-0002 funded"], "Undo puts it back above the line")
        self.assertEqual(got["waiting"], "Move it to Backlog, number 3")
        self.assertEqual(got["keyed"]["list"], ["1 XW-0003 funded", "2 XW-0001 funded", "3 XW-0002 backlog"])
        self.assertEqual(([p["id"] for p in view["funded"]], [p["id"] for p in view["backlog"]]), (["PRI-3", "PRI-1"], ["PRI-2"]))
        self.assertEqual(phone["numbers"], ["1", "2", "3"])
        self.assertLessEqual(phone["sideways"], 0)

    def test_a_goal_owner_who_may_not_rank_sees_the_numbers_and_nests_only(self) -> None:
        with signed_app() as (open_page, _api):
            got = open_page(1280, OWNER, "/")
        self.assertEqual(got["list"], ["1 XW-0001 funded", "2 XW-0002 funded", "3 XW-0003 funded"])
        # SPEC.md §6.3: Chelsea owns XW-0003 but not the list, so its number is not hers to change.
        self.assertEqual(got["top"], {"grip": True, "title": "Only the org unit's owner can change the numbers."})
        self.assertTrue(got["sub"], "her sub-goal XW-0004 still drags into another goal")


if __name__ == "__main__":
    unittest.main()
