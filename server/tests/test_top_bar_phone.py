"""At 375 px and at 360 px the top bar fits the screen, and Feedback and New goal are each at least 44 by 44 px (#56). At 375 px and at 1280 px the bar is as tall as --topbar, which sticky heads sit under. Measured in headless Chrome on the built app."""

from __future__ import annotations

import unittest

from web_browser import signed_app

# Null until the app has drawn the signed-in top bar and its font has loaded.
TOP_BAR = """(async () => {
  const bar = document.querySelector("header.top");
  const feedback = document.querySelector(".topfeedback");
  const newGoal = document.querySelector(".topnew");
  if (!bar || !feedback || !newGoal) return null;
  await document.fonts.ready;
  const box = (e) => { const r = e.getBoundingClientRect(); return { width: r.width, height: r.height }; };
  const shown = [...bar.children].filter((e) => e.getClientRects().length);
  return {
    phone: document.documentElement.classList.contains("phone"),
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    bar: bar.scrollWidth,
    right: Math.max(...shown.map((e) => e.getBoundingClientRect().right)),
    height: bar.getBoundingClientRect().height,
    topbar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar")),
    feedback: box(feedback),
    newGoal: box(newGoal),
    clippedTabs: [...bar.querySelectorAll(".tab")].filter((t) => t.scrollWidth > t.clientWidth).map((t) => t.textContent),
    tabsEnd: Math.max(...[...bar.querySelectorAll(".tab")].map((t) => t.getBoundingClientRect().right)),
    feedbackStart: feedback.getBoundingClientRect().left,
  };
})()"""


class TopBarPhoneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app() as (open_page, _):
            # 360 px is a common phone width. Below 366 px the items need more than the bar less its 16 px side padding, so an item that may shrink is squeezed: without flex:none, Feedback is 41.9 px at 360 px. Measured: the items stay inside the screen down to 350 px.
            cls.bar, cls.narrow, cls.desktop = (open_page(width, TOP_BAR) for width in (375, 360, 1280))

    def phones(self) -> tuple[tuple[int, dict], ...]:
        return ((375, self.bar), (360, self.narrow))

    def test_the_page_draws_the_phone_layout(self) -> None:
        for width, bar in self.phones():
            self.assertTrue(bar["phone"], width)
            self.assertEqual(bar["viewport"], width)

    def test_the_top_bar_is_no_wider_than_the_screen(self) -> None:
        for width, bar in self.phones():
            self.assertLessEqual(bar["page"], width, bar)
            self.assertLessEqual(bar["bar"], width, bar)
            self.assertLessEqual(bar["right"], width, bar)
            self.assertEqual(bar["clippedTabs"], [], bar)
            self.assertLessEqual(bar["tabsEnd"], bar["feedbackStart"], bar)

    def test_feedback_and_new_goal_are_44_px_touch_targets(self) -> None:
        for width, bar in self.phones():
            for name in ("feedback", "newGoal"):
                self.assertGreaterEqual(bar[name]["width"], 44, (width, name, bar))
                self.assertGreaterEqual(bar[name]["height"], 44, (width, name, bar))

    def test_the_bar_is_as_tall_as_topbar_on_a_phone_and_a_desktop(self) -> None:
        # .lhead sits at top: var(--topbar), flush under the bar. .ngrail and .gprops sit 16 px below that.
        self.assertFalse(self.desktop["phone"])
        for name, bar in (("375 px", self.bar), ("1280 px", self.desktop)):
            self.assertEqual(bar["height"], bar["topbar"], (name, bar))


if __name__ == "__main__":
    unittest.main()
