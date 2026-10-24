# Goal page and goal creation: engineering plan

**Status:** Complete: part 1 (the contract and the split) and part 2 (rules, tests, coordination).

**Date:** 2026-10-24

**Owner:** Chelsea

This plan builds [the product spec](../product/goal-page-and-create.md) and [the design](../design/goal-page-and-create.md): MLP 3 (the goal page), MLP 4 (New goal and sub-goals), work items, and the build team's own queues.
The contract is the types in [server/src/api.ts](../../server/src/api.ts), added in the same commit as this file. The Backend Engineer owns that file from now on. A change to it is announced to the Frontend Engineer before it lands.

## Bad news first

1. One save writes up to four kinds of row: a goal, its Promotion Milestone, its sub-goals, and work items. `write()` takes one command. The batch is a new module that calls `write()` once per command inside one `inTransaction()`. `write()` itself gains only the `comment` op.
2. Rules are checked after each command, not at the end of the batch. So the commands of a create must come in a fixed order (below). The app sends them in that order. The server rejects a batch out of order with a named rule, so a wrong order cannot store a bad goal.
3. Live updates (ADR 0007) are in this plan for the build team's queues only. The goal page and Home stay load-once in this Feature (product spec §5 item 6). SSE fits one process and one route. It is the last backend step, so nothing else waits on it.
4. A seat writes to the live deployment only with a verified agent token (ADR 0005). Each seat is an agent actor that needs an app id from the issuer. Until a seat has one, it writes through the local preview with a test token. Part 2 has the steps.

## Decisions

Taken on my recommendation, under Chelsea's standing rule.

| # | Decision | Why |
| --- | --- | --- |
| E-1 | One write route, `POST /api/commands`, with a list of commands run in order in one transaction. | One home for HTTP to write mapping. The MCP route (ADR 0004) reuses the same handler. |
| E-2 | A create names itself with a ref ("$goal", "$milestone"). A later command uses the ref as an id or as a field value, and the server puts the key there. | `nextId` owns the key prefix. The app must not guess keys. |
| E-3 | Work item keys are `WI-0001`, padded to 4 digits like goal keys. | Done-when 25. One key format. |
| E-4 | A comment is a `write()` op: it appends one Event with field `comment`, old null, new the text, reason the text. No row changes, no version check. Any actor who may read the entity may comment. | SPEC.md §4 and §6.6: a comment is an Event, not an entity. |
| E-5 | A create in state In Progress is stored as a create in Backlog, then a state Event to In Progress, in the same batch. The batch module expands it. The app sends one create. | DD2, and the §7.2 lifecycle holds with no exception in rules.ts. |
| E-6 | D1 is keyed on the goal's type: a goal of type `Milestone (Commit)` is Committed without a Pencil plan. | A rule that does not depend on which goal points at it, so the order of a batch does not change the answer. |
| E-7 | D2 is stored as null `due_date` and `date_type` on a sub-goal. goal.ts resolves a goal's date, Date Type, Promotion Milestone, and plan from the nearest ancestor that has them. rules.ts and every view read that one function. | One home. A parent's slip or promotion reaches its sub-goals with no second write. |
| E-8 | The Path to Green is stored as `PathToGreen` (steps, criteria, trigger). Home's `ApiGoal.ptg` stays the first step, read from it. | D6. Home does not change shape. |
| E-9 | The server sets `counted` on each `ApiGoal` (the goals the Committed dates card counts). The app's `filter.ts` reads it and keeps no rule of its own. | The blocks finding from the 973b8ca check. It is fixed first, because the goal page's sub-goal cards reuse Home's parts. |
| E-10 | The API writes only goals and work items in the MLP. Any other kind in `POST /api/commands` answers 400. | Smallest surface. Actors, org units, and settings stay seed and CLI writes. |
| E-11 | Drafts are not in this Feature (product spec §5 item 2). The goal page reserves the slot only. | Scope. |

## The contract

Every type is in [server/src/api.ts](../../server/src/api.ts). Routes:

