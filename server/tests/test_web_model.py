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
    imports = "".join(f'import * as {name} from "{(MODEL / f"{name}.ts").as_uri()}";\n' for name in ("query", "filter", "timeline", "calendar", "popover", "labels", "scroll", "route", "goalpage", "commands", "newgoal"))
    script = f"""{imports}
import {{ readFileSync }} from "node:fs";
const api = JSON.parse(readFileSync({json.dumps(str(FIXTURE))}, "utf-8"));
const TYPES = {{ goal: "Milestone (Launch)", milestone: "Milestone (Commit)" }};
const page = (key) => JSON.parse(readFileSync({json.dumps(str(FIXTURE.parent))} + "/goal-" + key + ".json", "utf-8"));
const out = await (async () => {{ {body} }})();
process.stdout.write(JSON.stringify(out));
"""
    proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", script], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


class DateTests(unittest.TestCase):
    """The date math itself is server/src/dates.ts, tested in test_dates.py. These are the app's labels on top of it."""

    def test_new_goal_names_only_what_is_still_missing(self) -> None:
        cases = '[{ summary: "", due_date: "", date_type: "" }, { summary: "Ship", due_date: "", date_type: "Fantasy" }, { summary: "Ship", due_date: "2027-01-01", date_type: "" }, { summary: "Ship", due_date: "2027-01-01", date_type: "Fantasy" }]'
        self.assertEqual(run(f"return {cases}.map(labels.stillMissing);"), ["Write a summary, and choose a date and a Date Type.", "Choose a date.", "Choose a Date Type.", ""])

    def test_a_date_label_carries_its_date_type(self) -> None:
        self.assertEqual(run('return labels.dateLabel({ date: "2026-11-06", kind: "Promotion Milestone" }, "2026-10-23");'), "Promotion Milestone Nov 6")

    def test_dates_are_written_in_the_lists_order(self) -> None:
        d = run("return [labels.listDates(api.funded[2].goals[0].dates), labels.listDates(api.funded[0].goals[0].dates)];")
        self.assertEqual([x["kind"] for x in d[0]["own"]], ["Fantasy"])  # type: ignore[index]
        self.assertEqual([x["kind"] for x in d[0]["pm"]], ["Promotion Milestone"])  # type: ignore[index]
        self.assertEqual(d[0]["judged"]["kind"], "Promotion Milestone")  # type: ignore[index]
        self.assertEqual(d[1]["judged"], {"date": "2026-10-01", "kind": "Committed", "slipDays": 22})  # type: ignore[index]

    def test_a_slip_is_written_in_one_place(self) -> None:
        self.assertEqual(run("return [labels.slipLabel(22), labels.slipLabel(1)];"), ["slip 22 days", "slip 1 day"])


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

    def test_a_from_outside_1970_to_9999_is_ignored(self) -> None:
        froms = run('return ["0099-01-01", "1969-12-31", "1970-01-01", "9999-12-31"].map((d) => query.parseScreen("?from=" + d).from ?? null);')
        self.assertEqual(froms, [None, None, "1970-01-01", "9999-12-31"])

    def test_search_collapses_repeated_spaces(self) -> None:
        self.assertEqual(run('return query.parseScreen("?q=" + encodeURIComponent("  spine   store ")).q;'), "spine store")

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

    def test_a_health_filter_selects_what_its_count_counts(self) -> None:
        # "1 GREEN" counts one top-level goal in progress above the cut line. Its GREEN sub-goals are not counted.
        self.assertEqual(titles(run('return filter.filterPriorities(api.funded, { health: "GREEN" });')), [["XW-0003", True]])

    def test_the_server_says_what_the_count_counts(self) -> None:
        # The app keeps no counting rule of its own (plan E-9): a goal the server marks counted is the one a health filter selects.
        rows = run('const funded = structuredClone(api.funded); funded[2].goals[0].counted = false; funded[2].goals[0].children[0].counted = true; return filter.filterPriorities(funded, { health: "GREEN" });')
        self.assertEqual(titles(rows), [["XW-0003", False], ["XW-0004", True]])

    def test_pointing_at_a_count_lights_what_it_counts(self) -> None:
        lit = run('return filter.flatten(filter.filterPriorities(api.funded, {}).flatMap((p) => p.goals)).filter((g) => filter.isLit(g, { hot: "GREEN" })).map((g) => g.id);')
        self.assertEqual(lit, ["XW-0003"])
        self.assertEqual(run('return filter.flatten(filter.filterPriorities(api.funded, { health: "RED" }).flatMap((p) => p.goals)).filter((g) => filter.isLit(g, { selected: "RED" })).map((g) => g.id);'), ["XW-0001"])

    def test_a_sub_goal_with_its_parents_date_inherits_it(self) -> None:
        kid = run("return filter.filterPriorities(api.funded, {})[2].goals[0].children[0].children[0];")
        self.assertEqual(kid["inherited"], [{"date": "2026-11-06", "kind": "Committed"}])  # type: ignore[index]
        self.assertEqual(run("return filter.filterPriorities(api.funded, {})[2].goals[0].inherited;"), [])

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

    def test_the_board_is_wider_than_the_screen_at_every_zoom(self) -> None:
        sizes = run('return ["weeks", "months", "quarters"].map((z) => { const w = timeline.timelineWindow(api.funded, "2026-10-23", z); return [w.weeks, w.openPx, w.weeks * w.weekPx, w.open]; });')
        self.assertEqual(sizes, [[65, 26 * 84, 65 * 84, "2026-09-28"], [130, 52 * 30, 130 * 30, "2026-09-28"], [260, 104 * 14, 260 * 14, "2026-09-28"]])

    def test_the_board_opens_inside_its_scroll_range(self) -> None:
        self.assertEqual(run("return [timeline.openScroll(2184, 2300, 816, 5460, 1208), timeline.openScroll(2184, 2300, 816, 2500, 1200), timeline.openScroll(-5, 0, 816, 2500, 1200)];"), [2184, 1300, 0])

    def test_the_board_opens_with_today_in_the_left_third(self) -> None:
        # Wide: today is 300 px past the opening week, more than a third of 816, so the board scrolls 28 px on. Narrow: a third of 272 px.
        self.assertEqual(run("return [timeline.openScroll(2184, 2484, 816, 5460, 1208), Math.round(timeline.openScroll(2184, 2484, 272, 5460, 664))];"), [2212, 2393])

    def test_the_window_stays_inside_1970_to_9999(self) -> None:
        w = run('const a = timeline.timelineWindow(api.funded, "2026-10-23", "quarters", "9999-12-20"); const b = timeline.timelineWindow(api.funded, "2026-10-23", "quarters", "1970-01-01"); return [a.end, b.start, a.labels.some((l) => /1\\d{4}/.test(l.label))];')
        self.assertLessEqual(w[0], "9999-12-31")  # type: ignore[index]
        self.assertGreaterEqual(w[1], "1970-01-01")  # type: ignore[index]
        self.assertFalse(w[2])  # type: ignore[index]

    def test_an_axis_label_shows_only_when_it_fits_whole(self) -> None:
        self.assertEqual(run('const v = { left: 1000, right: 1800 }; return [timeline.fitsView(1100, 50, v), timeline.fitsView(990, 50, v), timeline.fitsView(1760, 50, v)];'), [True, False, False])

    def test_the_today_pill_stays_inside_the_screen(self) -> None:
        self.assertEqual(run('const v = { left: 1000, right: 1800 }; return [timeline.todayPill(1400, 34, v), timeline.todayPill(1010, 34, v), timeline.todayPill(1790, 34, v), timeline.todayPill(900, 34, v)];'), [1400, 1034, 1766, None])

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
        self.assertEqual([l["label"] for l in labels[1][:3]], ["Oct 2025", "Nov", "Dec"])  # type: ignore[index]
        self.assertIn("Jan 2026", [l["label"] for l in labels[1]])  # type: ignore[index]
        self.assertIn("Jan 2027", [l["label"] for l in labels[1]])  # type: ignore[index]

    def test_quarters_name_every_other_month(self) -> None:
        names = run('return timeline.timelineWindow(api.funded, "2026-10-23", "quarters").labels.map((l) => l.label);')
        self.assertEqual(names[:3], ["Oct 2024", "Dec", "Feb 2025"])  # type: ignore[index]
        self.assertIn("Feb 2027", names)  # type: ignore[operator]
        self.assertNotIn("Jan 2027", names)  # type: ignore[operator]

    def test_the_visible_range_follows_the_scroll(self) -> None:
        r = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return [timeline.visibleRange(w, w.openPx, 13 * 84), timeline.visibleRange(w, 0, 7 * 84)];')
        self.assertEqual(r, [{"first": "2026-09-28", "last": "2026-12-27"}, {"first": "2026-03-30", "last": "2026-05-17"}])

    def test_the_visible_range_names_the_day_cut_by_the_left_edge(self) -> None:
        r = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return timeline.visibleRange(w, w.openPx + 11, 13 * 84);')
        self.assertEqual(r["first"], "2026-09-28")  # type: ignore[index]

    def test_a_slip_runs_from_the_committed_date_to_today(self) -> None:
        lane = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); const l = timeline.laneOf({ ...api.funded[0].goals[0], started: "2026-09-01" }, w, "2026-10-23"); return { l, s: w.pos("2026-09-01"), d: w.pos("2026-10-01"), t: w.pos("2026-10-23") };')
        self.assertEqual(lane["l"]["slip"], {"from": lane["d"], "to": lane["t"], "days": 22, "over": False})  # type: ignore[index]
        self.assertEqual(lane["l"]["health"], {"from": lane["s"], "to": lane["d"]})  # type: ignore[index]
        self.assertEqual(lane["l"]["tick"]["date"]["kind"], "Committed")  # type: ignore[index]
        self.assertNotIn("ahead", lane["l"])  # type: ignore[operator]

    def test_a_goal_started_after_its_date_draws_health_under_the_slip(self) -> None:
        lane = run('const w = timeline.timelineWindow(api.funded, "2026-10-23", "weeks"); return { l: timeline.laneOf(api.funded[0].goals[0], w, "2026-10-23"), d: w.pos("2026-10-01"), t: w.pos("2026-10-23") };')
        self.assertEqual(lane["l"]["health"], {"from": lane["d"], "to": lane["t"]})  # type: ignore[index]
        self.assertTrue(lane["l"]["slip"]["over"])  # type: ignore[index]

    def test_a_label_stays_inside_what_is_on_screen(self) -> None:
        places = run('const v = { left: 1000, right: 1800 }; return [timeline.placeLabel(1200, 100, v), timeline.placeLabel(1750, 100, v), timeline.placeLabel(900, 100, v), timeline.placeLabel(1900, 100, v), timeline.placeLabel(1040, 900, v)];')
        self.assertEqual(places, ["right", "left", "before", "after", "right"])

    def lanes(self, marks: list, view: dict = {"left": 1000, "right": 1800}) -> dict:
        return run(f"return timeline.placeLaneLabels({json.dumps(marks)}, {json.dumps(view)});")  # type: ignore[return-value]

    def test_two_marks_past_one_edge_become_one_label(self) -> None:
        placed = self.lanes([{"key": "end", "atPx": 300, "text": "Fantasy Nov 30", "outside": None}, {"key": "tick", "atPx": 100, "text": "Promotion Milestone Nov 6", "outside": None}])
        self.assertEqual(placed, {"before": ["tick", "end"], "after": [], "inside": []})

    def test_marks_past_both_edges_give_one_label_each_side(self) -> None:
        placed = self.lanes([{"key": "tick", "atPx": 100, "text": "Committed Oct 1", "outside": None}, {"key": "end", "atPx": 2400, "text": "Fantasy Nov 30", "outside": "after"}])
        self.assertEqual(placed, {"before": ["tick"], "after": ["end"], "inside": []})

    def test_a_mark_under_an_edge_label_joins_it(self) -> None:
        # "Committed Oct 1" at the left edge takes 30 + 105 + 6 px, so a mark at 1050 would sit under it.
        placed = self.lanes([{"key": "tick", "atPx": 100, "text": "Committed Oct 1", "outside": None}, {"key": "end", "atPx": 1050, "text": "Fantasy Nov 30", "outside": None}])
        self.assertEqual(placed["before"], ["tick", "end"])

    def test_a_label_that_fits_neither_side_joins_the_edge_label(self) -> None:
        # A 250 px view: "Promotion Milestone Nov 6" (175 px) fits neither side of its mark at 1100, beside a right-edge label.
        placed = self.lanes([{"key": "tick", "atPx": 1100, "text": "Promotion Milestone Nov 6", "outside": None}, {"key": "end", "atPx": 1400, "text": "Fantasy Nov 30", "outside": None}], {"left": 1000, "right": 1250})
        self.assertEqual(placed, {"before": [], "after": ["tick", "end"], "inside": []})

    def test_labels_in_different_bands_never_join(self) -> None:
        # A tick's label sits above the bar and an uncommitted date's below it, so they cannot cover each other: each keeps its own edge label.
        placed = self.lanes([{"key": "tick", "atPx": 100, "text": "Committed Oct 1", "outside": None, "band": "above"}, {"key": "end", "atPx": 1050, "text": "Fantasy Nov 30", "outside": None, "band": "below"}])
        self.assertEqual(placed, {"before": ["tick"], "after": [], "inside": [{"key": "end", "side": "right"}]})

    def test_a_mark_on_screen_keeps_its_own_label(self) -> None:
        placed = self.lanes([{"key": "tick", "atPx": 1200, "text": "Committed Nov 15", "outside": None}, {"key": "end", "atPx": 1790, "text": "Fantasy Nov 30", "outside": None}])
        self.assertEqual(placed, {"before": [], "after": [], "inside": [{"key": "tick", "side": "right"}, {"key": "end", "side": "left"}]})

    def test_a_label_width_is_estimated_from_its_text(self) -> None:
        self.assertEqual(run('return [timeline.labelWidth("Committed Nov 15"), timeline.labelWidth("")];'), [16 * 7, 0])

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

    def test_it_opens_beside_its_icon_on_the_right(self) -> None:
        self.assertEqual(self.place({"left": 200, "top": 160, "right": 218, "bottom": 178}, 1440, 900), {"left": 226, "top": 152, "width": 300})

    def test_with_no_room_on_the_right_it_opens_on_the_left(self) -> None:
        self.assertEqual(self.place({"left": 1150, "top": 160, "right": 1168, "bottom": 178}, 1440, 900)["left"], 1150 - 8 - 300)
        self.assertEqual(self.place({"left": 1050, "top": 160, "right": 1068, "bottom": 178}, 1100, 900)["left"], 1050 - 8 - 300)

    def test_with_no_room_on_either_side_it_opens_below(self) -> None:
        self.assertEqual(self.place({"left": 300, "top": 160, "right": 318, "bottom": 178}, 320, 900), {"left": 16, "top": 186, "width": 288})

    def test_it_stays_inside_the_bottom_edge(self) -> None:
        self.assertEqual(self.place({"left": 600, "top": 820, "right": 618, "bottom": 838}, 1440, 900)["top"], 900 - 16 - 150)

    def test_a_card_help_opens_beside_its_card(self) -> None:
        card = {"left": 96, "top": 147, "right": 636, "bottom": 291}
        q = {"left": 247, "top": 166, "right": 265, "bottom": 184}
        self.assertEqual(run(f"return popover.placePopover({json.dumps(q)}, 300, {{ width: 1440, height: 900 }}, {json.dumps(card)});")["left"], 644)  # type: ignore[index]
        right = {"left": 1006, "top": 147, "right": 1344, "bottom": 291}
        self.assertEqual(run(f"return popover.placePopover({json.dumps(q)}, 176, {{ width: 1440, height: 900 }}, {json.dumps(right)});")["left"], 1006 - 8 - 300)  # type: ignore[index]
        phone = {"left": 16, "top": 500, "right": 374, "bottom": 640}
        self.assertEqual(run(f"return popover.placePopover({json.dumps(q)}, 176, {{ width: 390, height: 900 }}, {json.dumps(phone)});"), {"left": 74, "top": 648, "width": 300})

    def test_its_width_is_one_number(self) -> None:
        self.assertEqual(run("return [popover.popoverWidth(1440), popover.popoverWidth(320)];"), [300, 288])


