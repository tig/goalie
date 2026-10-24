# MLP review

**Status:** Round 2, fixes in progress

**Date:** 2026-10-23

**Owner:** Chelsea

This is the review list for pull request #52 (XW-0003 MLP). It is overwritten each round.
Round 1 (2026-10-22) read the server-drawn Home at 05ff75b. Its 50 findings are fixed. QA re-checked them in round 2 and they hold.
Round 2 read the React app at e147b21: QA, Head of Engineering, and the Experience pair (User and UI/UX designer).
Status words: **blocks** stops the merge, **open** is a real problem with a clear fix, **yours** is Chelsea's call, **Tig** is a word or decision for Tig, **fixed** is done.

## Summary

| Status | Count |
| --- | --- |
| blocks | 6 |
| open | 46 |
| yours | 3 |
| Tig | 2 |
| fixed | 2 |

The one-minute test (release plan §1), User as Tig, desktop: Q1 yes, 10 s. Q2 "What needs me?" no. Q3 yes. About 25 s for 2 of 3. Phone: Q1 took 30 s, because the Committed dates card sits below every goal.

## Chelsea's notes

| # | Status | Finding | Fix |
| --- | --- | --- | --- |
| C1 | fixed | The board controls moved sideways when the date label changed width | The date label has a fixed width. Every pill keeps its x in 8 states (13413dd) |
| C2 | fixed | The timeline scrollbar | No scrollbar. Wheel, shift and wheel, drag, arrow keys, Earlier, Later, Today, and edge fades (13413dd) |

## Code: QA

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| Q1 | blocks | rules.ts | A Committed goal's due_date can be rewritten in place, which erases its slip (SPEC §6.1, §7.1: no silent re-baselines) | Once Committed, the date moves only through changed_due_date with a reason |
| Q2 | open | model/timeline.ts | At Quarters zoom the board cannot open two weeks before today | Fill the board at every zoom, or clamp the open week |
| Q3 | open | App.tsx | The range label drops the year on the first date | Write the year on both dates when they differ |
| Q4 | open | model/filter.ts | "1 GREEN" lights 3 rows | The filter selects what the count counts |
| Q5 | open | server.ts | A missing script URL gets index.html, not 404 | 404 for a file path outside /assets/ |
| Q6 | open | model/timeline.ts | The RED goal draws no health bar when it started after its date | Start the bar at the earlier of the two |
| Q7 | open | rules.ts | A date that is not on the calendar is rejected with the wrong message | Rule `real-date` |
| Q8 | open | write.ts | A create with no fields returns raw SQLite text | Rule `required-field` |
| Q9 | open | write.ts | A string base_version answers "stale" | Reject as bad_command |
| Q10 | open | model/calendar.ts | Years below 100 and above 9999 break the calendar and the timeline | Bound `from` to 1970 to 9999 |
| Q11 | open | cli.ts | `write` with bad JSON crashes | A named rejection |

## Code: Head of Engineering

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| E1 | blocks | web model/dates.ts, goal.ts, priorities.ts | The date helpers (isDate, day) are copied on the server and in the app | One server/src/dates.ts that both import |
| E2 | open | web | "slip N days" is built in 5 places | One slipLabel |
| E3 | open | Cards.tsx, api.ts | The app walks the tree for a slip's Date Type | Put kind on the summary's slips |
| E4 | open | signin.ts, parts.tsx, index.html | The brand is in 3 places | One brand source on the server |
| E5 | open | App.tsx | The 401 screen copies the sign-in text | Reload and let the server answer |
| E6 | open | index.html | The font comes from Google Fonts, hard-coded | Serve it with the app, named only by a token |
| E7 | open | seed.ts | Excaliwire's data is code shipped to every deployment | A data file outside src/ |
| E8 | open | CONTRIBUTING.md | Names the Excaliwire Entra tenant | Move it to excaliwire/operations |
| E9 | open | fixtures/priorities.json | Nothing ties the fixture to the API | A test that compares them |
| E10 | open | App.tsx | "Priorities" is a literal | Draw the view's name |
| E11 | open | App.tsx, styles.css | The phone width is in two places | One home |
| E12 | open | TimelineView, CalendarView | The legend is copied | One Legend |
| E13 | open | GoalTree, CalendarView | The highlight test is copied | One isLit |
| E14 | open | parts.tsx, popover.ts | Popover sizes are copied | Export them |
| E15 | open | CalendarView, dates.ts | The Monday-first formula is copied | One weekday |
| E16 | open | GoalTree.tsx | The rank column width is hard-coded | Read the CSS variable |
| E17 | open | write.ts | A re-export shim is left over | Delete it |
| E18 | open | write.ts, read.ts | The goal key prefix is in two places | One home |
| E19 | open | priorities.ts | Calendar quarters are hard-coded | Read the calendar from owner settings, quarters as default |
| E20 | open | priorities.ts | The Drafts count covers the whole store | Count this view's Drafts |
| E21 | open | priorities.ts, store.ts | A subquery per goal and no index on the Event log | Index event(entity_kind, entity, sequence) |
| E22 | open | server.ts | The org unit is resolved on every request | Resolve it once |
| E23 | open | api.ts | ApiGoal.state is a plain string | Type it State |
| E24 | open | web tsconfig | Browser code can call Node APIs and still typecheck | DOM types only for the app |

