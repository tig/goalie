# MLP review

**Status:** Round 3 recheck at 2b58281, no blocks

**Date:** 2026-10-25

**Owner:** Chelsea

This is the review list for pull request #52 (XW-0003 MLP). It is overwritten each round. Earlier rounds are in this file's git history.
Round 3 read chelsea/mlp at 1eabb80: the goal page fixes from 5087caa, New goal (F5), and the Work items page (F6).
Reviewers: Codebase QA (lead), Frontend QA, and the User Researcher. Each ran an own server from the pinned review worktree, on a seeded scratch store, with GOALIE_TODAY 2026-10-24.
Out of scope: who may change a goal (a new rule is being built).
Status words: **blocks** stops the merge, **open** is a real problem with a clear fix, **decision** waits on Chelsea or Tig, **fixed** is done.

## Summary

| Status | Count |
| --- | --- |
| blocks | 0 |
| open | 10 (N1 to N9, and U11 for Tig) |
| not fixed at 2b58281 | 2 |
| fixed in part at 2b58281 | 2 |
| replaced by New goal v2 | 3 |
| decision | 3 |
| fixed | 36 |

All three blocks from 5087caa are fixed: + Sub-goal saves, Promote saves, and every change needs a reason.
At 2b58281 the worst open items: 4 of 6 saved lines on the goal page are dropped before anyone sees them (N1, U3); the top-bar links are 34 px tall on touch, on every page (N2); the New goal summary hint never shows until the date is filled (N3).

## Recheck at 2b58281

2b58281 holds the Backend Engineer's fixes, the Frontend Engineer's head, New goal v2, and owners-change-goal. Each reviewer started a server per test on a free port and stopped it at the end.

- Q11: a check lists each skipped command as not-checked, with the ref it waited on. A blank milestone summary now shows 1 refusal and 3 not-checked. The app reads them as "N more checks after these".
- Q12: clearing a slip is refused: "a slip is kept. The next slip moves the date later than 2026-11-25."
- Q13: at Crayon, closesAsPromoted is null and Close offers only Did Not Meet and Deleted. At Pencil it offers Promote and close, which saved Completed, and Completed Late for a goal due Oct 20.
- Q15: "a change to Plan Maturity, Health needs a reason."
- Q16: api.ts says its exports are the contract. 2 new web exports are used only in their file: SavedAction (web/src/model/commands.ts:272) and Foundation (web/src/model/newgoal.ts:11).
- Q17: ?owner=nobody answers 404.
- Q18, F7: the Promote-made milestone has its goal as parent, lists under Sub-goals, and has its own summary.
- R15: 0 cut, overlapping, or cut-short labels in 1,065 scroll positions at 768 and 860, every zoom, first load included.
- R16, F5, F6: "1 YELLOW" answers 118x44 (was 115x13). Zoom out and Zoom in 44x44. Count chip 44x44. The chips are gone from New goal v2.
- F1: stubbed 403 and 415 answers show their reason in the panel.
- F2: a Promote from Fantasy is one row, "Promoted · XW-0012 completed".
- F3: settled. SPEC.md has no sub-goal date rule; the rail line is gone.
- F4: "To save: 4 to go" stands at the top of the phone page from first load.
- U1: in part. The row reads "This goal's date · shares XW-0012" but not the date itself.
- U2: "Added XW-0015 under this goal." in a role=status region.
- U4 to U6: Owner "Chelsea" shows her seat, "operated by Chelsea". Her group stays in place after a save. Each row has a Status select.
- U3, not fixed: Promote shows no message (0 of 1). Cause: server/web/src/GoalPage.tsx:47 keys the goal view on the goal's version and Event count, so a save that changes either remounts it and drops the status line. + Sub-goal changes neither, so it keeps its line. Slip, close, Promote and close, and + Work item change one, so their lines are lost too. Fix: keep the status above the key, in GoalPage.
- U10, not fixed: the top-bar Home and Work items links are 34 px tall with no 44 px area on touch (server/web/src/styles.css:29, .tab; no pointer:coarse rule names it). On every page. Also under 44 by the User Researcher's probe: the COMPLETED fold 326x32, Details "Change" 48x28 and 48x14, "+ Add" 36x28, "What Type means" 44x22. Frontend QA measured 0 under 44 on New goal with Details closed; the two probes agree on the closed page except the top bar.

