"""New goal picks its Priority from tiles, the same as Date Type and Plan Maturity (rule NG4a).
Measured in headless Chrome on the built app, at desktop and phone width."""

from __future__ import annotations

import unittest

from web_browser import signed_app

PICKER = """(async () => {
  const group = document.querySelector('[role=radiogroup][aria-label=Priority]');
  if (!group) return null;
  const tiles = [...group.querySelectorAll('[role=radio]')];
  const tops = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top)));
  const before = tiles.filter((t) => t.getAttribute('aria-checked') === 'true').length;
  tiles[1].click();
  await new Promise((r) => setTimeout(r, 100));
  const after = [...group.querySelectorAll('[role=radio]')];
  return {
    texts: tiles.map((t) => t.innerText.replace(/\\s+/g, ' ').trim()),
    tiles: tiles.map((t) => t.className),
    nativeRadios: group.querySelectorAll('input[type=radio]').length,
    rows: tops.size,
    before,
    checked: after.map((t) => t.getAttribute('aria-checked')),
    on: after.map((t) => t.classList.contains('on')),
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()"""


class NewGoalPriorityTiles(unittest.TestCase):
    def test_priority_is_tiles_with_no_priority_last(self) -> None:
        with signed_app() as (open_page, _api):
            desk = open_page(1280, PICKER, "/goals/new")
            phone = open_page(390, PICKER, "/goals/new")
        self.assertEqual(desk["texts"], ["Priority 1 Regenerate the E28 canon", "Priority 2 Grow the XW team", "Priority 3 Run Excaliwire on GOALIE", "No priority Not on Priorities"])
        self.assertTrue(all("tile" in c.split() for c in desk["tiles"]), desk["tiles"])
        self.assertEqual(desk["nativeRadios"], 0)
        self.assertEqual(desk["before"], 0, "Priority has no default (NG4)")
        self.assertEqual(desk["checked"], ["false", "true", "false", "false"])
        self.assertEqual(desk["on"], [False, True, False, False])
        self.assertEqual(desk["rows"], 2, "two tiles a row at desktop width")
        self.assertEqual(phone["rows"], 4, "one tile a row on a phone")
        self.assertLessEqual(phone["sideways"], 0)


if __name__ == "__main__":
    unittest.main()
