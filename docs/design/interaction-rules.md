# Design and interaction rules

**Status:** In use

**Date:** 2026-10-23

**Owner:** Chelsea

These are the small rules for how GOALIE screens look and behave.
Every screen follows them. A change to a rule lands in this file in the same pull request as the screen.
The product contract is [SPEC.md](../specs/SPEC.md). The app shape is [ADR 0010](../adr/0010-app-shape.md). This file does not restate them.
The screens are a React app in `server/web/`. It reads `GET /api/priorities` and holds no rule.

## Feel

1. GOALIE must feel like a web app, not a document.
2. The pointer is the arrow everywhere. It is the hand only on something you can click. It is the text cursor only in a field you can type in.
3. Text in the app chrome (the top bar, cards, the board, the legend) must not be selectable. Text in a field and on a page a human writes stays selectable.
4. Something you can click shows a hover state and a press state. The press scales it to 96%. Every change of state takes 120 ms.
5. The top bar stays frozen at the top while the page scrolls.
5a. A control changes the screen at once, with no page load.
5b. The filter, the search, the zoom, the window, and the view live in the URL query (`health`, `q`, `zoom`, `from`, `view`). A link reopens the same screen. Back and Forward walk the changes. A value that is not valid is ignored.

## What a screen shows

6. A screen shows what a human needs at a glance. Detail belongs on the goal page.
7. Goal keys (for example XW-0001) must not show on Home.
8. A goal row must not open a hover card. Help cards are only for the **?** icon by a card label and in the legend.
9. A help card must stay inside the screen. The app opens it beside its icon, on the right, else on the left, so it never covers what the icon labels (review X10). With no room on either side it opens below its icon, or above when below would leave the screen. It stays 16 px inside every screen edge and is never wider than the screen less 32 px. Check every help card open at 1440 px, 1100 px, and 390 px before a change ships.
9b. Every card carries a **?** help icon. A click (or Enter) opens it. A second click, Escape, or a click outside closes it. Pointing at it also shows it. Its text uses SPEC.md §4 and §6.1 words: what the card counts, what each word means, and what a click does.
10. Health is a mark of its color and its own shape on every screen, so color is not the only cue: GREEN a circle, YELLOW a triangle, RED a square. Each fits the same 10 px box. A diamond is only a Promotion Milestone (rule 23a). In the List the mark and the word are the Health column. On a phone the word follows the mark at the start of the row's date line. No health pills.
10a. The Priority rank is a plain number in the first column, muted, right-aligned. No badge.
11. A goal with no health shows a hollow circle.
12. An owner is an avatar. The signed-in actor's own avatar is outlined. The name is the avatar's tooltip.
13. Every label is a word from SPEC.md §4, §6, §8.2, or §9. A screen with no spec word for a label uses a number or an icon, and the word goes to Tig.
14. Every date shows its Date Type. A date never breaks across two lines.
15. A sub-goal draws its date on the timeline only when that date differs from its parent's. The List and a phone row write the parent's date in muted text, so a sub-goal never shows no date (review X6).

## Goal tree

16. Goals under a goal sit in a tree. Each level is indented 26 px and joined to its parent by a guide line.
17. Each level down is lighter: 14 px bold, then 13.5 px semibold, then 13 px. A title shows two lines at most on a desktop, and three on a phone. In the List it takes a second line only when it needs one.
18. A top-level goal starts open. A deeper goal with goals under it starts closed. A filter opens every level.
19. The open and close control shows how many goals sit under the goal. It alone opens and closes the tree; a goal's title opens its goal page at `/goals/<key>` (design: goal page, G1).
19a. Every row has the same columns, left to right: rank, health mark, title, count, owner. In the List the health mark moves to the Health column. The count sits before the owner. A row with no count keeps the empty slot, so every owner avatar lines up. On a phone the count moves to the end of the date line, so the title takes the width up to the avatar.

## Timeline

