# Words not in SPEC.md

Status: Open, for Chelsea
Date: 2026-10-30
Owner: Product Manager

This is the one list of on-screen words that SPEC.md does not name (PLAYBOOK.md critique rule 6).
It replaces the word lists in [docs/reviews/mlp.md](../reviews/mlp.md) N9 and U11.
Measured at df300c0 on chelsea/mlp: every string a person reads or hears in server/web/src (text, labels, placeholders, screen-reader text).
A word counts as named when SPEC.md §4 to §9 or USERS_MANUAL.md uses it in that sense. Field names and values from §6 (Owner, State, Due Date, Pencil, Carryover, and so on) count.
Each row gives 2 or 3 options and the pick. The first option is what the screen shows now.
Chelsea picks. The Designer then writes the pick into docs/design/interaction-rules.md and server/web/src/model/labels.ts (rule 3). Tig adds the kept words to SPEC.md §4 later.

## Already decided, for the SPEC.md record

| Word on screen | Where | Decided by |
|---|---|---|
| On track, At risk, Off track | Every health | Chelsea, 2026-10-25 |
| New goal, Sub-goal, Slip, Promote, Close | Top bar, goal page | D5 in [goal-page-and-create.md](goal-page-and-create.md) |
| Timeline, List, Calendar | Home view tabs | Design rule V1 |

## For Chelsea to pick

| # | Now | Where | Options | Pick | Why |
|---|---|---|---|---|---|
| 1 | + Add sub-goal, + Add work item | Goal page | + Add sub-goal · + Sub-goal · Add a sub-goal | + Sub-goal, + Work item | D5 and done checks 33 to 44 say "+ Sub-goal". The screen and the spec disagree today. |
| 2 | Pursue | Promotion Milestone button | Pursue · Start · Start work | Start | It moves the milestone to In Progress. "Start" is the plain word for that State. |
| 3 | Needed to save | New goal rail heading | Needed to save · Required · To create | Needed to save | It says why, in four short words. |
| 4 | To save: 2 to go · Ready to create | New goal rail count | To save: 2 to go · 2 more to fill in · Needs 2 more | Needs 2 more · Ready to create | Shortest, and it reads as one line with the heading. |
| 5 | How firm is the date? | New goal, Date Type field | How firm is the date? · Date Type · Date Type, with "How firm is the date?" as help | Date Type, with the question as help | Date Type is the SPEC word; the question explains it. |
| 6 | Create goal | New goal button | Create goal · Create · Save goal | Create goal | It names what the press makes. |
| 7 | Preview, Create will make | New goal summary card | Create will make · This will create · You are creating | This will create | Reads as a sentence. "Preview" goes. |
| 8 | Change | Inline edit link | Change · Edit · a pencil icon only | Change | One word for every edit. "Edit Description" and "Edit Path to Green" become "Change". |
| 9 | Its own date, This goal's date, The parent's date | Sub-goal date choice | Its own date / The parent's date · Own date / Parent's date · Set a date / Same as parent | Its own date / The parent's date | Already plain; one pair on both screens. |
| 10 | shares XW-0012 | Sub-goal date line | shares XW-0012 · via XW-0012 · with XW-0012's Promotion Milestone | shares XW-0012 | Short, and the tooltip names the Promotion Milestone. |
| 11 | New Date Type: | Promote panel | New Date Type: · Moves up to: · Becomes: | Moves up to: | A promotion moves the date up one Date Type (§6.1). |
| 12 | Needs you, Nothing needs you now | Goal page, top | Needs you · Your turn · To do | Needs you | Chelsea's canvas word. |
| 13 | Family | Goal page side panel | Family · Related goals · Above and below | Related goals | "Family" is cute but unclear for siblings and backs. |
| 14 | Activity (All, Comments, Changes) | Goal page stream | Activity · History · Comments and changes | History | SPEC.md §6.6 calls every change an Event in the goal's history. |
| 15 | Properties, All properties, More properties | Goal page side panel | Properties · Details · Fields | Details | New goal already says "Details". One word for both screens. |
| 16 | Health judged on | Goal page side panel | Health judged on · Judged against · Committed date | Health judged on | It says what the date is for. |
| 17 | operated by | Work page, an agent's operator | operated by · run by · for | run by | Plainer. |
| 18 | Written | New goal summary, Description | Written · Added · Yes | Added | "Written" reads as past action, not a value. |
| 19 | Could not check | New goal rail | Could not check · Could not check. Try again. · Check failed | Could not check. Try again. | It says what to do. |
| 20 | no health (screen reader only) | Health marks | no health · Health: None · health not set | Health: None | The screen already says None for no health. |
| 21 | Home | Top bar tab | Home · Priorities | Home | The page heading already says Priorities; Home is the canvas word. |
| 22 | waiting on an owner, past | Home cards | waiting on an owner · needs its owner · overdue | waiting on an owner | Says who acts. |
| 23 | late, today | Work item due date | late · past due · overdue | past due | The Needs you line already says "past its date". |

## Kept as plain controls

Earlier, Later, Today, Zoom in, Zoom out, Cancel, Save, Remove, Open, Close (a fold), Search goals, Show all, Show older. These are controls, not domain words. They need no pick.

## No longer on screen

From U11 and N9: Every check passes, checks to fix, More fields, Excaliwire (as everyone), + Add (alone).
