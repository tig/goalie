"""Rules 10b and 35b: Home shows no Priority title. Each top goal on a Priority shows its number, 1 to n; a goal with none shows under No priority.
A goal is dragged between numbered goals (it takes that number and the numbers after it move down), into a goal (a sub-goal), or to No priority.
The drop saves at once; the app writes the reason, and a note offers Undo. A goal takes a number only for the list's owner (SPEC.md §6.3).
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
  // No reason to type: the drop saves. Wait for the save and read the note.
  const saved = async () => {
    await sleep(900);
    const note = document.querySelector('.movenote');
    return note ? { item: note.querySelector('.moveitem').textContent.trim(), words: note.querySelector('.movewhat').textContent.trim(), input: note.querySelectorAll('input, textarea').length, undo: [...note.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Undo') } : null;
  };
  const noneIds = () => [...document.querySelectorAll('.group[data-gpid="none"] > .goal > .row[data-gid]')].map((r) => r.dataset.gid);
"""

NUMBERS = """const numbers = () => [...document.querySelectorAll('.row[data-gid]')].filter((r) => r.querySelector('.rnum')?.textContent.trim()).map((r) => [r.querySelector('.rnum').textContent.trim(), r.dataset.gid]);"""

RANKER = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0004"]')) return null;
  """ + HELPERS + NUMBERS + """
  const start = { numbers: numbers(), heads: [...document.querySelectorAll('.phead')].map((h) => h.textContent.trim()), subNumber: row('XW-0004').querySelector('.rnum')?.textContent.trim() ?? '' };
  const grips = [...document.querySelectorAll('.ggrip:not(.off)')].map((g) => g.closest('.row').dataset.gid);
  const locked = grip('XW-0001')?.title ?? null;
  // Above number 1: a line over the row, and the box at the bottom says what the drop does.
  const g = grip('XW-0004'); const from = point(g); const edge = point(row('XW-0001'), 0.1);
  const ev = (type, p) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, button: 0, pointerType: 'mouse', ...p }));
  ev('pointerdown', from); await sleep(30); ev('pointermove', edge); await sleep(80);
  const line = { before: row('XW-0001').classList.contains('dropbefore'), ghost: document.querySelector('.dragghost')?.textContent.replace(/\s+/g, ' ').trim() ?? null };
  ev('pointercancel', edge); await sleep(60);
  const gone = !document.querySelector('.dragghost') && !document.querySelector('.dropbefore');
  await drag('XW-0004', row('XW-0001'), 0.1);
  const first = { note: await saved(), numbers: numbers() };
  await drag('XW-0004', document.querySelector('.group[data-gpid="none"] .nonehead'), 0.5);
  const out = { note: await saved(), numbers: numbers(), none: noneIds() };
  // The keyboard: arrow up on number 3 picks number 2; Enter moves it; Undo puts it back.
  grip('XW-0003').focus();
  const key = async (k) => { grip('XW-0003').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await sleep(100); };
  await key('ArrowUp');
  const waiting = document.querySelector('.movenote .movewhat')?.textContent.trim() ?? null;
  await key('Enter');
  const keyed = { note: await saved(), numbers: numbers() };
  [...document.querySelectorAll('.movenote button')].find((b) => b.textContent.trim() === 'Undo').click();
  const undone = { note: await saved(), numbers: numbers() };
  // Into the middle of XW-0003: it turns green and the goal becomes its sub-goal.
  const shown = await drag('XW-0004', row('XW-0003'), 0.5);
  const into = { shown, note: await saved(), none: noneIds() };
  return { start, grips, locked, line, gone, first, out, waiting, keyed, undone, into };
})()"""

NOT_RANKER = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0003"] .ggrip')) return null;
  """ + HELPERS + """
  const g = grip('XW-0003'); const from = point(g); const edge = point(row('XW-0001'), 0.1);
  const ev = (type, p) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, button: 0, pointerType: 'mouse', ...p }));
  ev('pointerdown', from); await sleep(30); ev('pointermove', edge); await sleep(80);
  const offered = { line: Boolean(document.querySelector('.dropbefore, .dropafter')), ghost: Boolean(document.querySelector('.dragghost')) };
  ev('pointercancel', edge); await sleep(60);
  return offered;
})()"""