class LabelTests(unittest.TestCase):
    def test_the_range_names_a_year_only_outside_the_current_one(self) -> None:
        labels = run('return [["2026-09-28", "2026-12-04"], ["2026-09-28", "2027-04-05"], ["2027-04-21", "2027-06-27"], ["2025-12-29", "2027-01-03"]].map(([a, b]) => labels.rangeLabel(a, b, "2026-10-23"));')
        self.assertEqual(labels, ["Sep 28 – Dec 4", "Sep 28, 2026 – Apr 5, 2027", "Apr 21 – Jun 27, 2027", "Dec 29, 2025 – Jan 3, 2027"])

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


class GoalPageTests(unittest.TestCase):
    def test_work_items_group_by_status_in_order(self) -> None:
        items = [{"id": "WI-0001", "status": "Completed"}, {"id": "WI-0002", "status": "In Progress"}, {"id": "WI-0003", "status": "Backlog"}, {"id": "WI-0004", "status": "In Progress"}, {"id": "WI-0009", "status": "Deleted"}]
        groups = run(f'return goalpage.groupWorkItems({json.dumps(items)}).map((g) => [g.status, g.items.map((i) => i.id)]);')
        self.assertEqual(groups, [["In Progress", ["WI-0002", "WI-0004"]], ["Backlog", ["WI-0003"]], ["Completed", ["WI-0001"]]])

    def test_history_filters_by_kind_of_change(self) -> None:
        fields = ["summary", "due_date", "date_type", "changed_due_date", "health", "path_to_green", "state", "comment", "owner"]
        counts = run(f'const e = {json.dumps([{"field": f} for f in fields])}; return ["All", "Dates", "Health", "State", "Comments"].map((f) => goalpage.filterEvents(e, f).length);')
        self.assertEqual(counts, [9, 3, 2, 1, 1])

    def test_an_event_value_reads_as_words(self) -> None:
        values = run('return [goalpage.eventValue(null), goalpage.eventValue("GREEN"), goalpage.eventValue(3), goalpage.eventValue({ steps: [1, 2], criteria: "x" }), goalpage.eventValue([{ repo: "github.com/tig/goalie" }])];')
        self.assertEqual(values, ["None", "GREEN", "3", "Path to Green, 2 steps", "github.com/tig/goalie"])

    def test_a_field_reads_as_its_spec_words(self) -> None:
        self.assertEqual(run('return ["due_date", "date_type", "path_to_green", "original_committed_date", "comment", "status"].map(goalpage.fieldLabel);'), ["Due Date", "Date Type", "Path to Green", "Original Committed Date", "Comment", "Status"])

    def test_an_actor_field_reads_as_the_name(self) -> None:
        self.assertEqual(run('return goalpage.eventValue("tig", "owner", { actors: page("XW-0003").actors });'), "Tig")

    def test_the_date_bar_spans_start_today_and_every_date(self) -> None:
        bar = run('return goalpage.dateBar("2026-10-23", "2026-10-23", [{ date: "2026-11-06", kind: "Promotion Milestone" }, { date: "2026-11-30", kind: "Fantasy" }]);')
        self.assertEqual(bar["start"], 0)  # type: ignore[index]
        self.assertEqual(bar["today"], 0)  # type: ignore[index]
        self.assertEqual([round(m["at"]) for m in bar["marks"]], [37, 100])  # type: ignore[index]

    def test_date_bar_labels_that_would_touch_drop_to_a_second_row(self) -> None:
        labels = '[{ at: 0, text: "In Progress since Oct 24", align: "start" }, { at: 37, text: "Nov 6", align: "center" }, { at: 100, text: "Nov 30", align: "end" }]'
        self.assertEqual(run(f"return goalpage.labelRows({labels}, 310);"), [0, 1, 0])  # a phone
        self.assertEqual(run(f"return goalpage.labelRows({labels}, 990);"), [0, 0, 0])  # 1440

    def test_a_date_before_the_start_widens_the_bar(self) -> None:
        bar = run('return goalpage.dateBar("2026-10-23", "2026-10-23", [{ date: "2026-10-01", kind: "Committed" }]);')
        self.assertEqual((bar["marks"][0]["at"], bar["start"], bar["today"]), (0, 100, 100))  # type: ignore[index]

    def test_events_of_one_write_group_into_one_row(self) -> None:
        events = [
            {"sequence": 5, "timestamp": "t2", "actor": "tig", "field": "comment", "reason": "Hi", "entity": "XW-0003"},
            {"sequence": 4, "timestamp": "t1", "actor": "chelsea", "field": "health", "old": "GREEN", "reason": "Late", "entity": "XW-0003"},
            {"sequence": 3, "timestamp": "t1", "actor": "chelsea", "field": "path_to_green", "reason": "Late", "entity": "XW-0003"},
            {"sequence": 2, "timestamp": "t0", "actor": "chelsea", "field": "summary", "old": None, "reason": "Seeded", "entity": "XW-0003"},
            {"sequence": 1, "timestamp": "t0", "actor": "chelsea", "field": "owner", "old": None, "reason": "Seeded", "entity": "XW-0003"},
        ]
        rows = run(f"return goalpage.groupEvents({json.dumps(events)}).map((g) => [g.events.map((e) => e.sequence), g.created]);")
        self.assertEqual(rows, [[[5], False], [[4, 3], False], [[2, 1], True]])

    def test_an_in_progress_create_is_still_one_created_row(self) -> None:
        events = [
            {"sequence": 3, "timestamp": "t0", "actor": "chelsea", "field": "state", "old": "Backlog", "new": "In Progress", "reason": "New goal", "entity": "XW-0013"},
            {"sequence": 2, "timestamp": "t0", "actor": "chelsea", "field": "summary", "old": None, "new": "Ship it", "reason": "New goal", "entity": "XW-0013"},
            {"sequence": 1, "timestamp": "t0", "actor": "chelsea", "field": "owner", "old": None, "new": "chelsea", "reason": "New goal", "entity": "XW-0013"},
        ]
        self.assertEqual(run(f"return goalpage.groupEvents({json.dumps(events)}).map((g) => [g.events.length, g.created]);"), [[3, True]])

    def test_a_created_row_lists_each_field_once_at_its_final_value(self) -> None:
        events = [
            {"sequence": 3, "entity": "XW-0013", "field": "state", "old": "Backlog", "new": "In Progress"},
            {"sequence": 2, "entity": "XW-0013", "field": "summary", "old": None, "new": "Ship it"},
            {"sequence": 1, "entity": "XW-0013", "field": "state", "old": None, "new": "Backlog"},
        ]
        self.assertEqual(run(f"return goalpage.createdFields({json.dumps(events)}).map((e) => [e.field, e.new]);"), [["state", "In Progress"], ["summary", "Ship it"]])

    def test_a_created_row_lists_this_goal_before_the_others(self) -> None:
        events = [
            {"sequence": 3, "entity": "XW-0014", "field": "health", "old": None, "new": "GREEN"},
            {"sequence": 2, "entity": "XW-0015", "field": "summary", "old": None, "new": "Ship it"},
            {"sequence": 1, "entity": "XW-0014", "field": "summary", "old": None, "new": "Commit"},
        ]
        self.assertEqual(run(f"return goalpage.createdFields({json.dumps(events)}, 'XW-0015').map((e) => e.sequence);"), [2, 3, 1])

    def test_a_promote_is_one_row_naming_the_milestone_it_completed(self) -> None:
        w = {"timestamp": "t1", "actor": "chelsea", "reason": "Met"}
        events = [
            {**w, "sequence": 9, "entity": "XW-0013", "field": "promotion_milestone", "old": "XW-0012", "new": None},
            {**w, "sequence": 8, "entity": "XW-0013", "field": "date_type", "old": "Ambition", "new": "Committed"},
            {**w, "sequence": 7, "entity": "XW-0012", "field": "state", "old": "In Progress", "new": "Completed"},
            {**w, "sequence": 6, "entity": "XW-0012", "field": "health", "old": None, "new": "GREEN"},
            {**w, "sequence": 5, "entity": "XW-0012", "field": "state", "old": "Backlog", "new": "In Progress"},
            {"sequence": 4, "timestamp": "t0", "actor": "chelsea", "reason": "New goal", "entity": "XW-0013", "field": "summary", "old": None, "new": "Ship it"},
        ]
        rows = run(f"return goalpage.groupEvents({json.dumps(events)}).map((g) => [g.events.length, g.promoted]);")
        self.assertEqual(rows, [[5, {"milestone": "XW-0012"}], [1, None]])

    def test_a_former_milestone_is_named_by_its_latest_summary(self) -> None:
        events = [
            {"sequence": 3, "entity": "XW-0012", "field": "summary", "old": "Commit", "new": "Commit a date"},
            {"sequence": 2, "entity": "XW-0013", "field": "summary", "old": None, "new": "Ship it"},
            {"sequence": 1, "entity": "XW-0012", "field": "summary", "old": None, "new": "Commit"},
        ]
        self.assertEqual(run(f"return goalpage.historyNames({json.dumps(events)});"), {"XW-0012": "Commit a date", "XW-0013": "Ship it"})

    def test_the_read_only_line_reads_as_g25(self) -> None:
        cases = [(["Chelsea"], False), (["Chelsea", "Tig"], False), (["Chelsea", "Tig", "Ann"], False), (["Chelsea", "Tig", "Ann"], True)]
        self.assertEqual(run(f"return {json.dumps(cases)}.map(([n, m]) => goalpage.changeLine(n, m));"), [
            "Chelsea can change this goal. You can comment.",
            "Chelsea and Tig can change this goal. You can comment.",
            "Chelsea, Tig, and Ann can change this goal. You can comment.",
            "Chelsea, Tig, Ann, or an owner of a goal above it can change this goal. You can comment.",
        ])

    def test_a_promote_that_makes_the_next_milestone_is_promoted_not_created(self) -> None:
        w = {"timestamp": "t1", "actor": "chelsea", "reason": "Plan drafted"}
        events = [
            {**w, "sequence": 6, "entity": "XW-0003", "field": "promotion_milestone", "old": "XW-0004", "new": "XW-0021"},
            {**w, "sequence": 5, "entity": "XW-0003", "field": "date_type", "old": "Fantasy", "new": "Ambition"},
            {**w, "sequence": 4, "entity": "XW-0021", "field": "summary", "old": None, "new": "Commit"},
            {**w, "sequence": 3, "entity": "XW-0004", "field": "state", "old": "In Progress", "new": "Completed"},
        ]
        self.assertEqual(run(f"return goalpage.groupEvents({json.dumps(events)}).map((g) => [g.created, g.promoted]);"), [[False, {"milestone": "XW-0004"}]])

    def test_a_value_reads_as_names_and_dates(self) -> None:
        ctx = {"actors": {"tig": {"name": "Tig"}}, "names": {"PRI-3": "Priority 3 Run Excaliwire on GOALIE", "excaliwire": "Excaliwire"}}
        v = run(f'const c = {json.dumps(ctx)}; return [goalpage.eventValue("2026-11-30", "due_date", c), goalpage.eventValue("PRI-3", "priority", c), goalpage.eventValue("excaliwire", "org_unit", c), goalpage.eventValue("tig", "owner", c), goalpage.eventValue("organization-wide", "visibility", c)];')
        self.assertEqual(v, ["Nov 30, 2026", "Priority 3 Run Excaliwire on GOALIE", "Excaliwire", "Tig", "Organization-wide"])

    def test_the_team_view_groups_by_owner_then_status(self) -> None:
        items = [{"id": "WI-1", "owner": "qa", "status": "Backlog"}, {"id": "WI-2", "owner": "chelsea", "status": "In Progress"}, {"id": "WI-3", "owner": "qa", "status": "In Progress"}, {"id": "WI-4", "owner": "qa", "status": "Deleted"}]
        actors = {"qa": {"id": "qa", "name": "QA", "kind": "agent"}, "chelsea": {"id": "chelsea", "name": "Chelsea", "kind": "human"}}
        q = run(f"return goalpage.queues({json.dumps(items)}, {json.dumps(actors)}, 'chelsea').map((q) => [q.owner.id, q.groups.map((g) => [g.status, g.items.map((i) => i.id)])]);")
        self.assertEqual(q, [["chelsea", [["In Progress", ["WI-2"]]]], ["qa", [["In Progress", ["WI-3"]], ["Backlog", ["WI-1"]]]]])

    def test_the_queue_order_holds_from_page_load(self) -> None:
        self.assertEqual(run('return [goalpage.keepOrder(null, ["bob", "ann"]), goalpage.keepOrder(["bob", "ann"], ["ann", "cat", "bob"])];'), [["bob", "ann"], ["bob", "ann", "cat"]])

    def test_people_with_work_in_progress_come_first(self) -> None:
        items = [{"id": "1", "owner": "ann", "status": "Completed"}, {"id": "2", "owner": "bob", "status": "In Progress"}, {"id": "3", "owner": "me", "status": "Backlog"}, {"id": "4", "owner": "cat", "status": "In Progress"}]
        actors = {k: {"id": k, "name": k.title(), "kind": "human"} for k in ("ann", "bob", "cat", "me")}
        self.assertEqual(run(f"return goalpage.queues({json.dumps(items)}, {json.dumps(actors)}, 'me').map((q) => q.owner.id);"), ["bob", "cat", "me", "ann"])

    def test_comments_are_the_comment_events(self) -> None:
        events = [{"field": "comment", "actor": "tig"}, {"field": "health", "actor": "chelsea"}, {"field": "comment", "actor": "chelsea"}]
        self.assertEqual(run(f'return goalpage.comments({json.dumps(events)}).map((e) => e.actor);'), ["tig", "chelsea"])