Head of Engineering: keep the app inside the server component. It imports api.ts and ships in the same publish.

## Experience: User and UI/UX designer

| # | Status | Who hit it | Finding | Fix |
| --- | --- | --- | --- | --- |
| X1 | blocks | Tig, Design | Labels at the right edge are cut off ("Com", "Fantasy Nov"), against rule 23 | Keep the whole label inside the window, or the edge arrow |
| X2 | blocks | Tig | Once, the first load opened on Nov 30 – Feb 5 with no Today line | Set the scroll after layout and fonts; a test that opens late |
| X3 | blocks | Galahad | On a phone, health is a dot only. A color-blind person cannot tell RED from GREEN | A shape per health on every screen, and the word on the phone |
| X4 | blocks | Design | Months and quarters labels are 10.5 px, under the 11 px floor (rule 28) | 11 px; drop alternate labels if they crowd |
| X5 | open | Tig | On a phone the health counts sit 1300 px down | A one-line health summary above Priorities |
| X6 | open | Chelsea | Sub-goals with no date show nothing | Say there is no date, in muted text |
| X7 | open | Tig | The List's PTG cell shows seed placeholder text, and "PTG" is never spelled out | "Path to Green (PTG)" once; an empty state |
| X8 | open | Tig | The List does not say which date health is judged on | The judged date first, the uncommitted date second and light |
| X9 | open | Tig | Calendar chips cut the title and carry no Date Type word | Wider chips, two lines, the Date Type in the label for a screen reader |
| X10 | open | Tig | The Committed dates help opens over the filter chip | Open it beside the icon |
| X11 | open | Chelsea | The range label disagrees with the visible axis | Follow the scroll exactly |
| X12 | open | Chelsea | A parent and a child bar both end Nov 6 and the child's own date is lost | Tell the two marks apart |
| X13 | open | Design | Sub-goal titles cut at two lines on a phone | Three lines on a phone |
| X14 | open | Galahad | Nothing says the 1, 2, 3 are ranks | A "Priority" column title in the List |
| X15 | open | Design | At 1100 px the cards differ in height and the Promotions due line wraps | One min-height; one alignment |
| X16 | yours | Design | Rule 25b says 36 px pills and rule 29 says 44 px to tap | Recommend: a 36 px pill with a 44 px hit area on touch |
| X17 | yours | Tig | Priorities before the cards costs Tig 20 s on a phone | Recommend: keep rule 32 and add X5 |
| X18 | yours | Design | Polish | Recommend: 16 px card radius, a soft hover lift on cards, a loading skeleton |
| X19 | open | Galahad | No way to add a goal from Home | A New goal button when creating a goal works (MLP 4) |

## For Tig

| # | Question |
| --- | --- |
| T1 | A word for "What needs me?": goals a human owns that are RED or YELLOW, and the Drafts waiting on them. |
| T2 | The view names Timeline, List, Calendar, the calendar day names, and "+N" for more chips. |
