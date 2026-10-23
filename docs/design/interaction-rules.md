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
9. A help card must stay inside the screen. The app places it below its icon, left-aligned with it, and moves it left to stay 16 px inside the right edge. It opens above its icon when below would leave the screen. It is never wider than the screen less 32 px. Check every help card open at 1440 px and 1100 px before a change ships.
9b. Every card carries a **?** help icon. A click (or Enter) opens it. A second click, Escape, or a click outside closes it. Pointing at it also shows it. Its text uses SPEC.md §4 and §6.1 words: what the card counts, what each word means, and what a click does.
10. Health is a dot of its color on every row. The word stays in the page for a screen reader. No health pills.
10a. The Priority rank is a plain number in the first column, muted, right-aligned. No badge.
11. A goal with no health shows a hollow dot.
12. An owner is an avatar. The signed-in actor's own avatar is outlined. The name is the avatar's tooltip.
13. Every label is a word from SPEC.md §4, §6, §8.2, or §9. A screen with no spec word for a label uses a number or an icon, and the word goes to Tig.
14. Every date shows its Date Type. A date never breaks across two lines.
15. A sub-goal draws its date only when that date differs from its parent's.

## Goal tree

16. Goals under a goal sit in a tree. Each level is indented 26 px and joined to its parent by a guide line.
17. Each level down is lighter: 14 px bold, then 13.5 px semibold, then 13 px.
18. A top-level goal starts open. A deeper goal with goals under it starts closed. A filter opens every level.
19. The open and close control shows how many goals sit under the goal.
19a. Every row has the same columns, left to right: rank, health dot, title, count, owner. The count sits before the owner. A row with no count keeps the empty slot, so every owner avatar lines up.

## Timeline

20. The board draws one grid and one today line for every row, so they never break between rows. They are drawn as the background of each row, so the pinned column always covers them.
20a. The timeline scrolls sideways into the past and the future: 26 weeks back and 39 weeks ahead of the week it opens on. A week is 84 px. The goal names stay pinned on the left while it scrolls, with a soft shadow on their edge.
20b. The board opens on the week two weeks before today, or earlier to show a Committed date that passed in the last 10 weeks. The app sets the scroll position, so it opens there in every browser.
20c. The horizontal scrollbar sits at the top of the timeline, above the week labels, not at the bottom of the board.
21. Earlier and Later open the board one step before or after the week on screen, and write it to `?from=`. Today goes back to the default window and scrolls back to it.
21a. Zoom out and zoom in are one pill of two buttons, − and +, beside the date pill. There are three levels: weeks (84 px a week, a label each week), months (30 px a week, a label each month), and quarters (14 px a week, a label each month, no week lines). At the closest or farthest level its button is shown, grayed, and does nothing.
21b. Earlier and Later move 4 weeks at weeks, 13 weeks at months, and 26 weeks at quarters. The date pill shows the days on screen and follows the scroll.
21c. The Today label reads "Today". Pointing at it adds the date: "Today · Oct 23".
22. Moving or zooming the timeline keeps the filter and the search in force.
23. A date past the edge of the window is written at that edge with an arrow.

## Highlight and selection

H1. A highlighted goal and a selected goal look the same: a gray row (`--hover`) and a 3 px bar of its health color on the left edge of the goal column. No border on the other three edges, and no fill in the health color, so the bar on the timeline stays visible.
H2. A goal is highlighted while the pointer is on its health count or on its part of the health meter. In the Calendar its chips are highlighted the same way.
H3. A goal is selected while a health filter shows it.
H4. Pointing at a row turns it gray, with no colored bar.

## Filter and search

24. The health counts and the health meter on the Committed dates card are controls. Pointing at either highlights every goal with that health (rule H1), including its name in the goal column. Clicking it shows only those goals. Clicking it again, or **Show all**, shows every goal.
25. The search box sits right below the Priorities heading, at the top of the goal column, on the same line as the week labels. It is as wide as the goal column. It matches goal summaries as you type.
25a. The filter in force sits beside the Priorities heading, with **Show all**.
25b. Earlier, the window's dates, and Later are one pill. Today is a separate button beside it. Both are 36 px tall.
26. A filter keeps the parents of a goal that matches, dimmed, so the goal keeps its place in the tree.
27. A filter that matches nothing says "No goals match."

## Views

V1. One pill of three buttons beside the zoom pill picks the view: Timeline, List, or Calendar. The view in force is filled. All three draw the same goals with the same filter and search.
V2. The List draws the saved view's columns (SPEC.md §8.2) right of the goal column: Health, Date Type, Promotion Milestone, PTG. The goal column, the tree, and the owner avatar are the Timeline's.
V3. The Calendar is one month, Monday first. Each goal date is a chip on its day: a health dot, the title cut to fit, and a Date Type mark (solid for a committed date, light for Ambition, dotted for Fantasy, hatched red for a slip). A day shows 3 chips. "+N" opens the rest; Escape or a click outside closes them. A parent kept only for context draws no chip.
V4. In the Calendar, Earlier and Later move one month, and the date pill names the month. The zoom pill is hidden in the List and the Calendar. The date pill is hidden in the List.

## Access

28. Text meets 4.5:1 contrast. No text is below 11 px, and body text is 12 px or more.
29. A control is at least 44 px tall to tap, or sits inside a row that is.
30. Every control shows a focus ring on keyboard focus.
31. Every color is a token on `:root`, so an organization can reskin GOALIE.

## Phone

32. On a phone, Priorities come before the cards.
33. The timeline is hidden. The List takes its place, and the view pill shows List and Calendar. Each row writes its dates as text, and its PTG under them.
34. The search box takes its own line.
