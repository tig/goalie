"""measure_page.mjs starts Chrome once more when a start writes no DevTools port in time. A cold Chrome on a CI runner did this and failed setUpClass (#101, #102)."""

from __future__ import annotations

import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

from web_browser import MEASURE, chrome

# A stand-in for Chrome: its first start hangs and writes no port, as the stuck start on CI did. Its second start is the real Chrome.
FIRST_START_HANGS = """#!/bin/sh
if [ ! -f "{marker}" ]; then
  touch "{marker}"
  exec sleep 600
fi
exec "{chrome}" "$@"
"""


class ChromeStartTests(unittest.TestCase):
    def test_a_start_that_writes_no_port_is_tried_again(self) -> None:
        real = chrome()
        if not real:
            if os.environ.get("CI"):
                raise AssertionError("no Chrome (set CHROME)")
            raise unittest.SkipTest("no Chrome (set CHROME)")
        with tempfile.TemporaryDirectory() as folder:
            fake = Path(folder) / "chrome"
            fake.write_text(FIRST_START_HANGS.format(marker=Path(folder) / "started", chrome=real))
            fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
            done = subprocess.run(
                ["node", str(MEASURE), str(fake), "data:text/html,<p>ready</p>", "390", "812", 'document.querySelector("p")?.textContent ?? null'],
                capture_output=True, text=True, timeout=60, env={**os.environ, "GOALIE_CHROME_START_SECONDS": "3"},
            )
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(done.stdout, '"ready"')
        self.assertIn("starting it again", done.stderr)


if __name__ == "__main__":
    unittest.main()
