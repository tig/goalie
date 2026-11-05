"""Rule 35b: Home arranges goals by drag. New goal asks no Priority, so a goal with none shows in a No priority group on Home.
A goal's owner drags it into another goal (a sub-goal), onto a Priority, or to No priority. The drop saves at once; the app writes the reason, and a note offers Undo.
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

OUT = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0004"]')) return null;
  """ + HELPERS + """
  const grips = [...document.querySelectorAll('.ggrip:not(.off)')].map((g) => g.closest('.row').dataset.gid);
  const locked = { XW0001: grip('XW-0001')?.classList.contains('off') ?? false, title: grip('XW-0001')?.title ?? null };
  const header = document.querySelector('.group[data-gpid="none"] .nonehead')?.textContent.trim() ?? null;
  await drag('XW-0004', document.querySelector('.group[data-gpid="none"] .nonehead'), 0.5);
  const note = await saved();
  return { grips, locked, header, note, none: noneIds() };
})()"""

BACK = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0004"]')) return null;
  """ + HELPERS + """
  const before = noneIds();
  const g = grip('XW-0004'); const from = point(g); const edge = point(row('XW-0001'), 0.1);
  const ev = (type, p) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, button: 0, pointerType: 'mouse', ...p }));
  ev('pointerdown', from); await sleep(30); ev('pointermove', edge); await sleep(80);
  const line = { before: row('XW-0001').classList.contains('dropbefore'), ghost: document.querySelector('.dragghost')?.textContent.replace(/\s+/g, ' ').trim() ?? null };
  // Over the middle of Tig's goal: Chelsea may not put a goal under it, so it does not turn green; the drop would join its Priority instead.
  const mid = point(row('XW-0002'), 0.5);
  ev('pointermove', mid); await sleep(80);
  const locked = { green: row('XW-0002').classList.contains('dropinto'), ghost: document.querySelector('.dragghost')?.textContent.replace(/\s+/g, ' ').trim() ?? null };
  ev('pointercancel', edge); await sleep(60);
  const gone = !document.querySelector('.dragghost') && !document.querySelector('.dropbefore');
  // Dropped on the edge of XW-0003, it joins Priority 3 beside it. Each Priority is a header row with its number and title; its goals sit under it with no number.
  await drag('XW-0004', row('XW-0003'), 0.1);
  await saved();
  const heads = [...document.querySelectorAll('.phead')].map((h) => [...h.querySelector('.left').children].map((c) => c.textContent.trim()).filter(Boolean).join(' '));
  const under = [...document.querySelectorAll('.phead')].find((h) => h.textContent.includes('Run Excaliwire on GOALIE')).closest('.group');
  const ranks = { heads, inThree: [...under.querySelectorAll(':scope > .goal > .row')].map((r) => r.dataset.gid), goalNumbers: [row('XW-0003'), row('XW-0004')].map((r) => r.querySelector('.rnum')?.textContent.trim() ?? '') };
  const shown = await drag('XW-0004', row('XW-0003'), 0.5);
  const note = await saved();
  return { before, line, locked, gone, ranks, shown, words: note?.words, none: noneIds() };
})()"""

KEYS = """(async () => {
  if (!document.querySelector('.row[data-gid="XW-0003"] .ggrip')) return null;
  """ + HELPERS + """
  const g = grip('XW-0003');
  g.focus();
  const key = async (k) => { grip('XW-0003').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await sleep(100); };
  await key('ArrowDown');
  const waiting = { words: document.querySelector('.movenote .movewhat')?.textContent.trim() ?? null, focused: document.activeElement === grip('XW-0003') };
  await key('Enter');
  const moved = await saved();
  const inNone = noneIds().includes('XW-0003');
  [...document.querySelectorAll('.movenote button')].find((b) => b.textContent.trim() === 'Undo').click();
  const undone = await saved();
  return { waiting, moved, inNone, undone, back: !noneIds().includes('XW-0003') };
})()"""


class HomeArrange(unittest.TestCase):
    def test_a_goal_is_dragged_out_to_no_priority_and_back_into_a_goal(self) -> None:
        with signed_app() as (open_page, api):
            out = open_page(1280, OUT, "/")
            after_out = api("/api/goals/XW-0004")["goal"]
            back = open_page(1280, BACK, "/?view=list")
            after_back = api("/api/goals/XW-0004")["goal"]
            keys = open_page(1280, KEYS, "/")
            reason = [e for e in api("/api/goals/XW-0003")["events"] if e.get("field") == "priority"][0]["reason"]
            phone = open_page(390, "(() => document.querySelector('.group[data-gpid=\"none\"]') ? { grips: document.querySelectorAll('.ggrip').length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null)()", "/")
        # Only goals Chelsea may change carry a grip; XW-0001 and XW-0002 are Tig's.
        self.assertIn("XW-0003", out["grips"])
        self.assertNotIn("XW-0001", out["grips"])
        self.assertNotIn("XW-0002", out["grips"])
        self.assertTrue(out["header"].startswith("No priority"), out["header"])
        self.assertEqual(out["note"], {"item": "Run the MLP prototype at goalie.excaliwire.com with Excaliwire's real goals loaded", "words": "now has no priority.", "input": 0, "undo": True})
        self.assertEqual((after_out["parent"], after_out["priority"]), (None, None))
        self.assertIn("XW-0004", out["none"])
        self.assertEqual(back["before"], ["XW-0004"])
        self.assertEqual(back["ranks"]["heads"], ["1 Regenerate the E28 canon", "2 Grow the XW team", "3 Run Excaliwire on GOALIE", "No priority"])
        self.assertEqual(sorted(back["ranks"]["inThree"]), ["XW-0003", "XW-0004"])
        self.assertEqual(back["ranks"]["goalNumbers"], ["", ""], "a goal row carries no number; its Priority's header does")
        self.assertTrue(back["shown"]["into"], "the row under the pointer is marked as the new parent")
        # Between goals: a line above the row, and a label at the pointer that says what the drop does.
        self.assertTrue(back["line"]["before"])
        self.assertEqual(back["line"]["ghost"], "Run the MLP prototype at goalie.excaliwire.com with Excaliwire's real goals loaded → Move it to Priority 1: Regenerate the E28 canon")
        self.assertTrue(back["gone"], "a cancelled drag leaves no line and no label")
        self.assertFalse(back["locked"]["green"], "a goal Chelsea may not change is not offered as a parent")
        self.assertTrue(back["locked"]["ghost"].endswith("→ Move it to Priority 2: Grow the XW team"), back["locked"]["ghost"])
        # A goal Chelsea may not move shows a dimmed grip that says who may.
        self.assertEqual(out["locked"], {"XW0001": True, "title": "Only Tig can move this goal."})
        self.assertTrue(back["words"].startswith("is now a sub-goal of Tig, Chelsea, and agents use GOALIE"), back["words"])
        self.assertEqual(after_back["parent"], "XW-0003")
        self.assertEqual(back["none"], [])
        self.assertEqual(keys["waiting"], {"words": "Move it to No priority", "focused": True})
        self.assertEqual(keys["moved"]["words"], "now has no priority.")
        self.assertTrue(keys["inNone"])
        self.assertTrue(keys["undone"]["words"].startswith("is now in Priority 3: "), keys["undone"])
        self.assertTrue(keys["back"], "Undo puts the goal back on its Priority")
        self.assertEqual(reason, "Moved on Home. Move it to Priority 3: Run Excaliwire on GOALIE.")
        self.assertGreater(phone["grips"], 0)
        self.assertLessEqual(phone["sideways"], 0)


if __name__ == "__main__":
    unittest.main()
