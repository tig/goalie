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
10. Health is a mark of its color and its own shape on every screen, so color is not the only cue (review X3): GREEN a circle, YELLOW a diamond, RED a square. Each fits the same 10 px box. On a phone the word shows beside the mark; elsewhere it stays in the page for a screen reader. No health pills.
10a. The Priority rank is a plain number in the first column, muted, right-aligned. No badge.
11. A goal with no health shows a hollow circle.
12. An owner is an avatar. The signed-in actor's own avatar is outlined. The name is the avatar's tooltip.
13. Every label is a word from SPEC.md §4, §6, §8.2, or §9. A screen with no spec word for a label uses a number or an icon, and the word goes to Tig.
14. Every date shows its Date Type. A date never breaks across two lines.
15. A sub-goal draws its date on the timeline only when that date differs from its parent's. The List and a phone row write the parent's date in muted text, so a sub-goal never shows no date (review X6).

## Goal tree

16. Goals under a goal sit in a tree. Each level is indented 26 px and joined to its parent by a guide line.
17. Each level down is lighter: 14 px bold, then 13.5 px semibold, then 13 px. A title shows two lines, three on a phone (review X13).
18. A top-level goal starts open. A deeper goal with goals under it starts closed. A filter opens every level.
19. The open and close control shows how many goals sit under the goal.
19a. Every row has the same columns, left to right: rank, health dot, title, count, owner. The count sits before the owner. A row with no count keeps the empty slot, so every owner avatar lines up.

## Timeline

20. The board draws one grid and one today line for every row, so they never break between rows. They are drawn as the background of each row, so the pinned column always covers them.
20a. The timeline scrolls sideways into the past and the future, and is wider than the screen at every zoom (review Q2): 26 weeks back and 39 ahead of the week it opens on at weeks, 52 and 78 at months, 104 and 156 at quarters. The goal names stay pinned on the left while it scrolls, with a soft shadow on their edge.
20b. The board opens on the week two weeks before today, or earlier to show a Committed date that passed in the last 10 weeks. The app sets the scroll position, so it opens there in every browser. Until the viewer scrolls, it sets it again when fonts or the layout settle late, or when the browser restores an old position (review X2).
20c. The timeline shows no scrollbar. A soft fade on its left or right edge shows there is more to scroll that way.
20d. The timeline scrolls sideways by trackpad, by the mouse wheel, by dragging, and by the keyboard. Over the lanes a vertical wheel scrolls it sideways until it reaches its edge; then the page scrolls. Over the goal column a vertical wheel scrolls the page. Shift and the wheel scroll it sideways anywhere on it. A press on the lanes that moves more than 4 px pans it, with the grabbing cursor while it pans, and does not open or close a goal. With the timeline focused, Left and Right move it one week. Earlier, Later, and Today still work.
21. Earlier and Later open the board one step before or after the week on screen, and write it to `?from=`. Today goes back to the default window and scrolls back to it.
21a. Zoom out and zoom in are one pill of two buttons, − and +, beside the date pill. There are three levels: weeks (84 px a week, a label each week), months (30 px a week, a label each month), and quarters (14 px a week, a label every other month, no week lines; review X4). A month label names its year on the first label and on the first label of each new year. At the closest or farthest level its button is shown, grayed, and does nothing.
21b. Earlier and Later move 4 weeks at weeks, 13 weeks at months, and 26 weeks at quarters. The date pill shows the days on screen and follows the scroll exactly; a day cut by an edge counts (review X11). A year is named outside the current one, on both dates when they differ (review Q3).
21c. The Today label reads "Today". Pointing at it adds the date: "Today · Oct 23".
22. Moving or zooming the timeline keeps the filter and the search in force.
23. A label stays whole on screen (review X1). It sits to the right of its mark, or to its left when the right has no room. A date off screen, or past the edge of the board, is written at the edge of what is on screen with an arrow; an uncommitted date's arrow sits under its line.
23a. A Promotion Milestone date is a diamond. A goal's own Committed date is a bar. A parent and a sub-goal on one day tell apart (review X12).
23b. A goal that started after its Committed date passed draws its health bar under the slip, from that date to today (review Q6).