| Route | Answers | Notes |
| --- | --- | --- |
| `GET /api/goals/:id` | `GoalPageResponse` | 404 `ApiError` for no such goal. A Deleted goal answers as any goal. |
| `GET /api/options` | `FormOptions` | For New goal, + Sub-goal, + Work item. Defaults and choices come from owner settings, else SPEC.md §6.1 and §12 defaults. |
| `POST /api/commands` | `CommandsResponse` | Body `CommandsRequest`. 200, 409 stale or exists, 422 invalid, 404 not_found, 400 bad_command, 403 unknown_actor. |
| `GET /api/work` | `WorkResponse` | `?owner=<actor id>` for one queue. Without it, every work item: the team view. |
| `GET /api/events` | Server-Sent Events | ADR 0007. `id` is the sequence, `data` is one `ApiEvent`. `Last-Event-ID` resumes. Every route is behind the actor gate (ADR 0005). |

### Create order in one batch

The app sends a create in this order. Each line is one command.

1. For each Promotion Milestone in the save (this goal's, then each sub-goal's own): `create goal`, ref `$m`, `$m1`, ..., type `Milestone (Commit)`, `date_type` Committed, no parent.
2. This goal: `create goal`, ref `$goal`, `promotion_milestone: "$m"` when uncommitted.
3. This goal's milestone joins it as a sub-goal: `update goal`, id `$m`, `base_version: 1`, `parent: "$goal"`.
4. Each sub-goal: `create goal`, ref `$s1`, ..., `parent: "$goal"`. A sub-goal that takes this goal's date sends no `due_date`, `date_type`, or `promotion_milestone` (E-7). A sub-goal with its own milestone names `$m1` and then has a step 3 of its own.
5. Each work item: `create work_item`, `goal: "$goal"` or `"$s1"`, reason "Filed".

`+ Sub-goal` on a goal page is step 4 alone, with `parent` the page's goal. `+ Work item` is step 5 alone.

### Edits from the goal page

Each panel is one batch of one `update goal` command, with `base_version` from `goal.version`, the changed fields, and the reason. Health with its PTG, a slip with health and PTG, a promotion, a close, and Pursue are each one command. A Promote of Fantasy to Ambition is two: `create goal` for the new milestone (`$m`), then the `update goal` that sets `date_type` Ambition and `promotion_milestone: "$m"`.

## The split

Two engineers never edit the same file.

| Backend Engineer owns | Frontend Engineer owns |
| --- | --- |
| `server/src/` (all, including api.ts from now on) | `server/web/src/` |
| `server/seed/excaliwire.json` | `server/web/fixtures/` until backend step B3 lands, then the Backend Engineer regenerates them |
| `server/tests/` except `test_web_*` | `server/tests/test_web_*.py` |
| `CONTRIBUTING.md` route lines | `server/web/vite.config.ts` (serving the new fixtures), `docs/design/interaction-rules.md` rule moves (G and N rules) |

New server modules, one kind of work each:

| File | Work |
| --- | --- |
| `server/src/commands.ts` | The batch: refs, the E-5 expansion, order, one transaction, `WriteResult` to `CommandsResponse` and the HTTP status. The MCP route will call it. |
| `server/src/goalpage.ts` | `goalPage(db, id, me, today)`: one read per kind into Maps, then the response. No query per row. |
| `server/src/options.ts` | `formOptions(db, me, today)`. |
| `server/src/work.ts` | `workQueue(db, me, today, owner?)`. |
| `server/src/live.ts` | The SSE route and the after-commit notice from the write path. |

## Build order

Backend:

