"""The React app's pure model (server/web/src/model/): dates, the URL query, filter and search, timeline geometry, zoom, the calendar month, and help placement."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

MODEL = Path(__file__).resolve().parents[1] / "web" / "src" / "model"
FIXTURE = Path(__file__).resolve().parents[1] / "web" / "fixtures" / "priorities.json"


def run(body: str) -> object:
    """Run an ES module that imports the model as `m` and the seed fixture as `api`, and return what it prints as JSON."""
    imports = "".join(f'import * as {name} from "{(MODEL / f"{name}.ts").as_uri()}";\n' for name in ("dates", "query", "filter", "timeline", "calendar", "popover", "labels", "scroll"))
    script = f"""{imports}
import {{ readFileSync }} from "node:fs";
const api = JSON.parse(readFileSync({json.dumps(str(FIXTURE))}, "utf-8"));
const out = await (async () => {{ {body} }})();
process.stdout.write(JSON.stringify(out));
"""
    proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", script], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


class DateTests(unittest.TestCase):
    def test_short_date_names_the_year_only_outside_the_current_one(self) -> None:
        self.assertEqual(run('return [dates.shortDate("2026-10-01", "2026-10-23"), dates.shortDate("2027-03-31", "2026-10-23")];'), ["Oct 1", "Mar 31, 2027"])

    def test_a_week_starts_on_monday(self) -> None:
        self.assertEqual(run('return [dates.weekStart("2026-10-23"), dates.weekStart("2026-10-19"), dates.weekStart("2026-11-01")];'), ["2026-10-19", "2026-10-19", "2026-10-26"])

    def test_a_date_label_carries_its_date_type(self) -> None:
        self.assertEqual(run('return dates.dateLabel({ date: "2026-11-06", kind: "Promotion Milestone" }, "2026-10-23");'), "Promotion Milestone Nov 6")


class QueryTests(unittest.TestCase):
    def test_a_link_reopens_the_same_screen(self) -> None:
        screen = run('return query.parseScreen("?health=RED&q=canon&zoom=months&from=2026-09-01&view=list");')
        self.assertEqual(screen, {"health": "RED", "q": "canon", "zoom": "months", "from": "2026-09-01", "view": "list"})
        self.assertEqual(run("return query.screenQuery(query.parseScreen('?view=list&from=2026-09-01&zoom=months&q=a%20b&health=RED'));"), "?health=RED&q=a%20b&zoom=months&from=2026-09-01&view=list")

    def test_a_value_that_is_not_valid_is_ignored(self) -> None:
        screen = run('return query.parseScreen("?health=PINK&zoom=days&from=2026-13-45&view=grid&q=%20%20");')
        self.assertEqual(screen, {"zoom": "weeks", "view": "timeline"})

    def test_the_default_screen_has_no_query(self) -> None:
        self.assertEqual(run('return query.screenQuery({ zoom: "weeks", view: "timeline" });'), "")

    def test_search_is_trimmed_to_100_characters(self) -> None:
        self.assertEqual(run('return query.parseScreen("?q=" + "x".repeat(150) + "%20").q.length;'), 100)


def titles(rows: object) -> list:
    """Each kept goal as [id, match], depth first."""
    out: list = []

    def walk(goals: list) -> None:
        for g in goals:
            out.append([g["id"], g["match"]])
            walk(g["children"])

    for p in rows:  # type: ignore[union-attr]
        walk(p["goals"])
    return out


class FilterTests(unittest.TestCase):
    def test_no_filter_keeps_every_goal(self) -> None:
        rows = run("return filter.filterPriorities(api.funded, {});")
        self.assertEqual(len(titles(rows)), 11)
        self.assertTrue(all(match for _, match in titles(rows)))

    def test_search_keeps_the_parents_of_a_match_dimmed(self) -> None:
        rows = run('return filter.filterPriorities(api.funded, { q: "SPINE" });')
        self.assertEqual(titles(rows), [["XW-0003", False], ["XW-0004", False], ["XW-0005", True]])
        self.assertEqual([p["id"] for p in rows], ["PRI-3"])  # type: ignore[union-attr]

    def test_a_health_filter_shows_only_that_health(self) -> None:
        self.assertEqual(titles(run('return filter.filterPriorities(api.funded, { health: "RED" });')), [["XW-0001", True]])

    def test_health_and_search_both_hold(self) -> None:
        self.assertEqual(titles(run('return filter.filterPriorities(api.funded, { health: "GREEN", q: "canon" });')), [])

    def test_depth_counts_from_the_top_goal(self) -> None:
        depths = run('return filter.flatten(filter.filterPriorities(api.funded, {}).flatMap((p) => p.goals)).map((g) => g.depth);')
        self.assertEqual(depths, [0, 0, 0, 1] + [2] * 7)


class TimelineTests(unittest.TestCase):
    def test_it_opens_early_enough_to_show_a_recent_slip(self) -> None:
        w = run('return timeline.timelineWindow(api.funded, "2026-10-23", "weeks");')
        self.assertEqual((w["open"], w["start"], w["end"]), ("2026-09-28", "2026-03-30", "2027-06-28"))  # type: ignore[index]
        self.assertEqual((w["weeks"], w["weekPx"], w["openPx"]), (65, 84, 26 * 84))  # type: ignore[index]
        self.assertEqual((w["first"], w["last"]), ("2026-09-28", "2026-12-27"))  # type: ignore[index]

    def test_with_no_recent_slip_it_opens_two_weeks_before_today(self) -> None:
        w = run('return timeline.timelineWindow(api.funded.slice(1), "2026-10-23", "weeks");')
        self.assertEqual(w["open"], "2026-10-05")  # type: ignore[index]

    def test_earlier_and_later_move_by_the_zoom_step(self) -> None:
        steps = run('return ["weeks", "months", "quarters"].map((z) => { const w = timeline.timelineWindow(api.funded, "2026-10-23", z, "2026-11-04"); return [w.open, w.earlier, w.later, w.weekPx]; });')
        self.assertEqual(steps, [["2026-11-02", "2026-10-05", "2026-11-30", 84], ["2026-11-02", "2026-08-03", "2027-02-01", 30], ["2026-11-02", "2026-05-04", "2027-05-03", 14]])

    def test_earlier_and_later_start_from_the_week_on_screen(self) -> None:
        moves = run('return [timeline.moveFrom("2026-10-21", "weeks", -1), timeline.moveFrom("2026-10-21", "months", 1), timeline.moveFrom("2026-10-21", "quarters", -1)];')
        self.assertEqual(moves, ["2026-09-21", "2027-01-18", "2026-04-20"])

    def test_the_axis_names_weeks_or_months(self) -> None:
        labels = run('return ["weeks", "months"].map((z) => timeline.timelineWindow(api.funded, "2026-10-23", z).labels);')
        self.assertEqual(len(labels[0]), 65)  # type: ignore[index]
        self.assertEqual(labels[0][26]["label"], "Sep 28")  # type: ignore[index]
        self.assertEqual([l["label"] for l in labels[1][:3]], ["Apr", "May", "Jun"])  # type: ignore[index]
        self.assertIn("Jan 2027", [l["label"] for l in labels[1]])  # type: ignore[index]

    def test_the_visible_range_follows_the_scroll(self) -> None:
        r = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return [timeline.visibleRange(w, w.openPx, 13 * 84), timeline.visibleRange(w, 0, 7 * 84)];')
        self.assertEqual(r, [{"first": "2026-09-28", "last": "2026-12-27"}, {"first": "2026-03-30", "last": "2026-05-17"}])

    def test_a_slip_runs_from_the_committed_date_to_today(self) -> None:
        lane = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); const l = timeline.laneOf(api.funded[0].goals[0], w, "2026-10-23"); return { l, d: w.pos("2026-10-01"), t: w.pos("2026-10-23") };')
        self.assertEqual(lane["l"]["slip"], {"from": lane["d"], "to": lane["t"], "days": 22})  # type: ignore[index]
        self.assertEqual(lane["l"]["tick"]["date"]["kind"], "Committed")  # type: ignore[index]
        self.assertNotIn("ahead", lane["l"])  # type: ignore[operator]

    def test_a_fantasy_date_draws_a_line_from_the_promotion_milestone(self) -> None:
        lane = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return timeline.laneOf(api.funded[2].goals[0], w, "2026-10-23");')
        self.assertEqual(lane["tick"]["date"]["kind"], "Promotion Milestone")  # type: ignore[index]
        self.assertEqual(lane["end"]["date"]["kind"], "Fantasy")  # type: ignore[index]
        self.assertEqual(lane["line"]["kind"], "Fantasy")  # type: ignore[index]
        self.assertEqual(lane["line"]["from"], lane["tick"]["at"])  # type: ignore[index]
        self.assertIn("ahead", lane)  # type: ignore[operator]

    def test_a_date_past_the_window_is_marked_at_its_edge(self) -> None:
        lane = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return timeline.laneOf({ ...api.funded[1].goals[0], dates: [{ date: "2027-09-01", kind: "Committed" }] }, w, "2026-10-23");')
        self.assertEqual((lane["tick"]["outside"], lane["tick"]["at"]), ("after", 100))  # type: ignore[index]

    def test_a_sub_goal_with_its_parents_date_draws_only_health(self) -> None:
        lane = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return timeline.laneOf(api.funded[2].goals[0].children[0].children[0], w, "2026-10-23");')
        self.assertEqual(sorted(lane), ["health"])  # type: ignore[arg-type]


class CalendarTests(unittest.TestCase):
    def test_a_month_starts_on_monday(self) -> None:
        m = run('return calendar.calendarMonth(filter.filterPriorities(api.funded, {}), "2026-10-23");')
        self.assertEqual((m["month"], m["earlier"], m["later"]), ("2026-10-01", "2026-09-01", "2026-11-01"))  # type: ignore[index]
        self.assertEqual([w[0]["date"] for w in m["weeks"]], ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"])  # type: ignore[index]
        self.assertEqual([d["inMonth"] for d in m["weeks"][0]], [False, False, False, True, True, True, True])  # type: ignore[index]
        self.assertEqual([d["date"] for w in m["weeks"] for d in w if d["today"]], ["2026-10-23"])  # type: ignore[index]

    def test_each_goal_date_sits_on_its_day(self) -> None:
        m = run('return calendar.calendarMonth(filter.filterPriorities(api.funded, {}), "2026-10-23", "2026-11-15");')
        days = {d["date"]: [(x["goal"]["id"], x["date"]["kind"]) for x in d["marks"]] for w in m["weeks"] for d in w if d["marks"]}  # type: ignore[index]
        self.assertEqual(len(m["weeks"]), 6)  # type: ignore[index]
        self.assertEqual(days, {"2026-11-06": [("XW-0003", "Promotion Milestone"), ("XW-0004", "Committed")], "2026-11-15": [("XW-0002", "Committed")], "2026-11-30": [("XW-0003", "Fantasy")]})

    def test_a_filter_draws_only_goals_that_match(self) -> None:
        m = run('return calendar.calendarMonth(filter.filterPriorities(api.funded, { q: "MLP" }), "2026-10-23", "2026-11-01");')
        marks = [(x["goal"]["id"], d["date"]) for w in m["weeks"] for d in w for x in d["marks"]]  # type: ignore[index]
        self.assertEqual(marks, [("XW-0004", "2026-11-06")])

    def test_a_day_shows_three_chips_and_counts_the_rest(self) -> None:
        self.assertEqual(run("return calendar.dayChips([1, 2, 3, 4, 5]);"), {"shown": [1, 2, 3], "more": [4, 5]})


class PopoverTests(unittest.TestCase):
    def place(self, anchor: dict, vw: int, vh: int, height: int = 150) -> dict:
        return run(f"return popover.placePopover({json.dumps(anchor)}, {height}, {{ width: {vw}, height: {vh} }});")  # type: ignore[return-value]

    def test_it_opens_below_and_left_aligned(self) -> None:
        self.assertEqual(self.place({"left": 200, "top": 160, "right": 218, "bottom": 178}, 1440, 900), {"left": 192, "top": 186, "width": 300})

    def test_it_stays_inside_the_right_edge(self) -> None:
        self.assertEqual(self.place({"left": 1150, "top": 160, "right": 1168, "bottom": 178}, 1440, 900)["left"], 1440 - 16 - 300)
        self.assertEqual(self.place({"left": 1050, "top": 160, "right": 1068, "bottom": 178}, 1100, 900)["left"], 1100 - 16 - 300)

    def test_it_is_never_wider_than_the_screen_less_32_px(self) -> None:
        p = self.place({"left": 300, "top": 160, "right": 318, "bottom": 178}, 320, 900)
        self.assertEqual((p["left"], p["width"]), (16, 288))

    def test_it_opens_above_when_below_would_leave_the_screen(self) -> None:
        self.assertEqual(self.place({"left": 600, "top": 820, "right": 618, "bottom": 838}, 1440, 900)["top"], 820 - 8 - 150)


class LabelTests(unittest.TestCase):
    def test_the_range_names_a_year_only_outside_the_current_one(self) -> None:
        labels = run('return [["2026-09-28", "2026-12-04"], ["2026-09-28", "2027-04-05"], ["2027-04-21", "2027-06-27"], ["2025-12-29", "2027-01-03"]].map(([a, b]) => labels.rangeLabel(a, b, "2026-10-23"));')
        self.assertEqual(labels, ["Sep 28 – Dec 4", "Sep 28 – Apr 5, 2027", "Apr 21 – Jun 27, 2027", "Dec 29, 2025 – Jan 3, 2027"])

    def test_the_sizers_hold_the_longest_form_for_every_month(self) -> None:
        sizers = run('return labels.labelSizers("2026-10-23");')
        for month in ("Jan", "May", "Sep", "Dec"):
            self.assertIn(f"{month} 28, 2027 – {month} 28, 2028", sizers)
        for month in ("January", "May", "September", "December"):
            self.assertIn(f"{month} 2028", sizers)
        self.assertEqual(len(sizers), 24)


class ScrollTests(unittest.TestCase):
    def wheel(self, event: dict, left: int, max_left: int = 1000) -> object:
        return run(f"return scroll.wheelToScroll({json.dumps(event)}, {left}, {max_left});")

    def test_a_vertical_wheel_scrolls_sideways(self) -> None:
        self.assertEqual(self.wheel({"deltaX": 0, "deltaY": 100, "deltaMode": 0, "shiftKey": False}, 500), 100)
        self.assertEqual(self.wheel({"deltaX": 0, "deltaY": -3, "deltaMode": 1, "shiftKey": False}, 500), -48)

    def test_at_the_edge_a_vertical_wheel_scrolls_the_page(self) -> None:
        self.assertIsNone(self.wheel({"deltaX": 0, "deltaY": -100, "deltaMode": 0, "shiftKey": False}, 0))
        self.assertIsNone(self.wheel({"deltaX": 0, "deltaY": 100, "deltaMode": 0, "shiftKey": False}, 1000))

    def test_shift_and_a_vertical_wheel_scrolls_sideways(self) -> None:
        self.assertEqual(self.wheel({"deltaX": 0, "deltaY": 100, "deltaMode": 0, "shiftKey": True}, 500), 100)

    def test_a_sideways_swipe_is_left_to_the_browser(self) -> None:
        self.assertIsNone(self.wheel({"deltaX": 50, "deltaY": 10, "deltaMode": 0, "shiftKey": False}, 500))

    def test_the_arrows_move_one_week(self) -> None:
        self.assertEqual(run('return ["ArrowLeft", "ArrowRight", "ArrowUp", "a"].map((k) => scroll.arrowStep(k, 84));'), [-84, 84, None, None])

    def test_the_edge_fades_show_where_there_is_more(self) -> None:
        self.assertEqual(run("return [scroll.scrollEdges(0, 2000, 800), scroll.scrollEdges(600, 2000, 800), scroll.scrollEdges(1199.5, 2000, 800), scroll.scrollEdges(0, 800, 800)];"), [{"before": False, "after": True}, {"before": True, "after": True}, {"before": True, "after": False}, {"before": False, "after": False}])

    def test_a_drag_pans_once_it_passes_4_px(self) -> None:
        self.assertEqual(run("return [scroll.isDrag(3), scroll.isDrag(-5), scroll.dragLeft(500, 100, 160)];"), [False, True, 440])


if __name__ == "__main__":
    unittest.main()