## Highlight and selection

H1. A highlighted goal and a selected goal look the same: a gray row (`--hover`) and a 3 px bar of its health color on the left edge of the goal column. No border on the other three edges, and no fill in the health color, so the bar on the timeline stays visible.
H2. A goal is highlighted while the pointer is on its health count or on its part of the health meter. Only the goals the count counts light: top-level goals in progress above the cut line (review Q4). In the Calendar their chips light the same way.
H3. A goal is selected while a health filter shows it. A health filter shows what its count counts.
H4. Pointing at a row turns it gray, with no colored bar.

## Filter and search

24. The health counts and the health meter on the Committed dates card are controls. Pointing at either highlights every goal with that health (rule H1), including its name in the goal column. Clicking it shows only those goals. Clicking it again, or **Show all**, shows every goal.
25. The search box sits right below the Priorities heading, at the top of the goal column, on the same line as the week labels. It is as wide as the goal column. It matches goal summaries as you type.
25a. The filter in force sits beside the Priorities heading, with **Show all**.
25b. Earlier, the window's dates, and Later are one pill. Today is a separate button beside it. Both are 36 px tall.
25c. No control moves when a label changes. The date pill is as wide as its longest form, in tabular numbers, with its text centered, so scrolling, zooming, and stepping never shift the controls beside it. A control that does nothing in a view keeps its place, unseen, so switching views moves nothing.
26. A filter keeps the parents of a goal that matches, dimmed, so the goal keeps its place in the tree.
27. A filter that matches nothing says "No goals match."

## Views

V1. One pill of three buttons beside the zoom pill picks the view: Timeline, List, or Calendar. The view in force is filled. All three draw the same goals with the same filter and search.
V2. The List draws the saved view's columns (SPEC.md §8.2) right of the goal column: Health, Date Type, Promotion Milestone, Path to Green (PTG). The goal column is titled Priority, over the rank, and Owner, over the avatars (review X14). The Date Type cell writes the date health is judged on first, then the uncommitted date in light text (review X8). PTG is spelled out once, in its title; a RED or YELLOW goal with no Path to Green says "No Path to Green" (review X7). The tree and the owner avatar are the Timeline's.
V3. The Calendar is one month, Monday first. Each goal date is a chip on its day: the health mark, the title on up to two lines, and a Date Type mark (solid for a Committed date, a diamond for a Promotion Milestone, light for Ambition, dotted for Fantasy, hatched red for a slip). The Date Type is in the chip's text for a screen reader (review X9). A day shows 3 chips. "+N" opens the rest; Escape or a click outside closes them. A parent kept only for context draws no chip.
V4. In the Calendar, Earlier and Later move one month, and the date pill names the month. The zoom pill is not shown in the List and the Calendar, and the date pill is not shown in the List; each keeps its place (rule 25c). On a phone they take no space.

## Load and look

L1. While Home loads, a skeleton holds the shape of the cards and the board (review X18).
L2. A refused session (401) reloads the page once, so the server answers with its own sign-in page (review E5).
L3. The font is served with the app and named only by the `--font` token (review E6).
L4. Cards have a 16 px radius. A summary card lifts a little under the pointer (review X18). Summary cards share one minimum height, and a number never breaks from its word (review X15).

X16, X17, and X18 were Chelsea's calls. The coordinator decided them on the reviewers' recommendations: a 36 px pill with a 44 px tap area, Priorities first on a phone with the health line above, and the polish in L1 and L4.

## Access

28. Text meets 4.5:1 contrast. No text is below 11 px, and body text is 12 px or more.
29. A control is at least 44 px tall to tap, or sits inside a row that is. A 36 px pill (rule 25b) and a small icon answer a 44 px tap on a touch screen (review X16).
30. Every control shows a focus ring on keyboard focus.
31. Every color is a token on `:root`, so an organization can reskin GOALIE.

## Phone

32. On a phone, Priorities come before the cards. A line of health counts sits above Priorities, so the first screen says how things stand (review X5, X17).
33. The timeline is hidden. The List takes its place, and the view pill shows List and Calendar. Each row writes its dates as text, and its PTG under them.
34. The search box takes its own line.