1. **B0.** `counted` on `ApiGoal` (E-9). `ptg` read from the new shape (E-8). Tell the Frontend Engineer when it lands.
2. **B1.** `server/src/commands.ts` and `POST /api/commands`: refs, order, E-5, the HTTP map. The `comment` op in write.ts (E-4). `field` on violations. Work item keys `WI-0001` (E-3).
3. **B2.** Rules: D1 as E-6, D2 as E-7, the PTG shape (D6), work item rules (D7, D8; part 2 lists them).
4. **B3.** `GET /api/goals/:id` and `GET /api/options`. Then generate the fixtures in `server/web/fixtures/` from the seed, with a test that compares them (as `test_fixture.py`).
5. **B4.** Seed: `work_items` on, the seats as agent actors (operator Chelsea), and their queue work items under the XW-0003 sub-goals. `GET /api/work`.
6. **B5.** `GET /api/events` (SSE) and the after-commit notice.

Frontend, against fixtures first:

1. **F0.** Fixtures by hand from api.ts: `goal-XW-0003.json`, `goal-XW-0001.json` (RED, with a PTG), `options.json`, `work.json`. Serve them in dev from vite.config.ts at the same paths as the routes.
2. **F1.** Routes in the app: `/goals/:id`, `/goals/new`, `/work`. On Home, a goal's title links to its page (rule 19 change), and New goal in the toolbar. When B0 lands, filter.ts reads `counted` and drops its own rule.
3. **F2.** The goal page, read only: header with the judged date (G1 to G7), Fields, Description, sub-goal cards, work items by status, Comments and History.
4. **F3.** The panels as batches: health and PTG, Record a slip, Promote date, Close goal, Pursue, Fields, Description, Comment. The stale-write card (design States table) on a 409.
5. **F4.** + Sub-goal and + Work item, the work item row tick and its reason.
6. **F5.** New goal (N1 to N16) with the create order above.
7. **F6.** `/work`: My work (one actor's queue by status) and the team view (every queue). It subscribes to `/api/events` once B5 lands and reloads `/api/work` on a work item Event.

Until B1 lands, the Frontend Engineer builds every save as a `CommandsRequest` and posts it. The dev server answers it with a fixed 200 from `server/web/fixtures/commands-ok.json`, so the panels can be built against the shape.

## Rules

Every rule lives in [server/src/rules.ts](../../server/src/rules.ts) and returns a named violation with the `field` it points to. The app shows the message at that field. It must not check a rule itself.

Changed rules:

| Rule | Change | Source |
| --- | --- | --- |
| `committed-needs-pencil` | A goal of type `Milestone (Commit)` is exempt (E-6). | D1 |
| `date-and-date-type` | A sub-goal with null `due_date` and `date_type` passes when an ancestor has both (E-7). The rest of `checkGoal` reads the resolved date, Date Type, Promotion Milestone, and plan from goal.ts. | D2, DD3 |
| `promotion-milestone` | Checked against the resolved values, so a sub-goal that takes its parent's uncommitted date shares the parent's milestone. | D2 |
| `ptg-when-yellow-or-red` | The PTG must be the `PathToGreen` shape: at least one step, each step with text, a human owner, and a real date, and criteria that are not empty. | D6, §6.1 |

New rules:

| Rule | What it rejects | Where |
| --- | --- | --- |
| `completed-on-time` | A move to Completed after `original_committed_date`, or to Completed Late on or before it. `checkTransition` takes today as an argument, so it stays pure. | §7.2 |
| `promotion-new-milestone` | A promotion from Fantasy to Ambition that keeps the old Promotion Milestone. | §5 |
| `work-items-off` | Any work item write while the owner setting `work_items` is off. | D7, §13 item 26 |
| `work-item-status` | A status not in Backlog, In Progress, Completed, Deleted. | D8 |
| `real-date` | A work item `due_date` that is not a calendar date (the existing rule, extended). | §6.7 |
| `reason-required` | Extended: a work item change to `status`, `owner`, or `due_date` needs a reason (`REASONED.work_item`). A create sends "Filed". | §6.6 |
| `agent-own-work-items` | An agent writing a work item that it does not own before and after the write. An agent may file a work item for itself. | §6.7, story 29 |
| `comment-text` | A comment with no text. | §6.6 |
| `api-kind` (bad_command) | A command for a kind other than goal or work_item (E-10). | E-10 |
| `unknown-ref` (bad_command) | A ref used before the command that creates it. | E-2 |

Lints, flagged and never blocked, come back in `GoalPageResponse.hints`: the summary lint, a description missing a §6.1 part (a) to (d), a YELLOW with no trigger, a PTG step with no owner or date when the goal has since returned to GREEN, and a missing Work Product on an in-progress `Milestone (Launch)`.

The design's rail check "sub-goal dates on or before this goal's" has no rule in SPEC.md. The rail must not show it (see Coordination).

## Checking before Create

The New goal rail (N11, N12) shows the rules the server will check. The app must not hold a copy of them (ADR 0010). So `CommandsRequest` gains `check?: true`. With it, the server runs the batch, rolls it back, and answers the same `CommandsResponse`: the violations, or `ok` with the keys it would make. The rail calls it 400 ms after the last change. "Create XW-0012" reads its key from that answer. The Backend Engineer adds `check` to api.ts in B1.

## The Path to Green

Stored in `path_to_green` as `PathToGreen` (api.ts): `{ steps: [{ text, owner, date }], criteria, trigger? }`. The seed already uses this shape. `firstStep` in priorities.ts drops its string branch. Home's `ApiGoal.ptg` stays the first step. On a return to GREEN the goal page sends `path_to_green: null`. The Event keeps the old PTG, so it is in the history (§6.1 "archived into history").

## Work items

The `work_item` table and its fields stay as they are. The owner setting `work_items` (boolean, default off) sits in `owner_settings.settings`. The seed turns it on for Excaliwire. With it off, `GoalPageResponse.workItems` and `FormOptions.workItems` say so, and every work item write is rejected. A work item's Events are read on the goal page with the goal's, newest first, each with its `entity`. A work item has no page.

## The build team's queues

This is the same entity, so it costs data and one read route:

- **Seats are agent actors.** The seed adds one agent actor per seat (Chief of Staff, Product Manager, Product Designer, Head of Engineering, Frontend Engineer, Backend Engineer, QA, User Researcher), with operator `chelsea`. Only the GOALIE owner writes actors (`owner-writes-actors`), so those seed writes are made as `tig`.
- **A task is a work item** owned by its seat, with `goal` the XW-0003 sub-goal it serves (XW-0005 to XW-0011), and status Backlog, In Progress, or Completed.
- **My work** is `GET /api/work?owner=<seat>`, grouped by status in the app. **The team view** is `GET /api/work`, grouped by owner, then status.
- **Live status** fits ADR 0007 with no change. `live.ts` keeps the open SSE connections. The batch module calls `publish(events)` after the outer COMMIT and never before, so a rolled-back write is never sent. A new connection gets every Event after `Last-Event-ID` from the log, then the live ones. A comment line every 15 seconds keeps the host proxy from closing an idle stream. Limit: a write from `cli.ts` runs in another process and is not pushed. The CLI is for local use only, so the seats write through the API.
- **Seat tokens.** An agent token is verified like any other (ADR 0005) and maps by its app id to one agent actor. On the local preview, `server/tests/sign_token.mjs` signs one per seat (claims `idtyp: "app"`, `azp: <seat app id>`), and the seed sets each seat's `app_id` to match. On goalie.excaliwire.com each seat needs an app registration with the issuer, and its `app_id` written on its actor row by the GOALIE owner. That is host work in excaliwire/operations. The queues run on the preview until it is done.

## Stale writes

Every `update` names `base_version` from the row it read. On a 409 the answer carries `current`, the stored row.

- The open panel keeps every typed value.
- A card at the top of the panel says "Someone saved this goal after you opened it."
- Under each field the panel changed, the current value shows in `--mute`.
- The panel takes `current.version` as its new `base_version`. Save again writes the typed values over the current row, and the rules still run.
- The page reloads `GET /api/goals/:id` after any 200, so every section shows the stored state.

A create never goes stale. A batch's step 3 (`base_version: 1` on a milestone made in the same batch) is always current.

## Test plan

Test first: each test fails on the old code, then passes ([AGENTS.md](../../AGENTS.md)). Server tests are Python in `server/tests/`, against a seeded store, and with the live server where a route is under test.

| Step | Test file | What fails first |
| --- | --- | --- |
| B0 | `test_priorities_api.py` | `counted` is true only on top-level In Progress goals above the cut line. `ptg` is the first step of the new shape. |
| B1 | `test_commands_api.py` (new) | A batch of a Fantasy goal, its milestone, and two sub-goals stores 4 goals or none. A ref resolves. A ref used before it is made is `unknown-ref`. Each `WriteResult` maps to its HTTP status. A stale update answers 409 with `current`. `check: true` stores nothing. A create In Progress writes a Backlog Event, then a state Event. A comment is one Event with old null. A work item key is WI-0001. |
| B2 | `test_write_path.py` | D1, D2, the PTG shape, `completed-on-time`, `promotion-new-milestone`, and each work item rule. Each rule rejects with its name and field. |
| B3 | `test_goal_page_api.py`, `test_options_api.py` (new); `test_fixture.py` | XW-0003 answers its judged date first (XW-0004 Nov 6), `inherited` false, 7 sub-goal cards under XW-0004, and Events newest first. A missing key is 404. The fixtures equal the seeded answers. |
| B4 | `test_work_api.py` (new), `test_seed.py` | The seats are agent actors with operator chelsea. `?owner=` returns only that seat's items. |
| B5 | `test_events_stream.py` (new) | A write after connect arrives within 1 s. A reconnect with `Last-Event-ID: n` receives every Event after n, in order. A rolled-back batch sends nothing. |
| F0 to F6 | `test_web_model.py` | The pure parts in `server/web/src/model/`: the panel-to-batch builders (each panel's `CommandsRequest`, the create order with refs), the stale merge (typed values kept, `current` beside them), and grouping work items by status. |

Before reporting a screen, the Frontend Engineer renders it at 1440, 1100, and 390 px and looks (playbook). The commands are in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## SPEC.md impact

A behavior change and its SPEC.md change land in the same commit ([AGENTS.md](../../AGENTS.md)). The Backend Engineer makes these SPEC.md edits with the rules that change behavior:

- §5 and §6.1 `plan_maturity`: a `Milestone (Commit)` is Committed without a Pencil plan; its plan is its parent's (D1).
- §6.1 `due_date` and `parent`: a sub-goal with no date of its own takes its parent's date, Date Type, Promotion Milestone, and plan (D2, DD3).
- §6.7 and §12: the work-item status list (D8) and the owner setting `work_items` (D7).

`tests/test_conformance.py` pins SPEC.md line numbers. An edit that moves lines must update those numbers in the same commit, or the shared tests fail.

## Coordination

1. **api.ts.** The Backend Engineer owns it. B1 adds `check` to `CommandsRequest`. Any change is sent to the Frontend Engineer before it lands.
2. **Fixtures.** The Frontend Engineer writes them by hand until B3. From B3 the Backend Engineer generates them from the seed, and `test_fixture.py` holds them to the API.
3. **Violation fields.** Each rule sets `field` to the §6.1 field name. A rule about a batch row also names the command index (`at`). The app places the message by both.
4. **The rail.** It shows only what `check: true` returns. The Product Designer drops "sub-goal dates on or before this goal's" from N11, because no rule backs it. The Chief of Staff tells the Product Designer.
5. **Home rule 19.** A goal title links to its page, and the count chip alone opens the tree. The Frontend Engineer moves the rule in interaction-rules.md with the change.
6. **Today.** Every route takes today from `configuredToday(db)` in config.ts. Nothing reads the clock elsewhere.
7. **Merging.** Each engineer pushes their branch; the Chief of Staff merges into chelsea/mlp after B1, B3, and B5, and the Frontend Engineer merges chelsea/mlp before F3 and F5.