New at 2b58281:

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| N1 | open | server/web/src/GoalPage.tsx:47 | U3's cause: a save that changes the goal's version or Event count drops its saved line. 4 of 6 save lines are never seen | Hold the status in GoalPage, above the keyed Goal |
| N2 | open | server/web/src/styles.css:29 | Top-bar .tab links are 34 tall, no 44 px area on touch, on every page | Add .tab to the pointer:coarse ::after rule |
| N3 | open | server/web/src/NewGoal.tsx:127 | NF2: the summary hint never shows until Date and Date Type are filled. The server sends it ("A good summary has a verb and 5 words or more." for "Ship"); the app asks for a check only when the form is ready | Ask for the check once Summary is left, or show the hint from its own check |
| N4 | open | server/web/src/NewGoal.tsx (rail) | NF14: after State In Progress and YELLOW, "To save" does not list the Path to Green: "3 to go: Date, Date Type, Priority, or None" | List the Path to Green once health is YELLOW or RED |
| N5 | open | server/web/src/NewGoal.tsx | NF15: at 390, a Create press with only Summary filled turned nothing red and scrolled nowhere. With a Fantasy date and no milestone date it scrolled to the field, with no line under it. Frontend QA saw the lines at their fields with Date and Date Type missing | Show the field's line in place after every press |
| N6 | open | goal page header | A goal created in Backlog reads "In Progress since Oct 25" under the date bar (2 of 2) | "Backlog since Oct 25", or nothing until it is pursued |
| N7 | open | server/web/src/data.ts:44 | A reply that is not JSON (stubbed 502 text/html) shows "Unexpected token '<' … is not valid JSON" in the panel | Catch the parse and show the status text, as data.ts:13 does |
| N8 | open | New goal | One check request answered 409 in the phone run. Nothing on screen said so; Create still saved. I have not reproduced it | Log the request and its answer when it recurs |
| N9 | open | words | New words for Tig, from New goal v2: "Needed to save", "How firm is the date?", "To save: N to go", "Ready to create", "Change", "+ Add", "Create goal", "operated by". "no health" (screen-reader text) and "Pursue" as a button are not in SPEC §4 | Tig picks the words, in SPEC.md |

Standing checks at 2b58281 (clean copy, Node v22.22.3):

- npm ci exit 0, 0 vulnerabilities. Lint and typecheck exit 0. Build twice identical.
- JS 333.72 kB (gzip 99.57), up from 326.19 (97.18) at 1eabb80. CSS 46.55 kB (gzip 10.48), up from 42.49 (9.74).
- Server suite three times: 380 OK in 113.5, 109.0, and 105.8 s. Shared 88 OK, 46 skipped. Guidance: the known macOS failure only. agent_forms exit 0.
- New tests fail on 1eabb80 and pass on 2b58281: test_commands_api 2 failures, 1 error; test_write_path 3 failures; test_work_api 3 failures, 1 error; test_goal_page_api 1 failure; test_web_batches 2 failures, 2 errors; test_goal_permissions 24 failures, 4 errors; test_web_model fails on its import.
- Goal page at 3,000 sub-goals, comments, and work items: 108 to 168 ms (was 147 to 208), 11 prepares, still 4,327 KB (D1). Home 53 to 63 ms. Work queue 23 to 26 ms.

Not checked at 2b58281: + Add inside Details for sub-goals and work items (NF13), the 960 px layout switch (NF7), the Status select's reason on Work items, keyboard, contrast, a real screen reader, dark mode, live update, and Ambition to Committed from the app.

## Rechecks from 5087caa