class CommandTests(unittest.TestCase):
    """Each goal-page panel saves one CommandsRequest (docs/engineering/goal-page-and-create.md, Edits from the goal page)."""

    def test_health_with_a_path_to_green_is_one_update(self) -> None:
        b = run('const g = page("XW-0003").goal; return commands.healthBatch(g, "YELLOW", { steps: [{ text: "Load the tree", owner: "chelsea", date: "2026-10-30" }], criteria: "Tree loaded", trigger: "Not loaded by Nov 2" }, "Seed is late");')
        self.assertEqual(b, {"commands": [{"op": "update", "kind": "goal", "id": "XW-0003", "base_version": 1, "fields": {"health": "YELLOW", "path_to_green": {"steps": [{"text": "Load the tree", "owner": "chelsea", "date": "2026-10-30"}], "criteria": "Tree loaded", "trigger": "Not loaded by Nov 2"}}, "reason": "Seed is late"}]})

    def test_back_to_green_drops_the_path_to_green(self) -> None:
        b = run('return commands.healthBatch(page("XW-0001").goal, "GREEN", null, "Done");')
        self.assertEqual(b["commands"][0]["fields"], {"health": "GREEN", "path_to_green": None})  # type: ignore[index]

    def test_a_slip_sets_the_changed_due_date_with_health(self) -> None:
        b = run('const g = page("XW-0001").goal; return commands.slipBatch(g, "2026-11-20", "RED", g.path_to_green, "Canon slipped");')
        self.assertEqual(sorted(b["commands"][0]["fields"]), ["changed_due_date", "health", "path_to_green"])  # type: ignore[index]
        self.assertEqual(b["commands"][0]["fields"]["changed_due_date"], "2026-11-20")  # type: ignore[index]

    def test_promoting_fantasy_makes_a_new_milestone_first(self) -> None:
        b = run('const g = page("XW-0003").goal; return commands.promoteToAmbition(g, { summary: "Commit a date for the launch", due_date: "2026-12-01", owner: "chelsea" }, "2026-12-15", "Plan is clearer", "Milestone (Commit)");')
        c = b["commands"]  # type: ignore[index]
        self.assertEqual([x["op"] for x in c], ["create", "update"])
        self.assertEqual((c[0]["ref"], c[0]["fields"]["type"], c[0]["fields"]["date_type"]), ("$m", "Milestone (Commit)", "Committed"))
        self.assertEqual(c[1]["fields"], {"date_type": "Ambition", "promotion_milestone": "$m", "due_date": "2026-12-15"})
        self.assertEqual(c[0]["fields"]["parent"], "XW-0003")  # Q18: the next milestone sits under its goal, as New goal's does

    def test_promoting_fantasy_completes_the_met_milestone_first(self) -> None:
        c = run('return commands.promoteToAmbition(page("XW-0003").goal, { summary: "Next", due_date: "2026-12-01", owner: "chelsea" }, "2026-11-30", "Met", "Milestone (Commit)", { id: "XW-0004", version: 2 }).commands;')
        self.assertEqual([(x["op"], x.get("ref") or x.get("id")) for x in c], [("update", "XW-0004"), ("create", "$m"), ("update", "XW-0003")])  # type: ignore[union-attr]
        self.assertEqual(c[0]["fields"], {"state": "Completed"})  # type: ignore[index]

    def test_promoting_ambition_to_committed_completes_the_milestone_first(self) -> None:
        b = run('const g = { ...page("XW-0003").goal, date_type: "Ambition" }; return commands.promoteToCommitted(g, { id: "XW-0004", version: 3 }, "2026-11-30", "At Pencil");')
        c = b["commands"]  # type: ignore[index]
        self.assertEqual((c[0]["id"], c[0]["base_version"], c[0]["fields"], c[0]["reason"]), ("XW-0004", 3, {"state": "Completed"}, "At Pencil"))
        self.assertEqual((c[1]["id"], c[1]["fields"]), ("XW-0003", {"date_type": "Committed", "promotion_milestone": None}))

    def test_humans_are_the_human_actors(self) -> None:
        self.assertEqual(run('return goalpage.humans({ a: { id: "a", name: "A", kind: "human" }, b: { id: "b", name: "B", kind: "agent" } }).map((x) => x.id);'), ["a"])

    def test_close_and_pursue_set_the_state(self) -> None:
        c = run('const g = page("XW-0003").goal; return [commands.closeBatch(g, "Did Not Meet", "Dropped").commands[0].fields, commands.pursueBatch({ ...g, state: "Backlog" }, "GREEN", "Starting").commands[0].fields];')
        self.assertEqual(c, [{"state": "Did Not Meet"}, {"state": "In Progress", "health": "GREEN"}])

    def test_fields_send_only_what_changed(self) -> None:
        b = run('const g = page("XW-0003").goal; return commands.fieldsBatch(g, { ...g, severity: "sev2", plan: g.plan }, "Lower");')
        self.assertEqual(b["commands"][0]["fields"], {"severity": "sev2"})  # type: ignore[index]

    def test_a_comment_is_one_comment_command(self) -> None:
        self.assertEqual(run('return commands.commentBatch("goal", "XW-0003", " Looks right. ");'), {"commands": [{"op": "comment", "kind": "goal", "id": "XW-0003", "text": "Looks right."}]})

    def test_a_sub_goal_on_its_parents_date_sends_no_date(self) -> None:
        b = run('return commands.subGoalBatch(page("XW-0003").goal, { summary: "Load the tree", owner: "chelsea" }, TYPES);')
        self.assertEqual(b, {"commands": [{"op": "create", "kind": "goal", "ref": "$s1", "fields": {"summary": "Load the tree", "owner": "chelsea", "parent": "XW-0003", "type": "Milestone (Launch)", "org_unit": "excaliwire", "level": "Company", "severity": "sev1", "origination": "New", "visibility": "organization-wide", "plan_maturity": "Crayon", "state": "Backlog"}, "reason": "Sub-goal of XW-0003"}]})

    def test_an_uncommitted_sub_goal_brings_its_own_milestone_in_the_create_order(self) -> None:
        b = run('return commands.subGoalBatch(page("XW-0004").goal, { summary: "Open a goal", owner: "chelsea", date: { due_date: "2026-12-01", date_type: "Ambition" }, milestone: { summary: "Commit a date for Open a goal", due_date: "2026-11-20", owner: "chelsea" } }, TYPES);')
        c = b["commands"]  # type: ignore[index]
        self.assertEqual([(x["op"], x.get("ref") or x.get("id")) for x in c], [("create", "$m1"), ("create", "$s1"), ("update", "$m1")])
        self.assertEqual(c[1]["fields"]["promotion_milestone"], "$m1")
        self.assertEqual((c[2]["base_version"], c[2]["fields"]), (1, {"parent": "$s1"}))

    def test_a_work_item_is_filed(self) -> None:
        b = run('return commands.workItemBatch("XW-0003", { title: "Draw the board", owner: "frontend-engineer", status: "In Progress", due_date: null });')
        self.assertEqual(b, {"commands": [{"op": "create", "kind": "work_item", "fields": {"goal": "XW-0003", "title": "Draw the board", "owner": "frontend-engineer", "status": "In Progress", "due_date": None}, "reason": "Filed"}]})

    def test_ticking_a_work_item_is_a_status_change_with_a_reason(self) -> None:
        b = run('return commands.workItemStatusBatch({ id: "WI-0001", version: 1 }, "Completed", "Shipped");')
        self.assertEqual(b, {"commands": [{"op": "update", "kind": "work_item", "id": "WI-0001", "base_version": 1, "fields": {"status": "Completed"}, "reason": "Shipped"}]})

    FORM = {
        "summary": "Launch the goal page", "description": "", "owner": "chelsea", "priority": "PRI-3",
        "due_date": "2027-02-28", "date_type": "Fantasy", "health": "GREEN", "path_to_green": None, "plan": None, "plan_maturity": "Watercolor",
        "more": {"type": "Milestone (Launch)", "severity": "sev2", "state": "In Progress", "origination": "New", "level": "Company", "visibility": "organization-wide", "org_unit": "excaliwire"},
        "milestone": {"summary": "Commit a date for Launch the goal page", "due_date": "2026-11-20", "owner": "chelsea"},
        "milestoneType": "Milestone (Commit)",
        "subGoals": [
            {"summary": "Draw the header", "owner": "chelsea"},
            {"summary": "Wire the panels", "owner": "tig", "date": {"due_date": "2027-01-15", "date_type": "Ambition"}, "milestone": {"summary": "Commit a date for Wire the panels", "due_date": "2026-12-01", "owner": "tig"}},
        ],
        "workItems": [{"title": "Sketch it", "goal": 1, "owner": "frontend-engineer", "due_date": None}],
    }

    def test_an_answer_with_a_reason_and_no_message_still_says_why(self) -> None:
        got = run('return [commands.commandsAnswer({ error: "forbidden", reason: "No verified actor." }), commands.commandsAnswer({ ok: true, ids: {} })];')
        self.assertEqual(got, [{"ok": False, "at": 0, "error": "bad_command", "message": "No verified actor."}, {"ok": True, "ids": {}}])

    def test_a_command_the_check_could_not_run_is_not_a_fix(self) -> None:
        answer = {"ok": False, "at": 0, "error": "invalid", "violations": [{"rule": "required-field", "message": "Summary is required.", "field": "summary"}],
                  "all": [{"rule": "required-field", "message": "Summary is required.", "field": "summary", "at": 0}, {"rule": "not-checked", "message": "not checked yet: it names $m, whose create was refused", "at": 1}]}
        got = run(f"const a = {json.dumps(answer)}; const b = commands.createBatch({json.dumps(self.FORM)}); return [commands.refusals(a, b).map((v) => v.rule), commands.notChecked(a)];")
        self.assertEqual(got, [["required-field"], 1])

    def test_a_save_says_what_happened_naming_the_new_key(self) -> None:
        ev = lambda kind, ent, field: {"entity_kind": kind, "entity": ent, "field": field, "old": None, "new": "x"}
        cases = [
            ("subgoal", {"ok": True, "ids": {"$s1": "XW-0020"}, "events": []}, {}),
            ("workitem", {"ok": True, "ids": {}, "events": [ev("work_item", "WI-0050", "title")]}, {}),
            ("promote", {"ok": True, "ids": {"$m": "XW-0021"}, "events": []}, {"to": "Ambition"}),
            ("promote", {"ok": True, "ids": {}, "events": []}, {"to": "Committed"}),
            ("close", {"ok": True, "ids": {}, "events": []}, {"state": "Completed Late"}),
            ("promote-close", {"ok": True, "ids": {}, "events": []}, {"state": "Completed"}),
            ("slip", {"ok": True, "ids": {}, "events": []}, {"date": "Dec 4, 2026"}),
        ]
        self.assertEqual(run(f"return {json.dumps(cases)}.map(([k, a, x]) => commands.savedStatus(k, a, x));"), [
            "Added XW-0020 under this goal.",
            "Added WI-0050 to this goal.",
            "Promoted to Ambition. XW-0021 is the next Promotion Milestone.",
            "Promoted to Committed.",
            "Closed as Completed Late.",
            "Promoted to Committed and closed as Completed.",
            "Recorded a slip to Dec 4, 2026.",
        ])

    def test_a_new_goal_is_sent_in_the_create_order(self) -> None:
        b = run(f"return commands.createBatch({json.dumps(self.FORM)});")
        steps = [(c["op"], c["kind"], c.get("ref") or c.get("id")) for c in b["commands"]]  # type: ignore[index]
        self.assertEqual(steps, [
            ("create", "goal", "$m"), ("create", "goal", "$m1"), ("create", "goal", "$goal"), ("update", "goal", "$m"), ("update", "goal", "$m"),
            ("create", "goal", "$s1"), ("create", "goal", "$s2"), ("update", "goal", "$m1"), ("create", "work_item", None),
        ])

    def test_a_new_promotion_milestone_is_pursued_with_the_goals_health(self) -> None:
        c = run(f"return commands.createBatch({json.dumps(self.FORM)}).commands;")
        self.assertEqual(c[0]["fields"]["state"], "Backlog")  # type: ignore[index]
        self.assertEqual((c[4]["base_version"], c[4]["fields"]), (2, {"state": "In Progress", "health": "GREEN"}))  # type: ignore[index]

    def test_each_create_names_its_refs(self) -> None:
        c = run(f"return commands.createBatch({json.dumps(self.FORM)}).commands;")
        goal, s1, s2, wi = c[2], c[5], c[6], c[8]  # type: ignore[index]
        self.assertEqual((goal["fields"]["promotion_milestone"], goal["fields"]["priority"], goal["fields"]["date_type"]), ("$m", "PRI-3", "Fantasy"))
        self.assertNotIn("due_date", s1["fields"])
        self.assertEqual((s1["fields"]["parent"], s2["fields"]["promotion_milestone"]), ("$goal", "$m1"))
        self.assertEqual((wi["fields"]["goal"], wi["reason"]), ("$s1", "Filed"))

    def test_a_committed_goal_has_no_milestone(self) -> None:
        form = {**self.FORM, "date_type": "Committed", "plan_maturity": "Pencil", "milestone": None, "subGoals": [], "workItems": []}
        c = run(f"return commands.createBatch({json.dumps(form)}).commands;")
        self.assertEqual([(x["op"], x.get("ref")) for x in c], [("create", "$goal")])  # type: ignore[union-attr]
        self.assertNotIn("promotion_milestone", c[0]["fields"])  # type: ignore[index]

    def test_a_refusal_points_back_to_its_part_of_the_form(self) -> None:
        places = run(f"const b = commands.createBatch({json.dumps(self.FORM)}); return b.commands.map((_, i) => commands.commandPlace(b, i));")
        self.assertEqual(places, ["milestone", "sub:1", "goal", "milestone", "milestone", "sub:0", "sub:1", "sub:1", "workitem:0"])

    def test_a_new_goal_under_a_parent_names_it(self) -> None:
        form = {**self.FORM, "parent": "XW-0003", "subGoals": [], "workItems": []}
        self.assertEqual(run(f"return commands.createBatch({json.dumps(form)}).commands.find((c) => c.ref === '$goal').fields.parent;"), "XW-0003")

    def test_a_new_goal_under_a_parent_takes_the_parents_date(self) -> None:
        form = {**self.FORM, "parent": "XW-0004", "subGoals": [], "workItems": []}
        c = run(f"return commands.createBatch({json.dumps(form)}).commands;")
        self.assertEqual([(x["op"], x.get("ref")) for x in c], [("create", "$goal")])  # type: ignore[union-attr]
        fields = c[0]["fields"]  # type: ignore[index]
        self.assertEqual([k for k in ("due_date", "date_type", "priority", "promotion_milestone") if k in fields], [])
        self.assertEqual(fields["parent"], "XW-0004")

    def test_every_create_carries_the_required_fields(self) -> None:
        c = run(f"return commands.createBatch({json.dumps(self.FORM)}).commands.filter((x) => x.op === 'create' && x.kind === 'goal');")
        for x in c:  # type: ignore[union-attr]
            self.assertTrue({"severity", "state", "origination", "plan_maturity", "type"} <= set(x["fields"]), x["ref"])

    def test_the_check_asks_the_server_to_roll_back(self) -> None:
        self.assertTrue(run(f"return commands.createBatch({json.dumps(self.FORM)}, true).check;"))

    def test_a_stale_save_keeps_the_typed_values_beside_the_current_ones(self) -> None:
        m = run('const g = page("XW-0003").goal; return commands.staleMerge({ severity: "sev2", health: "YELLOW" }, { ...g, version: 4, severity: "sev3" });')
        self.assertEqual(m, {"base_version": 4, "current": {"severity": "sev3", "health": "GREEN"}})