class HomeArrange(unittest.TestCase):
    def test_goals_are_numbered_and_a_drop_between_them_renumbers_the_list(self) -> None:
        with signed_app(ranks=True) as (open_page, api):
            got = open_page(1280, RANKER, "/?view=list")
            moved = api("/api/goals/XW-0004")["goal"]
            events = [(e.get("field"), e.get("new"), e.get("reason")) for e in api("/api/goals/XW-0004")["events"] if e.get("field") == "priority"]
            phone = open_page(390, "(() => document.querySelector('.group[data-gpid=\"none\"]') ? { grips: document.querySelectorAll('.ggrip').length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null)()", "/")
        # No Priority title: the only header is No priority. Each top goal shows its number; a sub-goal shows none.
        self.assertEqual(got["start"]["numbers"], [["1", "XW-0001"], ["2", "XW-0002"], ["3", "XW-0003"]])
        self.assertEqual([h for h in got["start"]["heads"]], ["No priority"])
        self.assertEqual(got["start"]["subNumber"], "")
        self.assertIn("XW-0004", got["grips"])
        self.assertNotIn("XW-0001", got["grips"])
        self.assertEqual(got["locked"], "Only Tig can move this goal.")
        self.assertTrue(got["line"]["before"])
        self.assertEqual(got["line"]["ghost"], f"{got['first']['note']['item']} → Make it number 1")
        self.assertTrue(got["gone"], "a cancelled drag leaves no line and no box")
        # Dropped above number 1, it is number 1 and the others move down one.
        self.assertEqual(got["first"]["note"]["words"], "is now number 1.")
        self.assertTrue(got["first"]["note"]["undo"])
        self.assertEqual(got["first"]["numbers"], [["1", "XW-0004"], ["2", "XW-0001"], ["3", "XW-0002"], ["4", "XW-0003"]])
        # To No priority: its number goes, and the others close up.
        self.assertEqual(got["out"]["note"]["words"], "now has no priority.")
        self.assertEqual(got["out"]["numbers"], [["1", "XW-0001"], ["2", "XW-0002"], ["3", "XW-0003"]])
        self.assertEqual(got["out"]["none"], ["XW-0004"])
        self.assertEqual(got["waiting"], "Make it number 2")
        self.assertEqual(got["keyed"]["note"]["words"], "is now number 2.")
        self.assertEqual(got["keyed"]["numbers"], [["1", "XW-0001"], ["2", "XW-0003"], ["3", "XW-0002"]])
        self.assertEqual(got["undone"]["numbers"], [["1", "XW-0001"], ["2", "XW-0002"], ["3", "XW-0003"]])
        self.assertTrue(got["into"]["shown"]["into"], "the row under the pointer is marked as the new parent")
        self.assertTrue(got["into"]["note"]["words"].startswith("is now a sub-goal of "), got["into"]["note"])
        self.assertEqual(got["into"]["none"], [])
        self.assertEqual((moved["parent"], moved["priority"]), ("XW-0003", None))
        # The app writes each reason: the new Priority and the move to it.
        self.assertIn(("priority", "PRI-4", "Moved on Home. Make it number 1."), events)
        self.assertGreater(phone["grips"], 0)
        self.assertLessEqual(phone["sideways"], 0)

    def test_only_the_lists_owner_is_offered_a_number(self) -> None:
        with signed_app() as (open_page, _):
            got = open_page(1280, NOT_RANKER, "/?view=list")
        self.assertEqual(got, {"line": False, "ghost": False})


if __name__ == "__main__":
    unittest.main()
