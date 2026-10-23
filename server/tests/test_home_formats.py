"""Home draws the Priorities view as a timeline, a list, or a month calendar (SPEC.md §8.2). The drawing does not change the saved definition."""

from __future__ import annotations

import re
import unittest

from goalie_cli import Store, create, update
from live_server import get, running_server
from test_priorities_home import signed

# Four goals on one day, so the calendar day shows 3 and "+1".
CROWDED = "2026-12-10"
CROWD = {
    "description": "A test goal.",
    "owner": "tig",
    "org_unit": "excaliwire",
    "level": "Company",
    "type": "Milestone (Launch)",
    "due_date": CROWDED,
    "date_type": "Committed",
    "plan": "docs/release-plan.md",
    "plan_maturity": "Pencil",
    "severity": "sev2",
    "state": "In Progress",
    "health": "GREEN",
    "origination": "New",
    "priority": "PRI-2",
}


class HomeFormatTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        result = cls.store.write("chelsea", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))
        assert result["ok"], result
        for n in range(4):
            result = cls.store.write("chelsea", create("goal", f"XW-008{n}", {**CROWD, "summary": f"Crowded goal {n}"}, "Test data"))
            assert result["ok"], result
        token, env = signed()
        pages = {
            "timeline": "/",
            "list": "/?format=list",
            "calendar": "/?format=calendar&from=2026-10-01",
            "december": "/?format=calendar&from=2026-12-09",
            "bogus": "/?format=bogus",
            "list_red": "/?format=list&health=RED",
            "calendar_red": "/?format=calendar&health=RED&from=2026-10-01",
        }
        with running_server(cls.store.path, env) as (proc, port):
            auth = {"Authorization": f"Bearer {token}"}
            cls.pages = {name: get(proc, port, path, auth).body.decode("utf-8") for name, path in pages.items()}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def toggle(self, page: str) -> str:
        text = self.pages[page]
        start = text.index('class="seggroup formats"')
        return text[start:text.index("</nav>", start)]

    def test_the_toggle_names_the_three_drawings(self) -> None:
        for page in ("timeline", "list", "calendar"):
            labels = re.findall(r'class="segbtn fmt[^"]*"[^>]*>([^<]+)<', self.toggle(page))
            self.assertEqual(labels, ["Timeline", "List", "Calendar"], page)

    def test_the_toggle_marks_the_drawing_in_use(self) -> None:
        for page, label in (("timeline", "Timeline"), ("list", "List"), ("calendar", "Calendar"), ("bogus", "Timeline")):
            current = re.findall(r'aria-current="page"[^>]*>([^<]+)<', self.toggle(page))
            self.assertEqual(current, [label], page)

    def test_a_bad_format_falls_back_to_the_timeline(self) -> None:
        self.assertRegex(self.pages["bogus"], r"--now:[\d.]+")

    def test_a_switch_keeps_the_filter_and_the_position(self) -> None:
        toggle = self.toggle("calendar_red")
        self.assertIn('href="/?health=RED&amp;from=2026-10-01"', toggle)
        self.assertIn('href="/?format=list&amp;health=RED&amp;from=2026-10-01"', toggle)

    def test_the_search_keeps_the_format(self) -> None:
        self.assertIn('<input type="hidden" name="format" value="list">', self.pages["list"])

    def test_the_list_draws_the_view_columns(self) -> None:
        text = self.pages["list"]
        head = text[text.index('class="lhead"'):]
        labels = re.findall(r'class="col[^"]*">([^<]+)<', head[:2000])
        self.assertEqual(labels, ["Health", "Date Type", "Promotion Milestone", "PTG"])
        self.assertNotRegex(text, r"--now:[\d.]+")

    def test_the_list_keeps_the_tree_rank_and_owner(self) -> None:
        text = self.pages["list"]
        first = text[text.index('id="goal-XW-0001"'):]
        self.assertIn('<span class="rnum">1</span>', first[:600])
        self.assertIn('title="Tig"', first[:1500])
        self.assertLess(text.index('id="goal-XW-0003"'), text.index('id="goal-XW-0005"'))

    def test_the_list_writes_each_date_with_its_date_type(self) -> None:
        text = self.pages["list"]
        parent = text[text.index('id="goal-XW-0003"'):text.index('id="goal-XW-0004"')]
        self.assertIn("Fantasy Nov 30", parent)
        self.assertIn("Promotion Milestone Nov 6", parent)

    def test_the_list_writes_the_health_and_the_first_ptg_step(self) -> None:
        text = self.pages["list"]
        first = text[text.index('id="goal-XW-0001"'):text.index('id="goal-XW-0002"')]
        self.assertIn(">RED<", first)
        self.assertIn("Placeholder: Tig writes the Path to Green", first)

    def test_the_list_shows_no_goal_keys(self) -> None:
        text = re.sub(r'id="goal-XW-\d+"', "", self.pages["list"])
        self.assertNotRegex(text, r"XW-\d{4}")

    def test_the_list_has_no_timeline_range(self) -> None:
        self.assertNotIn('aria-label="Earlier"', self.pages["list"])

    def test_the_list_keeps_the_filter(self) -> None:
        text = self.pages["list_red"]
        self.assertIn('id="goal-XW-0001"', text)
        self.assertNotIn('id="goal-XW-0002"', text)

    def test_the_timeline_page_carries_a_list_for_the_phone(self) -> None:
        text = self.pages["timeline"]
        self.assertIn('class="list phone"', text)
        self.assertEqual(text.count('id="goal-XW-0001"'), 1)

    def test_the_calendar_is_a_month_grid_starting_on_monday(self) -> None:
        text = self.pages["calendar"]
        self.assertIn("October 2026", text)
        days = re.findall(r'class="dow">([^<]+)<', text)
        self.assertEqual(days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        first = re.search(r'data-date="(\d{4}-\d{2}-\d{2})"', text)
        self.assertEqual(first.group(1), "2026-09-28")

    def test_a_goal_date_sits_on_its_day(self) -> None:
        text = self.pages["calendar"]
        day = text[text.index('data-date="2026-10-01"'):text.index('data-date="2026-10-02"')]
        self.assertIn("Regenerate the E28 canon", day)
        self.assertIn('data-health="RED"', day)

    def test_a_calendar_chip_carries_its_date_type(self) -> None:
        text = self.pages["calendar"]
        day = text[text.index('data-date="2026-10-01"'):text.index('data-date="2026-10-02"')]
        self.assertIn("mk slip", day)
        self.assertIn("Committed Oct 1", day)

    def test_a_full_day_shows_three_and_the_rest_as_a_count(self) -> None:
        text = self.pages["december"]
        day = text[text.index(f'data-date="{CROWDED}"'):text.index('data-date="2026-12-11"')]
        self.assertEqual(day.count('class="chip'), 4)
        self.assertIn(">+1<", day)

    def test_calendar_earlier_and_later_move_one_month(self) -> None:
        text = self.pages["calendar"]
        self.assertRegex(text, r'href="/\?format=calendar&amp;from=2026-09-01"[^>]*aria-label="Earlier"')
        self.assertRegex(text, r'href="/\?format=calendar&amp;from=2026-11-01"[^>]*aria-label="Later"')

    def test_the_calendar_keeps_the_filter(self) -> None:
        text = self.pages["calendar_red"]
        self.assertIn("Regenerate the E28 canon", text[text.index('class="cal"'):])
        self.assertNotIn("Add two more humans", text[text.index('class="cal"'):])

    def test_the_summary_does_not_change_with_the_drawing(self) -> None:
        counts = [re.findall(r'class="count[^"]*"[^>]*>.*?</span>(\d+ [A-Z]+)</a>', self.pages[p]) for p in ("timeline", "list", "calendar")]
        self.assertEqual(counts[0], counts[1])
        self.assertEqual(counts[0], counts[2])


if __name__ == "__main__":
    unittest.main()