class RouteTests(unittest.TestCase):
    def test_each_path_opens_its_page(self) -> None:
        pages = run('return ["/", "/goals/XW-0003", "/goals/new", "/goals/new?parent=XW-0003", "/goals/xw-0003/", "/nowhere"].map((p) => { const u = new URL(p, "http://x"); return route.parseRoute(u.pathname, u.search); });')
        self.assertEqual(pages, [{"page": "home"}, {"page": "goal", "key": "XW-0003"}, {"page": "new"}, {"page": "new", "parent": "XW-0003"}, {"page": "goal", "key": "XW-0003"}, {"page": "home"}])

    def test_the_work_page_opens_one_queue_or_every_queue(self) -> None:
        pages = run('return ["/work", "/work?owner=frontend-engineer", "/work/"].map((p) => { const u = new URL(p, "http://x"); return route.parseRoute(u.pathname, u.search); });')
        self.assertEqual(pages, [{"page": "work"}, {"page": "work", "owner": "frontend-engineer"}, {"page": "work"}])
        self.assertEqual(run('return [route.workPath(), route.workPath("qa")];'), ["/work", "/work?owner=qa"])

    def test_a_goal_link_and_the_back_link(self) -> None:
        self.assertEqual(run('return [route.goalPath("XW-0003"), route.newGoalPath(), route.newGoalPath("XW-0003"), route.backPath("?view=list&health=RED"), route.backPath("")];'), ["/goals/XW-0003", "/goals/new", "/goals/new?parent=XW-0003", "/?view=list&health=RED", "/"])



