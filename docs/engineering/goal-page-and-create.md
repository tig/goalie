# Goal page and goal creation: engineering plan

**Status:** Part 1 (the contract and the split). Part 2 follows in this file.

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

## Part 2

Part 2 follows: the rules and SPEC.md impact, the test plan, the PTG reshape, the work item rules, the stale-write UX, the seats' tokens, and what the engineers must coordinate.
