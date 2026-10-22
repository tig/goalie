"""GET / is the Priorities view for the signed-in actor, drawn as a timeline (SPEC.md §8.2, release plan Decisions 1)."""

from __future__ import annotations

import datetime
import json
import re
import subprocess
import time
import unittest

from goalie_cli import SERVER, Store, create, update
from live_server import get, running_server

ISSUER = "https://issuer.test/tenant/v2.0"
AUDIENCE = "api://goalie-test"


def signed() -> tuple[str, dict[str, str]]:
    now = int(time.time())
    request = {"tokens": [{"claims": {"iss": ISSUER, "aud": AUDIENCE, "sub": "sub-chelsea", "nbf": now - 5, "exp": now + 600}}]}
    proc = subprocess.run(["node", "tests/sign_token.mjs"], cwd=SERVER, input=json.dumps(request).encode(), capture_output=True, check=True)
    out = json.loads(proc.stdout)
    env = {"GOALIE_ISSUERS": json.dumps([{"issuer": ISSUER, "audience": AUDIENCE, "jwks": out["jwks"]}])}
    return out["tokens"][0], env


def positions(text: str, needles: list[str]) -> list[int]:
    return [text.index(needle) for needle in needles]


def days_since(iso: str) -> int:
    return (datetime.datetime.now(datetime.timezone.utc).date() - datetime.date.fromisoformat(iso)).days


def today_at(text: str) -> float:
    found = re.search(r'class="today" style="left:([\d.]+)%"', text)
    assert found, "no today line"
    return float(found.group(1))


def row(text: str, goal: str) -> str:
    """The HTML of one goal row, up to the next row."""
    start = text.index(f'id="goal-{goal}"')
    end = text.find('class="row', start + 1)
    return text[start:] if end == -1 else text[start:end]


class PrioritiesHomeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        result = cls.store.write("chelsea", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))
        assert result["ok"], result
        token, env = signed()
        with running_server(cls.store.path, env) as (proc, port):
            auth = {"Authorization": f"Bearer {token}"}
            cls.home = get(proc, port, "/", auth)
            cls.anonymous = get(proc, port, "/")
            cls.later = get(proc, port, "/?from=2026-12-09", auth).body.decode("utf-8")
            cls.bad_from = get(proc, port, "/?from=2026-13-45", auth)
            cls.red = get(proc, port, "/?health=RED", auth).body.decode("utf-8")
            cls.spine = get(proc, port, "/?q=SPINE", auth).body.decode("utf-8")
            cls.nothing = get(proc, port, "/?q=zzzz-no-such-goal", auth).body.decode("utf-8")
            cls.bad_health = get(proc, port, "/?health=PURPLE", auth).body.decode("utf-8")
        cls.text = cls.home.body.decode("utf-8")
        code, cls.printed = cls.store.run("home")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_signed_in_home_is_the_priorities_view(self) -> None:
        self.assertEqual(self.home.status, 200)
        self.assertIn("<h2>Priorities</h2>", self.text)

    def test_priorities_are_in_rank_order(self) -> None:
        ids = ["XW-0001", "XW-0002", "XW-0003"]
        found = positions(self.text, [f'id="goal-{goal}"' for goal in ids])
        self.assertEqual(found, sorted(found))
        ranks = re.findall(r'class="rank[^"]*"[^>]*>(\d+)<', self.text)
        self.assertEqual(ranks[:3], ["1", "2", "3"])

    def test_every_date_shows_its_date_type(self) -> None:
        for label in ("Committed Oct 1", "Committed Nov 15", "Fantasy Nov 30", "Promotion Milestone Nov 6"):
            self.assertIn(label, self.text)

    def test_health_is_written_as_well_as_colored(self) -> None:
        for goal, health in (("XW-0001", "RED"), ("XW-0002", "YELLOW"), ("XW-0003", "GREEN")):
            row = self.text[self.text.index(f'id="goal-{goal}"'):]
            self.assertIn(f'data-health="{health}"', row[:400])

    def test_the_cut_line_is_drawn_after_the_funded_priorities(self) -> None:
        cut = self.text.index('class="cut"')
        self.assertGreater(cut, self.text.index('id="goal-XW-0003"'))

    def test_goalie_own_goal_tree_is_open_under_xw_0003(self) -> None:
        parent = self.text.index('id="goal-XW-0003"')
        for sub in ["XW-0004"] + [f"XW-{n:04d}" for n in range(5, 12)]:
            self.assertGreater(self.text.index(f'id="goal-{sub}"'), parent, sub)
        self.assertIn("Stand up the spine: store, rules, sign-in, event log", self.text)

    def test_home_needs_a_signed_in_actor(self) -> None:
        self.assertEqual(self.anonymous.status, 401)
        body = self.anonymous.body.decode("utf-8")
        self.assertNotIn("XW-0001", body)
        self.assertIn("Sign in", body)

    def test_the_local_tool_prints_the_same_view(self) -> None:
        self.assertIn('id="goal-XW-0001"', self.printed["html"])

    def test_a_slip_names_its_days_past_the_committed_date(self) -> None:
        days = days_since("2026-10-01")
        if days <= 0:
            self.skipTest("Oct 1 has not passed")
        self.assertIn(f"slip {days} days", row(self.text, "XW-0001"))
        self.assertIn(f"slip {days} days</span> past", self.text)

    def test_the_promotion_milestone_due_is_counted_in_days(self) -> None:
        days = -days_since("2026-11-06")
        if days < 0:
            self.skipTest("Nov 6 has passed")
        self.assertIn(f"{days} days <small", self.text)
        self.assertIn("XW-0004", self.text[self.text.index("Promotions due"):])

    def test_today_is_inside_the_timeline(self) -> None:
        self.assertGreater(today_at(self.text), 0)
        self.assertLess(today_at(self.text), 100)

    def test_the_title_and_top_bar_name_the_org_unit(self) -> None:
        self.assertIn("<h1>Excaliwire</h1>", self.text)
        self.assertNotIn("Company goals", self.text)
        self.assertNotRegex(self.text, r"\d+ sub-goals?<")

    def test_the_committed_card_counts_each_health(self) -> None:
        counts = re.findall(r'class="count[^"]*"[^>]*>.*?</span>(\d+ [A-Z]+)</a>', self.text)
        self.assertEqual(counts, ["1 RED", "1 YELLOW", "1 GREEN"])

    def test_owners_are_named(self) -> None:
        self.assertIn('title="Tig"', row(self.text, "XW-0001"))

    def test_the_signed_in_actor_avatar_is_outlined_on_their_rows(self) -> None:
        self.assertIn("av mine", row(self.text, "XW-0003"))
        self.assertNotIn("av mine", row(self.text, "XW-0001"))

    def test_a_sub_goal_date_is_drawn_only_when_it_differs_from_its_parent(self) -> None:
        self.assertIn("Committed Nov 6", row(self.text, "XW-0004"))
        self.assertNotIn("Nov 6", row(self.text, "XW-0005"))

    def test_a_goal_with_no_health_has_no_pill(self) -> None:
        self.assertNotIn('class="chip"', row(self.text, "XW-0006"))

    def test_the_timeline_moves_earlier_and_later(self) -> None:
        self.assertRegex(self.text, r'href="/\?from=\d{4}-\d{2}-\d{2}"[^>]*aria-label="Earlier"')
        self.assertRegex(self.text, r'href="/\?from=\d{4}-\d{2}-\d{2}"[^>]*aria-label="Later"')
        self.assertIn('href="/"', self.text)

    def test_from_opens_the_week_that_holds_that_day(self) -> None:
        weeks = re.findall(r'class="wk"[^>]*>([^<]+)<', self.later)
        self.assertEqual(weeks[0], "Dec 7")

    def test_a_bad_from_falls_back_to_the_default_window(self) -> None:
        self.assertEqual(self.bad_from.status, 200)
        self.assertEqual(re.findall(r'class="wk"[^>]*>([^<]+)<', self.bad_from.body.decode("utf-8"))[0], re.findall(r'class="wk"[^>]*>([^<]+)<', self.text)[0])

    def test_goal_rows_have_no_hover_card(self) -> None:
        self.assertNotIn('class="tip"', row(self.text, "XW-0001"))
        visible = row(self.text, "XW-0001").replace('id="goal-XW-0001"', "")
        self.assertNotIn("XW-0001", visible)

    def test_the_grid_and_today_line_are_drawn_once_for_the_whole_board(self) -> None:
        self.assertEqual(self.text.count('class="today"'), 1)

    def test_each_health_count_links_to_its_filter(self) -> None:
        for health in ("RED", "YELLOW", "GREEN"):
            self.assertIn(f'href="/?health={health}"', self.text)

    def test_hovering_a_health_count_highlights_its_goals(self) -> None:
        self.assertIn(':has(.count[data-health="RED"]:hover) .row[data-health="RED"]', self.text)

    def test_the_health_filter_keeps_only_that_health(self) -> None:
        self.assertIn('id="goal-XW-0001"', self.red)
        self.assertNotIn('id="goal-XW-0002"', self.red)
        self.assertNotIn('id="goal-XW-0003"', self.red)

    def test_the_active_filter_links_back_to_all_goals(self) -> None:
        active = self.red[self.red.index('data-health="RED"', self.red.index('class="counts"')) - 200:]
        self.assertIn('aria-current="true"', self.red)
        self.assertIn('class="clear" href="/"', self.red)

    def test_a_bad_health_filter_is_ignored(self) -> None:
        self.assertIn('id="goal-XW-0002"', self.bad_health)

    def test_home_has_a_search_box(self) -> None:
        self.assertRegex(self.text, r'<form[^>]*method="get"[^>]*role="search"')
        self.assertIn('name="q"', self.text)

    def test_search_matches_goal_summaries_and_keeps_their_parents(self) -> None:
        self.assertIn('id="goal-XW-0005"', self.spine)
        self.assertIn('id="goal-XW-0004"', self.spine)
        self.assertIn('id="goal-XW-0003"', self.spine)
        self.assertNotIn('id="goal-XW-0001"', self.spine)
        self.assertNotIn('id="goal-XW-0006"', self.spine)
        self.assertIn('value="SPINE"', self.spine)

    def test_search_with_no_match_says_so(self) -> None:
        self.assertIn("No goals match", self.nothing)

    def test_moving_the_timeline_keeps_the_filter(self) -> None:
        self.assertRegex(self.red, r'href="/\?health=RED&amp;from=\d{4}-\d{2}-\d{2}"[^>]*aria-label="Earlier"')

    def test_the_page_feels_like_an_app(self) -> None:
        self.assertIn("body{cursor:default", self.text.replace(" ", ""))
        self.assertIn("user-select:none", self.text)

    def test_every_card_has_help(self) -> None:
        cards = self.text[self.text.index('class="cards"'):self.text.index('class="card board"')]
        self.assertEqual(cards.count('class="q"'), 3)
        self.assertEqual(cards.count('class="tip"'), 3)

    def test_the_sign_in_page_gives_the_reason(self) -> None:
        self.assertIn("no token", self.anonymous.body.decode("utf-8"))


