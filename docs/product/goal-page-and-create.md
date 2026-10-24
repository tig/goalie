# Goal page and goal creation

**Status:** Proposed

**Date:** 2026-10-23

**Owner:** Chelsea

This is the product spec for MLP 3 ([#50 (MLP 3: Open a goal and keep it true)](https://github.com/tig/goalie/issues/50)) and MLP 4 (Create a goal or a sub-goal, issue text in Appendix A).
Parent: [#47 (XW-0003 MLP)](https://github.com/tig/goalie/issues/47). Plan: [docs/release-plan.md](../release-plan.md) §3 priority 1 and §5 Epic 1.
The starting point is the Product Designer's flow review of 2026-10-23 with the User Researcher's walk (wireframes 04 to 13, canvas boards Goal and NewGoal).
The contract is [SPEC.md](../specs/SPEC.md). This spec does not restate it.

## Bad news first

1. Nobody can create a Fantasy or Ambition goal under today's rules. Its Promotion Milestone must be Committed ([SPEC.md §5](../specs/SPEC.md#s5)). A Committed goal needs a Plan at Pencil ([§6.1](../specs/SPEC.md#s6-1), `committed-needs-pencil` in [server/src/rules.ts](../../server/src/rules.ts)). So the date for a date also needs a Pencil plan. The seed passes only because [server/seed/excaliwire.json](../../server/seed/excaliwire.json) gives XW-0004 a Pencil plan, while #47 records that milestone on a Crayon plan. This spec takes decision D1 (Spec impact).
2. The Path to Green in the built API is one text with one owner and one date (`PtgStep` in [server/src/api.ts](../../server/src/api.ts)). §6.1 requires steps, each with an owner and a date, plus criteria and, for YELLOW, a trigger. The PTG form must not be designed on today's shape. The PTG is reshaped first.
3. There is no write route. [server/src/server.ts](../../server/src/server.ts) serves `GET /health`, `GET /api/priorities`, and the app. The write path exists ([server/src/write.ts](../../server/src/write.ts) `write()`, with versions and stale rejection) but nothing outside the server calls it. MLP 3 and MLP 4 both depend on a write API.
4. Home has no route to a goal. A row click opens or closes its sub-goals (Designer's review). The goal page is unreachable until that changes.
5. Work items are in the MLP (Chelsea, Q-C1), which pulls a slice of Stage 5 ([#12 (Epic 12: Work items)](https://github.com/tig/goalie/issues/12)) ahead of Stages 3 and 4. The store has the table (`work_item` in [server/src/store.ts](../../server/src/store.ts)), but SPEC.md §6.7 names no status values, and no rule in rules.ts checks a work item. The seed has no work items.
6. Sub-goals on the create form (Chelsea, Q-C2) make one save create up to three kinds of goal: the goal, its Promotion Milestone, and its sub-goals. Under a Fantasy or Ambition parent, each sub-goal row needs a date and Date Type of its own, which decision D2 (inheritance) gives them.

## 1. Problem

A human works between reviews on one goal: opens it, reads its fields, changes what is no longer true, and comments, with no agent present ([SPEC.md §1.2](../specs/SPEC.md#12-how-a-human-spends-time), [§8.2](../specs/SPEC.md#s8-2) "Between reviews").
Today GOALIE shows Home and nothing else. A goal owner cannot change health, a date, or a state, and cannot write the reason ([§3](../specs/SPEC.md#s3) rule 9). The release plan's Epic 1 is not met.
Nobody can add a goal. Every goal comes from the seed. The #47 tree cannot move into GOALIE, so GitHub stays the record (#47, Dogfood).
The cost: XW-0003's Promotion Milestone (the MLP running by Fri Nov 6, 2026, Committed) needs Epic 1 done. The one-minute test ([release plan §1](../release-plan.md#1-purpose)) fails at "What needs me?" when nothing can be acted on.

## 2. People

From [release plan §4](../release-plan.md#4-people):

| Who | Uses this to |
| --- | --- |
| Galahad | Create his own goal and keep its health true. He has not used a tool like this. He is the usability test case. |
| Tig | Check a goal against the promotion rule and the §6.1 fields. Commit dates. Read the history. |
| Chelsea | Open XW-0003, see its Promotion Milestone and sub-goals, and enter the #47 tree. |
| An agent | Owns work items and changes their status ([§6.7](../specs/SPEC.md#s6-7), [§10](../specs/SPEC.md#s10) "Do the work behind a goal"). rules.ts lets an agent write a work item; a goal or a Priority only as a Draft (`agent-writes-a-draft`). Drafts are MLP 5. The goal page reserves their place. |

## 3. User stories

Open and read (MLP 3):

1. As Tig, I click a goal's title on Home and its goal page opens, so that detail lives on the goal page and not on Home ([interaction-rules.md](../design/interaction-rules.md) rule 6).
2. As Galahad, I open a goal and see health, owner, state, and the date health is judged on first and largest, so that I do not read an uncommitted date as a promise ([§6.1](../specs/SPEC.md#s6-1) `health`, [§8.2](../specs/SPEC.md#s8-2) default date presentation).
3. As Tig, I see every §6.1 field on the goal page, with the Date Type beside every date and the Promotion Milestone and its date when the date is not Committed, so that I can check the promotion rule ([§6.1](../specs/SPEC.md#s6-1), [§5](../specs/SPEC.md#s5)).
4. As Chelsea, I open XW-0003 and see its parent link and its sub-goals as the Home tree, each linking to its page ([§6.1](../specs/SPEC.md#s6-1) `parent`).
5. As Tig, I read the goal's Events newest first, each with actor, old value, new value, and reason ([§6.6](../specs/SPEC.md#s6-6)).

Keep it true (MLP 3):

6. As a goal owner, I change health in place. YELLOW or RED asks for a PTG (steps with an owner and a date, criteria, and for YELLOW a trigger) and a reason, all saved as one write ([§6.1](../specs/SPEC.md#s6-1) `path_to_green`, [§8.1](../specs/SPEC.md#s8-1)).
7. As a goal owner, I record a slip on a Committed goal: a changed due date and a reason, with health and a PTG in the same save ([§6.1](../specs/SPEC.md#s6-1) `changed_due_date`, [USERS_MANUAL.md](../../USERS_MANUAL.md) Appendix A "Record a slip").
8. As a goal owner, I promote the Date Type one step. Fantasy to Ambition attaches a new Promotion Milestone. Ambition to Committed needs a Plan at Pencil ([§5](../specs/SPEC.md#s5), [§7.1](../specs/SPEC.md#71-date-lifecycle)).
9. As a goal owner, I change the state with a reason: pursue, close as Completed, Completed Late, or Did Not Meet, or delete ([§7.2](../specs/SPEC.md#s7-2), USERS_MANUAL.md Appendix A "Close a goal").
10. As a goal owner, I comment on the goal. The comment is an Event. It does not reply to another comment ([§4](../specs/SPEC.md#s4) Comment, [§6.6](../specs/SPEC.md#s6-6)).
11. As Galahad, when someone saved the goal after I opened it, my save is rejected, my typed values stay, and the current goal shows beside them ([§6](../specs/SPEC.md#s6), [§8.1](../specs/SPEC.md#s8-1) stale writes).

Create (MLP 4):

12. As Galahad, I click New goal on Home and fill one page: summary, owner, date, and Date Type. Every other required §6.1 field shows its default in one row I can change ([§6.1](../specs/SPEC.md#s6-1), USERS_MANUAL.md Appendix A "Create a goal").
13. As Galahad, each Date Type shows its meaning in one line from §5, and none is picked for me ([§5](../specs/SPEC.md#s5)).
14. As Galahad, when I pick Ambition or Fantasy, the Promotion Milestone opens in place, pre-filled (summary, Committed date, owner), and one save creates both goals ([§5](../specs/SPEC.md#s5), D3).
15. As Galahad, when I pick Committed with no Pencil plan, the form says so at the Date Type, offers the plan and plan maturity fields there, and offers Ambition with a Promotion Milestone ([§6.1](../specs/SPEC.md#s6-1) `plan_maturity`).
16. As Tig, I optionally map the new goal to an existing Priority. Creating a goal never re-ranks a Priority ([§6.3](../specs/SPEC.md#s6-3), USERS_MANUAL.md Appendix A "Re-rank priorities").
17. As Chelsea, on a goal page I add a sub-goal with + Sub-goal in one row (summary, owner, date, Date Type). It is a full goal under the same rules, with this goal as its parent ([§6.1](../specs/SPEC.md#s6-1) `parent`). Decided by Chelsea, Q-C2.
18. As Galahad, on the create form I add sub-goals in the same rows, as on the canvas NewGoal board. One save creates the goal, its Promotion Milestone, and its sub-goals, or none of them. A sub-goal row's date and Date Type start as the parent's (D2). Decided by Chelsea, Q-C2.
19. As Galahad, saving lands on the new goal's page. A Promotion Milestone and sub-goals created with it show there.

Work items (MLP 3, decided by Chelsea, Q-C1):

20. As Chelsea, I open a goal and see its work items: the list of work under the goal, each with title, owner, status, due date, and links ([§6.7](../specs/SPEC.md#s6-7)). An agent owner and a human owner look different ([§6.4](../specs/SPEC.md#s6-4) `kind`).
21. As Galahad, I file a work item on the goal page with no agent: title, owner (a human or an agent), status, due date ([§6.7](../specs/SPEC.md#s6-7), [§13](../specs/SPEC.md#s13) item 26).
22. As a work item's owner, human or agent, I change its status, owner, or due date with a reason. Each change is an Event I read on the work item and on its goal ([§6.6](../specs/SPEC.md#s6-6)).
23. As Tig, I comment on a work item. The comment is an Event on that work item ([§6.6](../specs/SPEC.md#s6-6)).

## 4. Done when

Each check runs against the seed ([server/seed/excaliwire.json](../../server/seed/excaliwire.json)) at 1440 px, 1100 px, and 390 px. Each behavior has a test that fails on the old code and passes on the new ([AGENTS.md](../../AGENTS.md)).

Goal page:

1. Clicking XW-0003's title on Home opens `/goals/XW-0003`. Clicking the sub-goal count still opens and closes the tree.
2. XW-0003's page shows first: health, owner, state, and XW-0004's date Nov 6 with "Committed" and "Promotion Milestone" beside it. XW-0003's own date Nov 30 with "Fantasy" shows after it, in lighter text.
3. Every §6.1 field of XW-0003 is on the page. A field with no value shows that it is empty.
4. A goal not In Progress shows no health mark. It shows its State.
5. XW-0004's page lists XW-0005 to XW-0011 as sub-goals, each linking to its page, and links up to its parent.
6. The history lists the goal's Events newest first. Each shows actor, old value, new value, and reason. The seed's create Events show.
7. Setting XW-0001 to YELLOW with no PTG is rejected. The message names the rule in spec words. With a PTG (one step with an owner and a date, criteria, a trigger) and a reason, the save succeeds and the history shows one Event per changed field, with that reason.
8. Any change to health, date, Date Type, or state with no reason is rejected and names the rule.
9. A slip on XW-0002 sets `changed_due_date`. `original_committed_date` and `due_date` do not change. Setting `due_date` on a Committed goal is rejected (`no-silent-re-baseline`).
10. Demoting a Committed date is rejected (`committed-not-demotable`).
11. Promoting XW-0003 Fantasy to Ambition with a new Promotion Milestone succeeds. Promoting a goal to Committed on a Crayon plan is rejected (`committed-needs-pencil`).
12. A comment on XW-0003 appears in Comments with its actor and time, and in the Event log with an empty old value.
13. Two tabs open XW-0001. Tab A saves. Tab B saves against the old version: rejected; tab B keeps its typed values and shows the current goal.
14. An agent actor's write to a goal is rejected (`agent-writes-a-draft`). The page has a reserved place for Drafts above the fields and shows nothing there in MLP 3.

Create:

15. New goal opens one form. Summary, owner, date, and Date Type are the only fields with no default. Date Type has no value until the human picks one.
16. Picking Fantasy opens the Promotion Milestone pre-filled. Saving creates two goals and their Events in one transaction. If either breaks a rule, neither is stored.
17. Picking Committed with plan maturity below Pencil shows the rule at the Date Type and keeps Create from saving. Switching to Ambition with a milestone saves.
18. A summary with fewer than 5 words or no verb saves, and shows a muted hint at the summary field (a lint, [§8.1](../specs/SPEC.md#s8-1)). The word "lint" is not on screen.
19. The new goal's key is the next unused key with the owner's prefix (XW-0012 on a fresh seed).
20. The Priority picker lists only existing current Priorities. No rank changes on create.
21. A sub-goal added with + Sub-goal on XW-0003's page has `parent` XW-0003 and passes the same rules as any goal.
22. On the create form, a goal with two sub-goal rows saves as three goals (four with a Promotion Milestone) and their Events in one transaction. Each sub-goal has the new goal as `parent`. If any row breaks a rule, nothing is stored, and the rule shows at that row.
23. A sub-goal row left at the parent's date and Date Type saves with them (D2). Changing a row's Date Type to Ambition or Fantasy under a Committed parent asks for that row's own Promotion Milestone.

Work items:

24. The deployment's owner settings turn the work-item extension on for Excaliwire. With it off, the goal page shows no work items and no control to file one ([§13](../specs/SPEC.md#s13) item 26).
25. Galahad files a work item on XW-0007 with a title, an owner, a status, and a due date, with no agent. It shows in XW-0007's work items with key WI-0001 on a fresh seed.
26. A work item can be owned by an agent actor. Its owner shows as an agent.
27. A work item with no title, no owner, or a status not in the configured list is rejected, and the rejection names the rule.
28. Changing a work item's status with a reason appears as an Event on the work item and in XW-0007's history. With no reason it is rejected.
29. An agent actor changes the status of a work item it owns. The change succeeds as that agent's Event, not as a Draft.
30. Two tabs change the same work item. The second save against the old version is rejected and shows the current work item.
31. A comment on a work item appears on that work item.

Who changes a goal ([SPEC.md §6.1, rule `owners-change-goal`](../specs/SPEC.md#s6-1)):

The seed: Tig owns XW-0001 and XW-0002 and is the GOALIE owner. Chelsea owns XW-0003, XW-0004, and XW-0005 to XW-0011 (parent XW-0004). The test adds Galahad, a human who owns no goal, and an agent operated by Chelsea.

33. Galahad sets XW-0001's health from RED to GREEN with a reason. The API answers 422 with `error: "invalid"` and one violation whose `rule` is `owners-change-goal`. XW-0001 and its version do not change, and no Event is written.
34. Galahad's write to any one of these XW-0001 fields is refused the same way: `health`, `path_to_green`, `state`, `due_date`, `date_type`, `changed_due_date`, `promotion_milestone`, `summary`, `description`, `owner`, `parent`, `priority`, `plan`, `plan_maturity`, `severity`, `type`, `level`, `org_unit`, `origination`, `work_product`, `visibility`.
35. Galahad comments on XW-0001. The comment is accepted and shows on XW-0001.
36. Chelsea changes XW-0007's health with a PTG and a reason: accepted (she owns it). Chelsea changes XW-0001's health: refused with `owners-change-goal` (she owns no goal above it and is not the GOALIE owner).
37. A new human owns a goal whose parent is XW-0007. Chelsea changes that goal's health: accepted (she owns XW-0007 and XW-0004 above it).
38. Tig changes XW-0007's health: accepted (he is the GOALIE owner).
39. Galahad creates a goal with parent XW-0007: refused with `owners-change-goal`. Galahad creates a goal with no parent: accepted.
40. Galahad approves a Draft on XW-0001: refused with `owners-change-goal`. A Draft is MLP 5; this check runs when Drafts land.
41. A refused write in a batch with other commands stores nothing. The answer names the command that was refused (`at`).
42. Galahad opens XW-0001's goal page. Health, PTG, dates, Date Type, state, and every other field show as read text, with no edit control, no Slip, Promote, or Close, and no + Sub-goal. The comment box is open and works. One muted line says who may change the goal: its owner, the owners above it, and the GOALIE owner, by avatar.
43. Chelsea opens XW-0007's goal page and sees the edit controls. Tig sees them on every goal.
44. The page decides read-only from what the server sends with the goal (a `can_change` value from the same rule), not from its own copy of the rule ([ADR 0010](../adr/0010-app-shape.md) as amended: rules live on the server). If the page shows a control anyway and the save is refused, the 422 message shows at the control in spec words.

Words:

45. Every label on the goal page and the form is a word in SPEC.md §4, §6, §8.2, or §9 ([interaction-rules.md](../design/interaction-rules.md) rule 13), or is a D5 word. Any other label goes on the words list below.

## 5. Out of scope

1. The rest of [#12 (Epic 12: Work items)](https://github.com/tig/goalie/issues/12): import from GitHub Issues, intake by MCP or email, links to GitHub as Work Product, and work items as evidence for health Drafts (MLP 6). A work item's links are plain URLs in the MLP.
2. Drafts: showing, approving, rejecting. MLP 5. The page reserves the place only.
3. "Edit, then approve" a Draft (D4).
4. Plan Doc editing and the Doc page ([§6.5](../specs/SPEC.md#s6-5)). The plan is a link and a maturity field in MLP 3 and 4.
5. Concurrent Markdown editing of `description` ([ADR 0008](../adr/0008-concurrent-markdown.md)). In MLP 3 the description is one stale-checked field. Two people editing it at once: the second save is rejected. The risk is named, not solved.
6. Live updates ([ADR 0007](../adr/0007-live-update.md)) and Presence ([ADR 0009](../adr/0009-presence.md)). The version shows only in a stale-write message.
7. Re-ranking Priorities, and drag to rank. A separate Feature.
8. Comment replies ([§6.6](../specs/SPEC.md#s6-6)).
9. A work item with its own page. A work item opens in place on its goal page.
10. Canvas items with no spec home: the "Done when" field (it belongs in the description's key results), the "Rules check" panel, "Suggest with an agent", and the "Human + agent" and "Both" kinds (a work item has exactly one owner, §6.7). Team lanes on the work-item half are grouped by a spec word instead (D9).
11. Time-based triggers that turn a goal RED when a date passes ([§8.1](../specs/SPEC.md#s8-1)).
12. Correcting `original_committed_date` (a deployment option for the GOALIE owner, §6.1).
13. Deleting from the store. Deleted is a State. A Deleted goal stays reachable by its link ([§8.1](../specs/SPEC.md#s8-1)).

## 6. Spec impact

SPEC.md sections used: §1.2, §3 rule 9, §4, §5, §6, §6.1, §6.3, §6.4, §6.6, §6.7, §6.9 (reserved place only), §7.1, §7.2, §8.1, §8.2, §10, §12, §13 items 23 to 26. USERS_MANUAL.md Appendix A: Create a goal, Promote a date, Report trouble, Record a slip, Close a goal, Work between reviews.

What §6.7 and #12 say about work items:

- [§6.7](../specs/SPEC.md#s6-7): a work item is an optional extension: `id`, `title`, `owner` (an actor, and it can be an agent), `status`, `due_date`, links, linked to a goal. It does not copy the goal schema. When the extension is on, work items are the group's list of work under a goal, and a human can file one with no agent. [§13](../specs/SPEC.md#s13) item 26: the extension must not be required.
- [§6.6](../specs/SPEC.md#s6-6) and [§13](../specs/SPEC.md#s13) item 24: every change to a work item, and every comment on one, is an Event with an actor, a time, an old value, a new value, and a reason, read on the work item.
- [#12](https://github.com/tig/goalie/issues/12) puts work items in Stage 5, after #5 and #8, alongside Stages 3 and 4. Its scope adds intake through the API, MCP, the UI, and email; GitHub import and links; and work items as health evidence. This feature takes only the UI slice: list, file, change, comment. #12 stays open for the rest.
- The release plan §3 already says "In v1, work items live on the goal page." Chelsea's Q-C1 answer agrees with it. No release plan change.

Decisions this spec builds on. Chelsea took them on the Designer's recommendations on 2026-10-23. They are plain decisions for the build:

- **D1.** A Promotion Milestone (type Milestone (Commit)) is Committed without a Pencil plan. Its plan is the parent goal's plan. rules.ts `committed-needs-pencil` skips a goal that is another goal's Promotion Milestone.
- **D2.** A sub-goal inherits its parent's date and Date Type until it sets its own. While it inherits, it shares the parent's Promotion Milestone.
- **D3.** The create form pre-fills the Promotion Milestone. One write saves the goal, its Promotion Milestone, and its sub-goals. The agent Draft stays the path for goals created through the API.
- **D4.** "Edit, then approve" a Draft is not in the MLP.
- **D5.** The screen words are New goal, Sub-goal, Slip, Promote, and Close.
- **D6.** The PTG takes the §6.1 shape: steps with an owner and a date, criteria, and for YELLOW a trigger. A missing part is flagged, not blocked.
- **D7.** The work-item extension (§6.7) is on for Excaliwire, by an owner setting `work_items` (on or off, default off).
- **D8.** Work-item status values are §6.1 State words: `Backlog` · `In Progress` · `Completed` · `Deleted`. No new word.
- **D9.** The work-item half of the goal page groups by `status`. Each owner shows as an avatar with its kind, human or agent. No team lanes.

Spec impact, for later (Tig reviews these with the pull request):

- §5 and §6.1 `plan_maturity`: the D1 exception.
- §6.1 `due_date` and `parent`: the D2 inheritance.
- USERS_MANUAL.md Appendix A "Create a goal" step 5: the form pre-fills the milestone (D3).
- §4: New goal, Sub-goal, Slip, Promote, Close (D5). Slip, Promote, and Close are already in USERS_MANUAL.md Appendix A.
- §6.7 and §12: the status list (D8) and the `work_items` owner setting (D7).
- #12 and the #1 stage table: the UI slice of Stage 5 moves into the MLP.
- §6.1 and §8.1: rule `owners-change-goal`, decided by Chelsea on 2026-10-24, written into SPEC.md in this branch. The phrase "a goal above it" is not a §4 term; it means a goal reached by following `parent` (§6.1), the closest existing word. The fields it covers beyond health, state, dates, and PTG are the Product Manager's call: every field a human writes, so one rule covers the goal.

Issue drift, for the Chief of Staff to correct:

- [#50](https://github.com/tig/goalie/issues/50) Scope says "Server-rendered per ADR 0010." ADR 0010 was amended on 2026-10-23: the web app is React and the browser draws every screen. The line becomes "Drawn by the React app per ADR 0010 as amended, over a write API."
- [#49](https://github.com/tig/goalie/issues/49) Scope says "Server-rendered HTML per ADR 0010" and "No drag. Drag needs browser code ADR 0010 does not allow." Both lines are out of date for the same reason. Drag to rank stays out of #49 as scope, not as an ADR limit.
- [#50](https://github.com/tig/goalie/issues/50) Out of scope says "Drafts". Release plan §3 priority 1 names "the Drafts that wait on an owner". The goal page reserves their place now; MLP 5 fills it.
- [#47](https://github.com/tig/goalie/issues/47) records XW-0004 on a Crayon plan with "Committed needs Pencil". The seed stores XW-0004 at Pencil. Under D1 the seed may store it at Crayon.

Words collected from the canvas and wireframes that have no spec word, and that this feature must not put on screen: Add a goal, What, Who, When, Done when, Rules check, How it will look, team, lane, First work items, Suggest with an agent, AI, Human, Agent, Human + agent, Both, New (tag), Company goals, Work, Show, Done, Open, Late, Needs approval, Blocker, Started, was due, Edit, Live, lint, Review Draft, Fields, v14, pre-filled. The Designer uses a spec word or an icon instead (rule 13), or adds the word to this list for Tig.

## 7. Decisions for Chelsea

1. **Q-C1, decided by Chelsea.** The goal page carries the work-item half of the canvas Goal board, with the §6.7 extension on for Excaliwire. Cost: a work-item write route, its rules, and a status list before Nov 6. I have not measured that cost; the Head of Engineering sizes it.
2. **Q-C2, decided by Chelsea.** Sub-goals are added on the create form, as on the canvas NewGoal board, and with + Sub-goal on the goal page.
3. Build order: the write API and the PTG reshape first, then the goal page, then the form. Recommend: yes. Decided by the Product Manager on Chelsea's standing rule. The Head of Engineering plans it.
4. The goal page header leads with the judged date (the Promotion Milestone's for an uncommitted goal), not the goal's own date. Recommend: yes. Galahad misread the uncommitted date as the promise on wf04 and the canvas Goal. Decided on the Designer's recommendation.

## Appendix A: MLP 4 issue text

Title: **MLP 4: Create a goal or a sub-goal**

```markdown
**MLP sub-goal 4.** Parent: #47 (XW-0003 MLP). Depends on: MLP 1 (the spine) and MLP 3 (the goal page). A slice of #8 (Epic 7: Views and app).

**Spec baseline:** Draft 0.2.

## Why
Every goal in GOALIE comes from the seed today. Nobody can add one.
The #47 tree moves into GOALIE through this write path (#47, Dogfood).
USERS_MANUAL.md Appendix A, "Create a goal", is a procedure the app must run.

## Scope
- A New goal control on Home opens one form, drawn by the React app per ADR 0010 as amended.
- The form asks for summary, owner, date, and Date Type. Every other required [§6.1](https://github.com/tig/goalie/blob/develop/docs/specs/SPEC.md#s6-1) field shows its default and can be changed. Date Type has no default. Each Date Type shows its [§5](https://github.com/tig/goalie/blob/develop/docs/specs/SPEC.md#s5) meaning in one line.
- Ambition or Fantasy opens the Promotion Milestone in place, pre-filled. One write creates both goals, or neither.
- Committed without a Plan at Pencil is rejected at the Date Type, in spec words, with Ambition and a Promotion Milestone offered instead.
- An optional Priority picker lists the current Priorities. Creating a goal does not re-rank.
- Sub-goals are added on the form, in rows of summary, owner, date, Date Type, and with + Sub-goal on a goal page. Each is a full goal with that goal as its parent. One write creates the goal, its Promotion Milestone, and its sub-goals, or none of them.
- Save opens the new goal's page.
- A create route on the write API. Each create is Events through the one write path, with the actor and a reason.
- Every label is a word in SPEC.md §4, §6, §8.2, or §9. A label with no spec word is listed on this issue for Tig.
- Product spec: docs/product/goal-page-and-create.md.

## Out of scope
Work items (MLP 3). Drafts. Plan Doc editing. Re-ranking. Live updates. Presence.

## Work items
- [ ] Create route on the write API, one transaction for a goal and its Promotion Milestone
- [ ] New goal form: four asked fields, the rest as defaults, Date Type meanings
- [ ] Promotion Milestone pre-filled in place
- [ ] The Pencil gate at the Date Type
- [ ] Optional Priority picker
- [ ] Sub-goal rows on the form, and + Sub-goal on the goal page
- [ ] Compare the screen with the NewGoal board on the [v1 canvas](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk). Differences are listed on the pull request.
- [ ] Approve the look (Chelsea)
- [ ] Merge (Tig)

## Done when
- Galahad creates a Fantasy goal with its Promotion Milestone from Home, with no help, and lands on its page.
- A Fantasy goal with no Promotion Milestone is rejected, and the rejection names the rule. Neither goal is stored.
- A Committed goal on a Crayon plan is rejected, and the rejection names the rule.
- Sub-goals added on the form or on a goal page have that goal as their parent and pass the same rules. If one breaks a rule, nothing is stored.
- The new goal and its Events appear on Home and in its history.
- For each behavior, a test fails on the old code and passes on the new.

## Decisions
The product spec's D1 (a Promotion Milestone needs no Pencil plan), D2 (a sub-goal inherits its parent's date and Date Type), D3 (the form pre-fills the milestone), and D5 (screen words) apply.
```