| # | Status | Evidence |
| --- | --- | --- |
| R1 | fixed | + Sub-goal: 3 of 3 saved from the app (on the parent's date, own Fantasy date with its milestone, a later date). test_web_batches posts the real batch: 6 errors and 1 failure on 5087caa, OK on 1eabb80 |
| R2 | fixed | Promote, Fantasy to Ambition: one save completed the met milestone, made the next one In Progress, and set Ambition |
| R3 | fixed | A reason on every change. Description, Plan Maturity, and summary with no reason or a blank reason: 422 reason-required. 8 of 8 panels show the refusal at the Reason field |
| R4 | fixed | text/plain and form-urlencoded: 415. Origin evil.example and "null": 403. Same origin and no Origin: 200 |
| R5 | fixed | A 300 KB body: 413. A 10,001-character comment: 422. 10,000 characters: 200 |
| R6 | fixed, gap in Q12 | A slip to Nov 1, or to the due date Nov 15: 422. Nov 20: 200 |
| R7 | fixed | Blank summary and blank title: "Summary is required.", "Title is required." |
| R8 | fixed, gap in Q15 | required-field messages in SPEC words: "Type is required." |
| R9 | fixed | dateIn speed. Home 2, 20, and 60 to 128 ms at N = 100, 1,000, 3,000 (was 6, 51, 155) |
| R10 | fixed | GOALIE_TODAY "nope" and 2026-02-30 stop the server with a message, exit 1 |
| R11 | fixed in part | Exports used in one file: 8 left (was 11), in Q16 |
| R12 | fixed, gap in Q13 | G15 closesAsPromoted: Completed for a goal due Dec 1, Completed Late for one due Oct 20. Promote and close saved with the plan at Pencil |
| R13 | fixed | N6a: a New goal In Progress makes its milestone In Progress with the goal's health and Path to Green. A Backlog goal's milestone is Backlog |
| R14 | fixed at 2b58281 | A check reports every rule of one command, but not of a command under a refused create (Q11) |
| R15 | fixed at 2b58281 | Edge labels cut. At 768 px on first load, "Promotion Milestone Nov 6" is cut by 29 px. Months zoom: 6 of 122 scroll positions cut a label at 768, 1 of 119 at 860. Weeks: 5 of 124 and 1 of 122. Quarters: 12 of 242 and 1 of 236 |
| R16 | fixed at 2b58281 | Meter touch areas. The meter is fixed (108x44 per segment at 390). On the Committed dates card, "1 YELLOW" answers 115x13: the "?" area above and the meter area below cover it. "1 RED" and "1 GREEN" answer 26 tall |
| R17 | fixed | Work items page: the first In Progress heading is at y 184 (1440) and y 212 (390). Late reads "Oct 22 late" with the word |
| R18 | fixed | New goal at 390: Create is a 358x48 bar fixed at the bottom at every scroll. Inputs, selects, and the date are 44 tall |
| R19 | fixed | Empty reason: refused by the server and shown at Reason in 8 of 8 panels. The app does not check rules (ADR 0010), so this holds |
| R20 | unchanged | The "Chelsea | Excaliwire" Owner pair matches W2 as written. See U4 |

## Code: QA

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| Q11 | fixed at 2b58281 | server/src/commands.ts:126 | A check skips every command that names a refused create, and the answer does not say so. New goal with a blank milestone summary lists 1 refusal. Fix it and 3 more appear on the goal: blank summary, milestone after the goal's date, no Path to Green. Work items under the goal stay unchecked until the goal passes | In a check, store a refused create anyway, so later commands still run; the check rolls back as now. Or list the skipped commands in `all` |
| Q12 | fixed at 2b58281 | server/src/rules.ts:203 | slip-moves-later is stepped around in two saves: slip Nov 15 to Nov 25, clear changed_due_date to null, slip to Nov 16. The date moved 9 days earlier (SPEC §6.1: no silent re-baselines) | Refuse clearing changed_due_date once set, or compare with the latest slip in the Event log |
| Q13 | fixed at 2b58281 | server/src/goal.ts:127 | closesAsPromoted gives a state for an Ambition goal at Crayon. The Close panel offers Promote and close, and the save is refused, committed-needs-pencil, at the panel top, at no field. A sub-goal defaults to Crayon, so this is the common case (Frontend QA hit it on XW-0014) | Return null unless the plan is at Pencil, or the panel says "Plan at Pencil first" with a link to Edit Fields |
| Q14 | fixed at 2b58281 | server/src/goalpage.ts:72 | The goal page reads its own Events twice: once for former milestones, once for history. 6,000 rows read for 3,000 comments | Read promotion_milestone Events by field, or reuse the first read |
| Q15 | fixed at 2b58281 | server/src/write.ts:156 | reason-required names code fields: "a change to health, path_to_green needs a reason.", "changed_due_date", "plan_maturity" | Use fieldWords, as required-field does |
| Q16 | fixed in part at 2b58281 | server/src/api.ts:76, 82, 88, 214; web/src/data.ts:6, 8; web/src/model/commands.ts:37, 111 | 8 exports used only in their own file: ActorKind, GoalRef, WorkProductLink, ApiCommand, Loaded, getJson, MetMilestone, GoalTypes | Drop export, or say in api.ts that contract types are exported on purpose |
| Q17 | fixed at 2b58281 | server/src/work.ts:12 | GET /api/work?owner=nobody answers 200 with 0 items. A wrong link reads as an empty queue | 404 for an owner that is not an actor |
| Q18 | fixed at 2b58281 | server/web/src/model/commands.ts:53 | Promote makes the next Promotion Milestone with no parent. New goal gives its milestone the goal as parent. The User Researcher found XW-0021 in neither Sub-goals nor Home: only the header link reaches it | Set parent to the goal in promoteToAmbition, as createBatch does |

## Experience: Frontend QA and User Researcher

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| F1 | fixed at 2b58281 | server/web/src/GoalPanels.tsx:36 | A refusal that is not invalid or stale shows nothing. A 403 {error, reason} left the panel open and silent: it reads body.message, which 403, 413, and 415 answers do not have | Show body.reason when body.message is absent |
| F2 | fixed at 2b58281 | server/web/src/GoalPage.tsx:445 | A Promote shows in History as "Created · Ambition None “Plan drafted”". GP7 says "Promoted · XW-0013 completed". The batch holds a create, so it takes the Created form; "None" is the new milestone's empty date | Test for a Promote batch before the created branch |
| F3 | fixed at 2b58281 | server/src/rules.ts | A sub-goal dated after its parent is accepted: XW-0016 Mar 1, 2027 under XW-0003 Nov 30, 2026. The New goal rail (N11) lists "sub-goal dates on or before this goal's" | Add the rule, or drop the line from N11 |
| F4 | fixed at 2b58281 | server/web/src/NewGoal.tsx:192 | On a phone the one-line checks count shows only after a refused Create, not as the rail's standing summary (NG6) | Draw it whenever the rail has an answer |
| F5 | fixed at 2b58281 | server/web/src/styles.css:283 | Rule 29: Zoom out answers 30x44, Zoom in 40x44 (their ::after areas overlap). The count chip answers 39x26 at 1100 and 40x22 at 390 | 44 by 44 each, no overlap |
| F6 | fixed at 2b58281 | server/web/src/styles.css:409 | .fchip is 28 tall with no 44 px area on touch. The 4 Description chips on New goal answer 81x28 | A 44 px ::after on touch |
| F7 | fixed at 2b58281 | Promote, New goal | A Promote-made milestone has the same summary as the one it replaces: 2 goals on one page named "Commit a date for Launch the pilot with a second company" | Default a different summary, or ask for one |
| U1 | fixed in part at 2b58281 | goal page, sub-goal row | A sub-goal on "This goal's date" stores no date, as SPEC §6.1 allows, but its row shows only "Backlog" and a hollow circle. Read as no date, against USERS_MANUAL rule 2 (3 of 3) | Write the parent's date and "shares XW-nnnn" on the row |
| U2 | fixed at 2b58281 | goal page, + Sub-goal and Promote | No saved message: 0 of 3 saves had role=status or aria-live text, and nothing named the new key | A one-line live status: "Added XW-0020 under this goal" |
| U3 | not fixed at 2b58281 | goal page, Promote panel | "create the next Promotion Milestone and link it" does not name the key | Name it after the save, in U2's status |
| U4 | fixed at 2b58281 | Work items, Owner "Chelsea" | Shows 1 item (hers) and hides her seat Frontend Engineer's 3. Only "Excaliwire" shows them, mixed with Tig's. Nothing says the seat is operated by Chelsea | Add the seats a person operates to that person's filter; write "operated by Chelsea" on the agent's group |
| U5 | fixed at 2b58281 | Work items, after Completed | Completing Chelsea's only item moved her group from the top to the bottom, about 700 px away at 390 | Keep the group in place after a save |
| U6 | fixed at 2b58281 | Work items | Only Completed can be set here: 0 controls for Backlog to In Progress, and no + Work item | A status control per row, or say status changes on the goal page |
| U7 | replaced by New goal v2 | New goal, 390 | Create with no date shows "Choose a date and a Date Type." under Summary, about 500 px above the date | Show it at the Date card |
| U8 | replaced by New goal v2 | New goal | Create looks the same with 2 checks failing; only small red "2 checks to fix" says no. "an In Progress goal has a health." reads as a statement | Draw Create as unavailable while checks fail; "Choose a health for an In Progress goal." |
| U9 | replaced by New goal v2 | New goal, Description chips | A description with all 4 parts left the 4 chips unchecked, and the goal page still says "Add who shares responsibility" | Light a chip only from a real check, or call them prompts |
| U10 | not fixed at 2b58281 | New goal 390, Work items 390, goal page 390 | Drawn boxes under 44 in one dimension: 23, 19, and 24 controls. Smallest: 18x18 "What … means" buttons, 16x16 checkboxes, 28x28 Edit pencils, 26 high tabs and owner chips, 17 high goal links. The ::after hit areas are not measured | 44 px hit areas on touch, measured by elementFromPoint |
| U11 | open | New goal, Work items | Words not in SPEC §4 or USERS_MANUAL.md: "Excaliwire" as everyone, "Create will make", "Preview", "Every check passes", "checks to fix", "This goal's date", "Its own date", "shares XW-nnnn", "More fields", "late" on a work item, "no health" read aloud, "New Date Type" | Tig picks the words, in SPEC.md |

## Decisions

| # | Status | Question |
| --- | --- | --- |
| D1 | decision | History paging. The goal page sends every Event of the goal, its milestones, and its work items: 4,327 KB and 147 to 208 ms at 3,000 sub-goals, 3,000 comments, and 3,000 work items (18,019 rows). Was 1,241 KB at 3,000 comments in 5087caa. Lean: page it, newest first; the page size is the deciding number and I have not measured one |
| D2 | decision | Visibility values. Any text is stored ("banana"). Lean: a fixed list in SPEC §6.1 |
| D3 | decision | Health on close. Completed Late keeps its health. Lean: one rule for Completed and Completed Late |

## Standing checks

On a clean copy of 1eabb80 (git archive), Node v22.22.3 (package.json asks for 24):

- npm ci exit 0, 0 vulnerabilities. Lint exit 0. Typecheck exit 0.
- Build twice: identical, diff -r exit 0. JS 326.19 kB (gzip 97.18), up from 293.01 (88.90) at 5087caa. CSS 42.49 kB (gzip 9.74), up from 34.77 (8.31).
- Server suite three times: 342 tests OK in 112.9, 112.0, and 109.4 s. At 5087caa: 283 tests in about 85 s. No flaky or clock-bound test in 3 runs.
- Shared tests: 87 OK, 45 skipped. Guidance: 10, 1 known macOS failure (test_map_sends_the_paid_file_to_the_repo_root). agent_forms check: exit 0.
- New tests fail on 5087caa: test_commands_api 5 failures and 3 errors, test_write_path 6 failures, test_web_batches 1 failure and 6 errors, test_goal_page_api 1 failure and 2 errors. All pass on 1eabb80.
- Prepares per call: Home 6, goal page 10, work queue 3, options 26, comment 5. Work queue at 3,000 items: 25 to 35 ms, 445 KB.
- Live stream: 50 of 50 burst writes seen; a Last-Event-ID replay of 51 in order.

## Not checked

The oauth2-proxy cookie SameSite setting in production. Who may change a goal. Dead CSS. The app on Node 24. A priority edit: no panel opens from the goal page. Keyboard, contrast, a real screen reader, and dark mode. Live update between two browsers. A stale save. Ambition to Committed from the app. Widths other than 390, 768, 860, 1100, 1280, and 1440.