20. The board draws one grid and one today line for every row, so they never break between rows. They are drawn as the background of each row, so the pinned column always covers them.
20a. The timeline scrolls sideways into the past and the future, and is wider than the screen at every zoom (review Q2): 26 weeks back and 39 ahead of the week it opens on at weeks, 52 and 78 at months, 104 and 156 at quarters. The goal names stay pinned on the left while it scrolls, with a soft shadow on their edge.
20b. The board opens on the week two weeks before today, or earlier to show a Committed date that passed in the last 10 weeks. When that would put today past the left third of the timeline on screen, as on a narrow board, it opens with today at the left third. The app sets the scroll position, so it opens there in every browser. Until the viewer scrolls, it sets it again when fonts or the layout settle late, or when the browser restores an old position (review X2).
20c. The timeline shows no scrollbar. A soft fade on its left or right edge shows there is more to scroll that way.
20d. The timeline scrolls sideways by trackpad, by the mouse wheel, by dragging, and by the keyboard. Over the lanes a vertical wheel scrolls it sideways until it reaches its edge; then the page scrolls. Over the goal column a vertical wheel scrolls the page. Shift and the wheel scroll it sideways anywhere on it. A press on the lanes that moves more than 4 px pans it, with the grabbing cursor while it pans, and does not open or close a goal. With the timeline focused, Left and Right move it one week. Earlier, Later, and Today still work.
21. Earlier and Later open the board one step before or after the week on screen, and write it to `?from=`. Today goes back to the default window and scrolls back to it.
21a. Zoom out and zoom in are one group of two buttons, − and +, first in the toolbar's right cluster. There are three levels: weeks (84 px a week, a label each week), months (30 px a week, a label each month), and quarters (14 px a week, a label every other month, no week lines; review X4). A month label names its year on the first label and on the first label of each new year. An axis label that does not fit whole on screen is hidden. The Today pill stays inside the screen. At the closest or farthest level a zoom button is grayed and does nothing.
21b. Earlier and Later move 4 weeks at weeks, 13 weeks at months, and 26 weeks at quarters. The date pill shows the days on screen and follows the scroll exactly; a day cut by an edge counts (review X11). A year is named outside the current one, on both dates when they differ (review Q3).
21c. The Today label reads "Today". Pointing at it adds the date: "Today · Oct 23".
22. Moving or zooming the timeline keeps the filter and the search in force.
23. A label stays whole on screen (review X1), and never overlaps another label, a bar, or a tick on its row. It sits to the right of its mark, or to its left when the right has no room. A tick's label sits in the band above the bar and an uncommitted date's label in the band below it. Every date off screen, or past the edge of the board, is written at that edge in its band with an arrow, one label per row, side, and band, in date order. A mark too close to an edge label to clear it, or whose label fits on neither side of it, joins that edge label. A label never ends in an ellipsis. Labels have no fill; a halo of the card color keeps the today line and the grid out of their text.
23a. A Promotion Milestone date is a diamond. A goal's own Committed date is a bar. A parent and a sub-goal on one day tell apart (review X12).
23b. A goal that started after its Committed date passed draws its health bar under the slip, from that date to today (review Q6).

## Highlight and selection

H1. A highlighted goal and a selected goal look the same: a gray row (`--hover`) and a 3 px bar of its health color on the left edge of the goal column. No border on the other three edges, and no fill in the health color, so the bar on the timeline stays visible.
H2. A goal is highlighted while the pointer is on its health count or on its part of the health meter. Only the goals the count counts light: top-level goals in progress above the cut line (review Q4). In the Calendar their chips light the same way.
H3. A goal is selected while a health filter shows it. A health filter shows what its count counts.
H4. Pointing at a row turns it gray, with no colored bar.

## Filter and search