class NewGoalV2Tests(unittest.TestCase):
    """New goal v2 (design NF1 to NF18): the To save list, Create will make, and the closed Details line."""

    BASE = {"summary": "", "owner": "chelsea", "due_date": "", "date_type": "", "milestone": None, "subGoals": [], "workItems": []}

    def lines(self, form: dict, answer: object = None, details: bool = False) -> object:
        return run(f"return newgoal.toSave({json.dumps({**self.BASE, **form})}, {json.dumps(answer)}, {json.dumps(details)}).map((l) => [l.key, l.text, l.done]);")

    def test_an_empty_form_lists_the_foundation_with_nothing_done(self) -> None:
        self.assertEqual(self.lines({}), [["summary", "Summary", False], ["due_date", "Date", False], ["date_type", "Date Type", False]])

    def test_an_uncommitted_date_adds_the_milestone_date_and_a_committed_one_the_plan(self) -> None:
        fantasy = self.lines({"summary": "Ship it", "due_date": "2027-02-26", "date_type": "Fantasy", "milestone": {"summary": "Commit", "due_date": "", "owner": "chelsea"}})
        self.assertEqual(fantasy, [["summary", "Summary", True], ["due_date", "Date", True], ["date_type", "Date Type", True], ["milestone_date", "Promotion Milestone date", False]])
        committed = self.lines({"summary": "Ship it", "due_date": "2027-02-26", "date_type": "Committed"}, {"ok": True, "ids": {}, "events": []})
        self.assertEqual(committed[-1], ["plan_maturity", "Plan at Pencil", True])

    def test_a_refusal_undoes_its_line_in_plain_words_and_details_wait_until_opened(self) -> None:
        answer = {"ok": False, "at": 0, "error": "invalid", "violations": [], "all": [
            {"rule": "committed-needs-pencil", "message": "XW-0012: a Committed date needs a Plan at Pencil.", "field": "plan_maturity", "at": 0},
            {"rule": "health-while-in-progress", "message": "An In Progress goal needs a health: GREEN, YELLOW, or RED.", "field": "health", "at": 0},
            {"rule": "not-checked", "message": "not checked yet: it names $m", "at": 1},
        ]}
        form = {"summary": "Ship it", "due_date": "2027-02-26", "date_type": "Committed"}
        self.assertEqual(self.lines(form, answer)[-1], ["plan_maturity", "Plan at Pencil", False])
        self.assertNotIn("health", [l[0] for l in self.lines(form, answer)])  # type: ignore[union-attr]
        self.assertEqual(self.lines(form, answer, True)[-1], ["health", "Health", False])
        said = run(f"return newgoal.toSave({json.dumps({**self.BASE, **form})}, {json.dumps(answer)}, false).map((l) => l.sentence);")
        self.assertEqual(said[-1], "A Committed date needs a plan at Pencil.")  # type: ignore[index]

    def test_create_will_make_names_what_without_keys(self) -> None:
        form = {**self.BASE, "date_type": "Fantasy", "subGoals": [{"summary": "a", "owner": "chelsea"}, {"summary": "b", "owner": "chelsea"}], "workItems": [{"title": "t", "goal": 0, "owner": "chelsea", "due_date": None}]}
        self.assertEqual(run(f"return newgoal.makes({json.dumps(form)});"), "This goal · its Promotion Milestone · 2 sub-goals · 1 work item")
        self.assertEqual(run(f"return newgoal.makes({json.dumps({**self.BASE, 'date_type': 'Committed'})});"), "This goal")

    def test_closed_details_show_five_values_then_how_many_more(self) -> None:
        rows = [["Description", "None"], ["State", "Backlog"], ["Type", "Milestone (Launch)"], ["Severity", "sev2"], ["Origination", "New"], ["Visibility", "Organization-wide"], ["Work Product", "None"]]
        self.assertEqual(run(f"return newgoal.detailsLine({json.dumps(rows)});"), "Description · None   State · Backlog   Type · Milestone (Launch)   Severity · sev2   Origination · New   and 2 more")


if __name__ == "__main__":
    unittest.main()