class PrioritiesDefinitionTests(unittest.TestCase):
    """Home draws the saved definition: open goals at the org unit's level, current-period Priorities, and an old date keeps today on screen."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        quarter = (datetime.date.today().month - 1) // 3 + 1
        period = f"{datetime.date.today().year}-Q{quarter}"
        writes = [
            create("org_unit", "xw-team", {"name": "XW Team", "level": "Team", "parent": "excaliwire", "owner": "tig"}, "Test data"),
            create("priority", "PRI-4", {"org_unit": "excaliwire", "period": period, "rank": 4, "title": "An empty Priority", "status": "Current"}, "Test data"),
            create("priority", "PRI-OLD", {"org_unit": "excaliwire", "period": "2020-Q1", "rank": 5, "title": "A Priority of an old period", "status": "Current"}, "Test data"),
            create("goal", "XW-0090", {**OLD_GOAL, "summary": "An old Committed date in the view", "priority": "PRI-1"}, "Test data"),
            create("goal", "XW-0091", {**OLD_GOAL, "summary": "A Team goal on a company Priority", "priority": "PRI-1", "org_unit": "xw-team", "level": "Team"}, "Test data"),
            create("goal", "XW-0092", {**OLD_GOAL, "summary": "A Completed goal", "priority": "PRI-2", "state": "Completed", "health": None, "path_to_green": None}, "Test data"),
            create("draft", "DR-1", {"entity": "XW-0001", "actor": "chelsea", "base_version": 1, "change": {"health": "YELLOW"}, "reason": "test"}, "Test data"),
        ]
        for command in writes:
            result = cls.store.write("chelsea", command)
            assert result["ok"], (command, result)
        code, printed = cls.store.run("home")
        assert code == 0, printed
        cls.text = printed["html"]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_an_empty_priority_is_drawn_with_its_rank(self) -> None:
        self.assertIn("An empty Priority", self.text)
        self.assertIn('id="priority-PRI-4"', self.text)

    def test_a_priority_of_another_period_is_not_drawn(self) -> None:
        self.assertNotIn("A Priority of an old period", self.text)

    def test_a_goal_at_another_level_is_not_drawn(self) -> None:
        self.assertNotIn("XW-0091", self.text)

    def test_a_completed_goal_is_not_drawn(self) -> None:
        self.assertNotIn("XW-0092", self.text)

    def test_an_old_date_keeps_today_on_the_timeline(self) -> None:
        self.assertIn('id="goal-XW-0090"', self.text)
        self.assertLess(today_at(self.text), 90)

    def test_the_drafts_card_counts_drafts(self) -> None:
        self.assertIn("1 <small", self.text[self.text.index(">Drafts<"):])


OLD_GOAL = {
    "description": "A test goal.",
    "owner": "tig",
    "org_unit": "excaliwire",
    "level": "Company",
    "type": "Milestone (Launch)",
    "due_date": "2025-01-15",
    "date_type": "Committed",
    "plan": "docs/release-plan.md",
    "plan_maturity": "Pencil",
    "severity": "sev2",
    "state": "In Progress",
    "health": "RED",
    "path_to_green": {"steps": [{"owner": "tig", "date": "2026-10-29", "text": "Test step"}]},
    "origination": "New",
}


if __name__ == "__main__":
    unittest.main()
