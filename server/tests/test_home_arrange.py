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
    const ev = (type, p) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, pointerType: 'mouse', ...p }));
    // Backlog shows once a drag starts, so the person aims after the page has moved.
    ev('pointerdown', from); await sleep(60);
    const to = point(target, at);
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
  // The goals below the cut line, as the server has them, and as Home shows them under Backlog.
  const below = async () => (await (await fetch('/api/priorities')).json()).backlog.flatMap((p) => p.goals.map((g) => g.id));
  const backlogIds = () => [...document.querySelectorAll('.group[data-gpid="backlog"] > .goal > .row[data-gid]')].map((r) => r.dataset.gid);
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
  const keyed = { note: await saved(), numbers: numbers(), below: await below(), backlog: backlogIds() };
  [...document.querySelectorAll('.movenote button')].find((b) => b.textContent.trim() === 'Undo').click();
  const undone = { note: await saved(), numbers: numbers() };
  // Backlog shows only while a goal is dragged, until it holds one. A drop on it puts the goal below the cut line.
  const b = grip('XW-0003'); const bfrom = point(b);
  const bev = (type, p) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 11, button: 0, pointerType: 'mouse', ...p }));
  const hidden = !document.querySelector('.group[data-gpid="backlog"]');
  bev('pointerdown', bfrom); await sleep(80);
  const head = document.querySelector('.group[data-gpid="backlog"] .nonehead');
  const bto = head ? point(head) : bfrom;
  bev('pointermove', { clientX: bto.clientX, clientY: bto.clientY - 2 }); await sleep(30); bev('pointermove', bto); await sleep(80);
  const offered = { head: Boolean(head), ghost: document.querySelector('.dragghost')?.textContent.replace(/\s+/g, ' ').trim() ?? null };
  bev('pointerup', bto); await sleep(120);
  const parked = { hidden, offered, note: await saved(), numbers: numbers(), below: await below(), backlog: backlogIds(), heads: [...document.querySelectorAll('.phead')].map((h) => h.textContent.trim()) };
  // A goal dropped above number 1: the Backlog keeps its goal.
  await drag('XW-0004', row('XW-0001'), 0.1);
  const kept = { note: await saved(), numbers: numbers(), below: await below(), backlog: backlogIds() };
  // Into the middle of XW-0003: it turns green and the goal becomes its sub-goal.
  const shown = await drag('XW-0004', row('XW-0003'), 0.5);
  const into = { shown, note: await saved(), none: noneIds() };
  return { start, grips, locked, line, gone, first, out, waiting, keyed, undone, parked, kept, into };
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
            listed = api("/api/priorities")
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
        # Chelsea, 2026-11-06: moving the last goal up put the new last goal under the cut line. The line stays put, so there is still no Backlog.
        self.assertEqual((got["keyed"]["below"], got["keyed"]["backlog"]), ([], []))
        self.assertEqual(got["undone"]["numbers"], [["1", "XW-0001"], ["2", "XW-0002"], ["3", "XW-0003"]])
        # A drop on Backlog, which shows while a goal is dragged, puts the goal below the cut line.
        self.assertTrue(got["parked"]["hidden"])
        self.assertTrue(got["parked"]["offered"]["head"])
        self.assertTrue(got["parked"]["offered"]["ghost"].endswith("→ Move it to the Backlog as number 3"), got["parked"]["offered"])
        self.assertEqual(got["parked"]["note"]["words"], "is now number 3, in the Backlog.")
        self.assertEqual(got["parked"]["numbers"], [["1", "XW-0001"], ["2", "XW-0002"], ["3", "XW-0003"]])
        self.assertEqual((got["parked"]["below"], got["parked"]["backlog"]), (["XW-0003"], ["XW-0003"]))
        self.assertEqual(got["parked"]["heads"], ["Backlog", "No priority"])
        self.assertEqual(got["kept"]["numbers"], [["1", "XW-0004"], ["2", "XW-0001"], ["3", "XW-0002"], ["4", "XW-0003"]])
        self.assertEqual((got["kept"]["below"], got["kept"]["backlog"]), (["XW-0003"], ["XW-0003"]))
        self.assertTrue(got["into"]["shown"]["into"], "the row under the pointer is marked as the new parent")
        self.assertTrue(got["into"]["note"]["words"].startswith("is now a sub-goal of "), got["into"]["note"])
        self.assertEqual(got["into"]["none"], [])
        self.assertEqual((moved["parent"], moved["priority"]), ("XW-0003", None))
        # Each Priority XW-0004 held alone retired when it left, so no empty Priority is left on the list.
        self.assertEqual([p["id"] for p in listed["funded"] + listed["backlog"] if not p["goals"]], [])
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
