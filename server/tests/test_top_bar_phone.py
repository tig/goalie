"""At 375 px the top bar fits the screen, and Feedback and New goal are each at least 44 by 44 px (#56). Measured in headless Chrome on the built app."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path

from goalie_cli import SERVER, Store, update
from live_server import get, running_server, signed

MEASURE = Path(__file__).resolve().parent / "measure_page.mjs"
BUILD = SERVER / "web" / "dist" / "index.html"
MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

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
    feedback: box(feedback),
    newGoal: box(newGoal),
    clippedTabs: [...bar.querySelectorAll(".tab")].filter((t) => t.scrollWidth > t.clientWidth).map((t) => t.textContent),
  };
})()"""


def chrome() -> str | None:
    found = os.environ.get("CHROME") or next((p for p in map(shutil.which, ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")) if p), None)
    return found or (MAC_CHROME if Path(MAC_CHROME).is_file() else None)


class TopBarPhoneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # CI builds the app and has Chrome, so there a missing one fails. A local run without them skips.
        browser = chrome()
        missing = "no Chrome (set CHROME)" if not browser else "no build (run npm run build --prefix server)" if not BUILD.is_file() else ""
        if missing:
            if os.environ.get("CI"):
                raise AssertionError(missing)
            raise unittest.SkipTest(missing)
        store = Store()
        try:
            code, result = store.run("seed")
            assert code == 0, result
            chelsea = store.read("actor", "chelsea")
            assert store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
            token, env = signed("sub-chelsea")
            with running_server(store.path, env) as (proc, port):
                assert get(proc, port, "/health").status == 200
                measured = subprocess.run(["node", str(MEASURE), str(browser), f"http://127.0.0.1:{port}/", "375", "812", TOP_BAR], capture_output=True, text=True, timeout=90, env={**os.environ, "GOALIE_TOKEN": token})
        finally:
            store.close()
        if measured.returncode != 0:
            raise AssertionError(measured.stderr)
        cls.bar = json.loads(measured.stdout)

    def test_the_page_draws_the_phone_layout(self) -> None:
        self.assertTrue(self.bar["phone"])
        self.assertEqual(self.bar["viewport"], 375)

    def test_the_top_bar_is_no_wider_than_the_screen(self) -> None:
        self.assertLessEqual(self.bar["page"], 375, self.bar)
        self.assertLessEqual(self.bar["bar"], 375, self.bar)
        self.assertLessEqual(self.bar["right"], 375, self.bar)
        self.assertEqual(self.bar["clippedTabs"], [], self.bar)

    def test_feedback_and_new_goal_are_44_px_touch_targets(self) -> None:
        for name in ("feedback", "newGoal"):
            self.assertGreaterEqual(self.bar[name]["width"], 44, (name, self.bar))
            self.assertGreaterEqual(self.bar[name]["height"], 44, (name, self.bar))


if __name__ == "__main__":
    unittest.main()
