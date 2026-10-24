# Home toolbar and List

**Status:** Proposed, for Chelsea (gate B)

**Date:** 2026-10-23

**Owner:** Chelsea

This is the design for one toolbar on every Home view, and a compact List.
Size: Small feature. No new data, no new API, no new SPEC.md words.
The canvas boards are "Home toolbar and List" and "Home toolbar and List, phone" on the [v1 canvas](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk). The desktop board is interactive: switch views and click a health count.
The rules it changes are in [Rule changes](#rule-changes). They land in [interaction-rules.md](interaction-rules.md) in the same pull request as the screen.

## Why

Chelsea: "I absolutely hate the nav bar in list and calendar views. I think for all of them we always need the search bar, toggles. I want a clean and modern compact list."
At 973b8ca the board header has three 36 px pills and a button, spread across the row. In the List, the zoom pill and the date pill are hidden but keep their place, so the view pill floats alone in the middle. In the Calendar, a gap sits where the zoom pill was.
The search box sits on a second line, in the goal column, so it is part of the Timeline and not of the board.
The List is the Timeline's tree with columns added. Rows are 48 to 52 px, titles wrap to two lines, and the health shows twice on each row.

## Toolbar

One row, 44 px tall, at the top of the board card. Its left and right edges are the board's content edges (20 px inside the card).
Two clusters. The left cluster is anchored left. The right cluster is anchored right. The space between them stretches.
Every control is 32 px tall. On a touch screen every control answers a 44 px tap. The tap area must not be clipped by a parent.

```
1440, Timeline
| Priorities  (Timeline|List|Calendar)  (Q Search goals      )  ............  (- +) (< Sep 28 - Dec 4 >) (Today) |
1440, List
| Priorities  (Timeline|List|Calendar)  (Q Search goals      )  ............                                       |
1440, Calendar
| Priorities  (Timeline|List|Calendar)  (Q Search goals      )  ............        (<  November 2026  >) (Today) |
1440, any view, a health filter in force
| Priorities  (Timeline|List|Calendar)  (Q [# RED x] Search  )  ............  ...                                  |
```

### Left cluster, in order

1. **Priorities**, the view's name: 16 px, 800 weight. 16 px after it.
2. **View tabs:** a 32 px track in `--control`, 3 px inside padding, full round. Each tab is 26 px tall, 12 px side padding, 13 px 700 weight, `--mute` text. The tab in force is a `--card` pill with a 1 px soft shadow and `--brand-ink` text. On a phone the tabs are List and Calendar.
3. **Search box:** 240 px wide, 32 px tall, full round, 1 px `--cut` border, a 14 px search icon, "Search goals". It is 200 px when the board's content is under 1040 px wide. It matches goal summaries as you type, in every view.
4. **The health filter** sits inside the search box, before the text: a 22 px pill in the health's `-bg` token, with its shape, its word in the health's `-ink` token, and an x. The x is **Show all** (its accessible name). Clicking the health count again also shows all. The box keeps its width, so nothing moves when a filter starts or ends.

### Right cluster, in order

1. **Zoom:** one 32 px group of two 30 px buttons, − and +. Timeline only. At the closest or farthest level its button is grayed and does nothing.
2. **Date range:** one 32 px group: Earlier (‹), a label, Later (›). The label is 184 px wide, centered, tabular numbers. It is the same width in every view, so it does not move when the view changes. Timeline: the days on screen. Calendar: the month.
3. **Today:** a 32 px button, 12 px side padding, 1 px `--cut` border.

### What each view draws

| View | Left cluster | Right cluster |
| --- | --- | --- |
| Timeline | all | zoom, date range, Today |
| List | all | nothing |
| Calendar | all | date range, Today |

A control that does not apply is not drawn. The right cluster is anchored right, so the date range and Today keep their place between Timeline and Calendar. The left cluster never moves.
The page keeps a fixed scrollbar gutter (`scrollbar-gutter: stable`), so a view that makes the page taller does not move the toolbar.
I measured this on the canvas board at 1440: the tabs, the search box, the date range, and Today keep the same x in Timeline, List, Calendar, and with a filter in force.

### When one row does not fit

The row needs 943 px of board content (measured on the canvas at 1440), or 903 px with the 200 px search box. Below that, and above the phone width, the search box moves to a second row, full width, and the first row keeps Priorities, the tabs, and the right cluster.
At 1100 px the row fits: the board content is 996 px.

### What leaves the board

The filter line beside the Priorities heading is replaced by the chip in the search box.
The search box leaves the Timeline's goal column. That cell now titles the goal column: **Priority** at the left, **Owner** over the avatars, the same titles as the List. It stays on the same line as the week labels.
The legend sits in the board's footer, right-aligned, in the Timeline and the Calendar. The Calendar's legend moves there from beside the search box. The List has no legend: it writes its words.

## List

Clean and compact, in the pastel look. One header, one grid, one row per goal.

### Column grid

At 1440 the board content is 1208 px. Column gap 12 px.

| Column | Width | Holds |
| --- | --- | --- |
| Rank | 28 px | The Priority rank, muted, right-aligned. Titled **Priority** with the next column. |
| Priority | 1fr, at least 240 px | The tree: guide lines, the title (one line, a second only when it needs one), the open and close count at the right end. |
| Owner | 48 px | The 24 px avatar, centered. |
| Health | 96 px | The health shape and its word, 12 px 800 weight, in the health's `-ink` token. A goal with no health: the hollow circle. |
| Date Type | 192 px | The goal's own date with its Date Type: "Committed Oct 1". A slip follows in `--red-ink`: "· slip 23 days". An undated sub-goal writes its parent's date, muted. |
| Promotion Milestone | 156 px | The Promotion Milestone's date only: "Nov 6". The column title names it, so the cell does not repeat it. |
| Path to Green (PTG) | 0.6fr, at least 160 px | The PTG text and its owner, muted, on one line. A RED or YELLOW goal with none: "No Path to Green", muted. |

At 1100 the same grid fits (Priority about 244 px, PTG 160 px).
The date health is judged on is in `--ink`. The other date is in `--mute`. For goal 3 that is Promotion Milestone "Nov 6" dark and "Fantasy Nov 30" light (review X8).
Only the title wraps, to two lines at most. Every other cell is one line; a cell that is too long ends in an ellipsis. A date never breaks (rule 14).

### Rows

| Part | Size |
| --- | --- |
| Header | 32 px. 11 px 800 weight, uppercase, 0.06 em tracking, `--mute`. A 1 px `--line` under it. It stays at the top of the board while the page scrolls under the top bar. |
| Top-level goal | 40 px for a one-line title; 49 px for two lines. Title 14 px 700, 18 px line height. A 1 px `--line` above it. |
| Sub-goal | 36 px for one line; 44 px for two. Title 13.5 px 600, then 13 px 500 a level down. No line above it. Indent 26 px a level, with the guide line (rule 16). |
| Cut line | 28 px, "✂ Backlog", dashed `--cut` (unchanged). |

A row turns `--hover` under the pointer. A highlighted or selected goal keeps rule H1: `--hover` and a 3 px bar of its health color on the left edge of the row.
The count chip is 22 px, `--control`, at the right end of the Priority cell. It opens and closes the goal (rule 19).
The health shows once on each row, in the Health column. The Priority cell has no health shape in the List.

### States

| State | What shows |
| --- | --- |
| Loading | The header and 5 skeleton rows of 40 px (rule L1). |
| Filtered | The matching goals, and their parents dimmed to 50% (rule 26). The filter chip in the search box. |
| No match | One 40 px row: "No goals match." (rule 27). |
| Nothing below the cut line | "No Priorities below the cut line." (unchanged). |
| Error | Unchanged. |

### Phone

```
390, List                                390, Calendar
| Excaliwire                       |     | Excaliwire                       |
| # 1 RED  ^ 1 YELLOW  o 1 GREEN   |     | # 1 RED  ^ 1 YELLOW  o 1 GREEN   |
| Priorities       (List|Calendar) |     | Priorities       (List|Calendar) |
| (Q Search goals               )  |     | (Q Search goals               )  |
| 1 Regenerate the E28 canon   (T) |     | (<  November 2026  >)   (Today)  |
|   # RED · Committed Oct 1 · slip |     | Fri Nov 6                        |
|   Placeholder: Tig writes ...    |     | (o Tig, Chelsea, and agents  ◆)  |
```

Row 1: Priorities and the tabs. Row 2: the search box, full width, 40 px. The Calendar adds row 3: the date range and Today, 40 px.
Each goal: rank, the title (up to 3 lines), the count, the owner. Under it: the health shape and word first, then the dates. Then the PTG.
Every title starts at the same x, because the health word is on the date line and not beside the title (my round 2 check: titles started at 170, 208, and 195 px).

## Rule changes

These replace the rule of the same number in [interaction-rules.md](interaction-rules.md).

- **10.** Health is a mark of its color and its own shape on every screen, so color is not the only cue: GREEN a circle, YELLOW a triangle, RED a square. Each fits the same 10 px box. A diamond is only a Promotion Milestone (rule 23a). In the List the mark and the word are the Health column. On a phone the word follows the mark at the start of the row's date line. No health pills.
- **17.** Each level down is lighter: 14 px bold, then 13.5 px semibold, then 13 px. A title shows two lines at most on a desktop, and three on a phone. In the List it takes a second line only when it needs one.
- **19a.** Every row has the same columns, left to right: rank, health mark, title, count, owner. In the List the health mark moves to the Health column. The count sits before the owner. A row with no count keeps the empty slot, so every owner avatar lines up.
- **21a.** Zoom out and zoom in are one group of two buttons, − and +, first in the toolbar's right cluster. There are three levels (weeks, months, quarters, as now). At the closest or farthest level its button is grayed and does nothing.
- **25.** The search box is in the toolbar's left cluster, after the view tabs, in every view: 240 px wide, 200 px when the board's content is under 1040 px. It matches goal summaries as you type.
- **25a.** The health filter in force is a chip at the start of the search box, with its shape, its word, and an x. The x is **Show all**. The box keeps its width.
- **25b.** The toolbar is one 44 px row: Priorities, the view tabs, and the search box anchored left; zoom, the date range, and Today anchored right. Every control is 32 px tall. The date range is Earlier, a 184 px label, and Later, in one group.
- **25c.** No control moves when a label changes or the view changes. The date range label is as wide as its longest form in every view, in tabular numbers, centered. A control that does not apply is not drawn, and the right cluster is anchored right, so the rest keep their place. The page keeps a fixed scrollbar gutter.
- **25d.** The Timeline's goal column header, on the line of the week labels, titles the column: Priority at the left and Owner over the avatars, as in the List.
- **29.** On a touch screen every control answers a 44 px tap, even when it draws smaller. A parent must not clip the tap area.
- **V1.** The view tabs follow Priorities in the toolbar: Timeline, List, Calendar on a desktop; List and Calendar on a phone. The view in force is a raised white tab on a `--control` track. All views draw the same goals with the same filter and search.
- **V2.** The List is one grid: rank, Priority (the tree), Owner, Health, Date Type, Promotion Milestone, Path to Green (PTG), titled once in a 32 px header that stays on screen. A top-level row is 40 px and a sub-goal row 36 px; a title that needs a second line makes its row taller. Only the title wraps; any other long cell ends in an ellipsis. The Date Type cell writes the goal's own date. The Promotion Milestone cell writes only its date. The date health is judged on is dark and the other light. A RED or YELLOW goal with no Path to Green says "No Path to Green".
- **V4.** The Timeline draws zoom, the date range, and Today. The Calendar draws the date range, which names the month, and Today; Earlier and Later move one month. The List draws no time control. The legend is in the board footer in the Timeline and the Calendar.
- **34.** On a phone the toolbar takes two rows: Priorities and the view tabs, then the search box, full width, 40 px. The Calendar adds a third row: the date range and Today.

## Decisions for Chelsea

1. **YELLOW becomes a triangle.** Today YELLOW and a Promotion Milestone are both diamonds, side by side on the timeline and in the Calendar. Recommend: the triangle. It reads as a warning, and the diamond keeps one meaning.
2. **Titles in the List take a second line only when they need one.** Recommend: yes. One line per title, as in Linear, cuts 2 of 6 titles at 1440 and 5 of 6 at 1100 (measured on the canvas), and the goal page that would show the whole title is not built yet. With two lines, no title is cut at 1440, and rows are 40 px, or 49 px when a title takes two lines.
3. **Health once per row in the List, in its own column.** Recommend: yes. Today the List shows the shape before the title and the word in the Health column.
4. **The right side of the List's toolbar stays empty.** Recommend: yes. Nothing fills it, and the left cluster stays where it is in every view.

## Words for Tig

None new. Every label here is in SPEC.md §4 or §8.2, or already in interaction-rules.md (Show all, Search goals, No goals match). Timeline, List, and Calendar are still waiting on Tig as T2.

## Not checked

I have not built this in the app. The canvas boards are stand-ins: the Timeline and the Calendar on them are simplified.
I measured the toolbar positions, the row heights, and the cut titles on the canvas at 1440 and 1100. I have not drawn the tablet wrap (one row does not fit); it is described, not drawn.
The User Researcher has not tried it yet.