24. The health counts and the health meter on the Committed dates card are controls. Pointing at either highlights every goal with that health (rule H1), including its name in the goal column. Clicking it shows only those goals. Clicking it again, or **Show all**, shows every goal.
25. The search box is in the toolbar's left cluster, after the view tabs, in every view: 240 px wide, 200 px when the board's content is under 1040 px. It matches goal summaries as you type. Repeated spaces count as one.
25a. The health filter in force is a chip at the start of the search box, with its shape, its word, and an x. The x is **Show all**. The box keeps its width.
25b. The toolbar is one 44 px row: Priorities, the view tabs, and the search box anchored left; zoom, the date range, and Today anchored right. Every control is 32 px tall. The date range is Earlier, a label as wide as its longest form (at least 184 px), and Later, in one group. When one row does not fit, the second row holds the search box on the left (at least 200 px, growing) and the right cluster on the right. That is two rows, and the bar does not grow when the view changes.
25c. No control moves when a label changes or the view changes. The date range label is as wide as its longest form in every view, in tabular numbers, centered. A control that does not apply is not drawn, and the right cluster is anchored right, so the rest keep their place. The page keeps a fixed scrollbar gutter.
25d. The Timeline's goal column header, on the line of the week labels, titles the column: Priority at the left and Owner over the avatars, as in the List.
26. A filter keeps the parents of a goal that matches, dimmed, so the goal keeps its place in the tree.
27. A filter that matches nothing says "No goals match."
27a. The cut line (SPEC.md §6.3) is named once, on its divider: "✂ Cut line". An empty side says "No Priorities above the cut line." or "No Priorities below the cut line."

## Views

V1. The view tabs follow Priorities in the toolbar: Timeline, List, Calendar on a desktop; List and Calendar on a phone. The view in force is a raised white tab on a `--control` track. All views draw the same goals with the same filter and search.
V2. The List is one grid: rank, Priority (the tree), Owner, Health, Date Type, Promotion Milestone, Path to Green (PTG), titled once in a 32 px header that stays on screen. A top-level row is 40 px and a sub-goal row 36 px, with 6 px above and below the title; a title that needs a second line makes its row taller (about 49 px and 44 px). Only the title wraps; any other long cell ends in an ellipsis. The Date Type cell writes the goal's own date. The Promotion Milestone cell writes only its date. The date health is judged on is dark and the other light. A RED or YELLOW goal with no Path to Green says "No Path to Green". On a board under about 1000 px of content, Promotion Milestone and PTG drop to a second line in the row, each named.
V3. The Calendar is one month, Monday first. Each goal date is a chip on its day: the health mark, the title on up to two lines, and a Date Type mark (solid for a Committed date, a diamond for a Promotion Milestone, light for Ambition, dotted for Fantasy, hatched red for a slip). The Date Type is in the chip's text for a screen reader (review X9). A day shows 3 chips. "+N" opens the rest; Escape or a click outside closes them. A parent kept only for context draws no chip. On a phone, where the Calendar lists only days with dates, a month with none says "No goals match." with a filter in force, else "No dates in October 2026."
V4. The Timeline draws zoom, the date range, and Today. The Calendar draws the date range, which names the month, and Today; Earlier and Later move one month. The List draws no time control. The legend is in the board footer in the Timeline and the Calendar.

## Load and look

L1. While Home loads, a skeleton holds the shape of the cards and the board (review X18).
L2. A refused session (401) reloads the page once, so the server answers with its own sign-in page (review E5).
L3. The font is served with the app and named only by the `--font` token (review E6).
L4. Cards have a 16 px radius. A summary card lifts a little under the pointer (review X18). Summary cards share one minimum height, and a number never breaks from its word (review X15).

X16, X17, and X18 were Chelsea's calls. The coordinator decided them on the reviewers' recommendations: a 36 px pill with a 44 px tap area, Priorities first on a phone with the health line above, and the polish in L1 and L4.

## Goal page and New goal

The rules G1 to G24 and N1 to N16 in [goal-page-and-create.md](goal-page-and-create.md) bind these screens. These are how the app holds them.

