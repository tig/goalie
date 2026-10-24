"""server/src/dates.ts is the one home of date math on ISO days, for the server and the app (review E1, E15)."""

from __future__ import annotations

import json
import subprocess
import unittest

from goalie_cli import SERVER

PROBE = """
import * as d from "./src/dates.ts";
const out = {
  DAY: d.DAY,
  day: d.day("2026-10-23"),
  iso: d.iso(Date.UTC(2026, 9, 23)),
  addDays: [d.addDays("2026-12-30", 3), d.addDays("2026-03-01", -1)],
  isDate: ["2026-10-23", "2026-02-29", "2028-02-29", "2026-13-45", "2026-10-23T00:00:00Z", 20261023, null].map(d.isDate),
  weekday: ["2026-10-19", "2026-10-23", "2026-10-25"].map(d.weekday),
  weekStart: ["2026-10-19", "2026-10-25", "2027-01-01"].map(d.weekStart),
  daysBetween: [d.daysBetween("2026-10-01", "2026-10-23"), d.daysBetween("2026-11-06", "2026-10-23")],
  shortDate: [d.shortDate("2026-10-01", "2026-10-23"), d.shortDate("2027-03-31", "2026-10-23")],
  monthLabel: [d.monthLabel("2026-10-05"), d.monthLabel("2027-01-04")],
  monthYear: d.monthYear("2026-10-23"),
};
process.stdout.write(JSON.stringify(out));
"""


class DatesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", PROBE], cwd=SERVER, capture_output=True, timeout=30)
        assert proc.returncode == 0, proc.stderr.decode()
        cls.out = json.loads(proc.stdout)

    def test_a_day_is_utc_midnight(self) -> None:
        self.assertEqual(self.out["DAY"], 86_400_000)
        self.assertEqual(self.out["day"], 1792713600000)
        self.assertEqual(self.out["iso"], "2026-10-23")

    def test_add_days_crosses_months_and_years(self) -> None:
        self.assertEqual(self.out["addDays"], ["2027-01-02", "2026-02-28"])

    def test_is_date_takes_only_a_real_calendar_day(self) -> None:
        self.assertEqual(self.out["isDate"], [True, False, True, False, False, False, False])

    def test_weekday_counts_from_monday(self) -> None:
        self.assertEqual(self.out["weekday"], [0, 4, 6])

    def test_a_week_starts_on_monday(self) -> None:
        self.assertEqual(self.out["weekStart"], ["2026-10-19", "2026-10-19", "2026-12-28"])

    def test_days_between_is_signed_whole_days(self) -> None:
        self.assertEqual(self.out["daysBetween"], [22, -14])

    def test_date_words_name_the_year_only_when_needed(self) -> None:
        self.assertEqual(self.out["shortDate"], ["Oct 1", "Mar 31, 2027"])
        self.assertEqual(self.out["monthLabel"], ["Oct", "Jan 2027"])
        self.assertEqual(self.out["monthYear"], "October 2026")

    def test_the_module_runs_in_a_browser(self) -> None:
        text = (SERVER / "src" / "dates.ts").read_text(encoding="utf-8")
        self.assertNotRegex(text, r"(?m)^\s*import\b")


if __name__ == "__main__":
    unittest.main()