GP1. A goal's title on Home opens its goal page at `/goals/<key>` (rule 19). The back link returns to the view you came from, with its query (G1).
GP2. The goal page leads with the date health is judged on, as the server sends it first (G5). The goal's own date follows, lighter.
GP3. One panel is open at a time, in place (G9). Each Save is one batch to the server, which checks every rule. A rule broken shows at the field it names, in the server's words. A stale save keeps the typed values, says "Someone saved this goal after you opened it.", and shows the current value under each field changed. A saved panel reloads the page.
GP4. Choosing a health that is not saved outlines it in its color; the saved health is filled (G4).
GP5. + Sub-goal and + Work item open one add row in place (G20, G22). A sub-goal takes this goal's date, written out, unless it is given its own; its own Ambition or Fantasy date opens its own Promotion Milestone.
GP6. Ticking a work item asks for its reason in the row; Enter saves and Escape undoes the tick (G24).
GP7. History shows one row per write: the Events of one save (same actor, time, and reason), on any goal; another goal's step names it first. A Promote reads "Promoted · XW-0012 completed" and opens to its steps (N6a). A create reads "Created" with its date and health, and opens to list its fields. Values are names and dates with their year, never ids.
GP8. Dates on the goal page header carry their year: "Nov 6, 2026". The goal's own date reads "Nov 30, 2026 Fantasy · this goal's date". Each mark on the date bar is labelled under it. A label that would touch the one before it drops to a second row.
GP9. A panel's buttons sit at its right, Cancel then Save. A new Path to Green step has no date until one is picked. Panel tints are light (--yellow-tint, --red-tint, --green-tint) with the health's -bg border.
GP10. Description and Fields stack under 900 px of page.
GP11. Close goal on an Ambition goal offers "Promote and close" when the server sends the state it would close as. One save completes the Promotion Milestone, makes the current date Committed, and closes the goal in that state. A Fantasy goal offers Did Not Meet and Deleted, with "Promote to Ambition first to close as Completed." (G15). A new Promotion Milestone starts In Progress with the health of the goal it backs (N6a). An older Backlog milestone passes through In Progress, GREEN, in the same save, because a Backlog goal cannot move to Completed.
NG1. New goal is a filled 32 px button, last in the toolbar's right cluster in every view, so it never moves (rule 25c). On a phone it is a 40 px button after the view tabs.
NG2. The New goal page is one form of five numbered cards and a rail (N1). The rail asks the server to check the save 400 ms after the last change and shows its answer: the keys it would make, or what it refuses. The browser checks no rule (ADR 0010). The Create button names the goal's key from that answer.
NG3. A refusal shows at the card and field it names, and the rail lists every refusal the check finds. Typing again clears it until the next check.
NG4. "Create will make" names each key with what it is: "XW-0013 this goal", "XW-0012 its Promotion Milestone". The server gives keys in its create order, so the milestone may take the lower key. A sub-goal on an uncommitted goal's date says "· this goal's date · shares XW-0012", and the rail says how many share it.
NG5. More fields is one row of chips, each a field, its default as a small picker, and a ? with its §6.1 meaning; Work Product is among them (N8). The preview leads with the judged date.
NG6. On a phone the checks are a one-line count at the top, and Create is a 48 px bar fixed to the bottom of the screen (N15). On touch every field is 44 px tall, and a Priority row is its own tap target.

## Work items page

W1. The top bar has two pages: Home and Work items. The page you are on is filled.
W2. Work items lists one queue per owner (the team view, the org unit's name under "Owner") or one owner's queue (that owner's name), each by status: In Progress, then Backlog. Completed work is one muted line per owner, "5 completed", opening in place. People with work In Progress come first, then the signed-in actor. An agent owner carries the muted word "agent". Each row shows its goal, linked, and its due date, with "late" in --red-ink when it is past and "today" when it is today.
W3. The page updates live: a change to any work item, by anyone, reloads it (ADR 0007). Ticking a row asks for its reason, as on a goal page.

## Access

28. Text meets 4.5:1 contrast. No text is below 11 px, and body text is 12 px or more.
29. On a touch screen every control answers a 44 px tap, even when it draws smaller. A parent must not clip the tap area (review X16).
30. Every control shows a focus ring on keyboard focus.
31. Every color is a token on `:root`, so an organization can reskin GOALIE.

## Phone

32. On a phone, Priorities come before the cards. A line of health counts sits above Priorities, so the first screen says how things stand (review X5, X17).
33. The timeline is hidden. The List takes its place, and the view tabs show List and Calendar. Under each title the row writes its health mark and word, then its dates in the List's order (the date health is judged on dark, the other light), then its PTG.
34. On a phone the toolbar takes two rows: Priorities and the view tabs, then the search box, full width, 40 px. The Calendar adds a third row: the date range and Today.
