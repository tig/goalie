# Goal page and goal creation

**Status:** Proposed

**Date:** 2026-10-23

**Owner:** Chelsea

This is the product spec for MLP 3 ([#50 (MLP 3: Open a goal and keep it true)](https://github.com/tig/goalie/issues/50)) and MLP 4 (Create a goal or a sub-goal, issue text in Appendix A).
Parent: [#47 (XW-0003 MLP)](https://github.com/tig/goalie/issues/47). Plan: [docs/release-plan.md](../release-plan.md) §3 priority 1 and §5 Epic 1.
The starting point is the Product Designer's flow review of 2026-10-23 with the User Researcher's walk (wireframes 04 to 13, canvas boards Goal and NewGoal).
The contract is [SPEC.md](../specs/SPEC.md). This spec does not restate it.

## Bad news first

1. Nobody can create a Fantasy or Ambition goal under today's rules. Its Promotion Milestone must be Committed ([SPEC.md §5](../specs/SPEC.md#s5)). A Committed goal needs a Plan at Pencil ([§6.1](../specs/SPEC.md#s6-1), `committed-needs-pencil` in [server/src/rules.ts](../../server/src/rules.ts)). So the date for a date also needs a Pencil plan. The seed passes only because [server/seed/excaliwire.json](../../server/seed/excaliwire.json) gives XW-0004 a Pencil plan, while #47 records that milestone on a Crayon plan. This spec assumes Q-T1 (Spec impact).
2. The Path to Green in the built API is one text with one owner and one date (`PtgStep` in [server/src/api.ts](../../server/src/api.ts)). §6.1 requires steps, each with an owner and a date, plus criteria and, for YELLOW, a trigger. The PTG form must not be designed on today's shape. The PTG is reshaped first.
3. There is no write route. [server/src/server.ts](../../server/src/server.ts) serves `GET /health`, `GET /api/priorities`, and the app. The write path exists ([server/src/write.ts](../../server/src/write.ts) `write()`, with versions and stale rejection) but nothing outside the server calls it. MLP 3 and MLP 4 both depend on a write API.
4. Home has no route to a goal. A row click opens or closes its sub-goals (Designer's review). The goal page is unreachable until that changes.

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
| An agent | Nothing in MLP 3 or 4. An agent writes only Drafts (`agent-writes-a-draft` in rules.ts). Drafts are MLP 5. The goal page reserves their place. |

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
14. As Galahad, when I pick Ambition or Fantasy, the Promotion Milestone opens in place, pre-filled (summary, Committed date, owner), and one save creates both goals ([§5](../specs/SPEC.md#s5), Q-T3).
15. As Galahad, when I pick Committed with no Pencil plan, the form says so at the Date Type, offers the plan and plan maturity fields there, and offers Ambition with a Promotion Milestone ([§6.1](../specs/SPEC.md#s6-1) `plan_maturity`).
16. As Tig, I optionally map the new goal to an existing Priority. Creating a goal never re-ranks a Priority ([§6.3](../specs/SPEC.md#s6-3), USERS_MANUAL.md Appendix A "Re-rank priorities").
17. As Chelsea, on a goal page I add a sub-goal in one row (summary, owner, date, Date Type). It is a full goal under the same rules, with this goal as its parent ([§6.1](../specs/SPEC.md#s6-1) `parent`). Pending Chelsea, Q-C2.
18. As Galahad, saving lands on the new goal's page. A Promotion Milestone created with it shows as a linked row.

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
21. A sub-goal added on XW-0003's page has `parent` XW-0003 and passes the same rules as any goal.

Words:

22. Every label on the goal page and the form is a word in SPEC.md §4, §6, §8.2, or §9 ([interaction-rules.md](../design/interaction-rules.md) rule 13), or is on the Tig list below.

## 5. Out of scope

1. Work items on the goal page. Pending Chelsea, Q-C1. They are Stage 5 ([#12 (Epic 12: Work items)](https://github.com/tig/goalie/issues/12)).
2. Drafts: showing, approving, rejecting. MLP 5. The page reserves the place only.
3. "Edit, then approve" a Draft (Q-T4).
4. Plan Doc editing and the Doc page ([§6.5](../specs/SPEC.md#s6-5)). The plan is a link and a maturity field in MLP 3 and 4.
5. Concurrent Markdown editing of `description` ([ADR 0008](../adr/0008-concurrent-markdown.md)). In MLP 3 the description is one stale-checked field. Two people editing it at once: the second save is rejected. The risk is named, not solved.
6. Live updates ([ADR 0007](../adr/0007-live-update.md)) and Presence ([ADR 0009](../adr/0009-presence.md)). The version shows only in a stale-write message.
7. Re-ranking Priorities, and drag to rank. A separate Feature.
8. Comment replies ([§6.6](../specs/SPEC.md#s6-6)).
9. Sub-goals on the create form. Pending Chelsea, Q-C2.
10. Canvas items with no §6.1 home: the "Done when" field (it belongs in the description's key results), the "Rules check" panel, team lanes, Human and Agent pills, "Suggest with an agent".
11. Time-based triggers that turn a goal RED when a date passes ([§8.1](../specs/SPEC.md#s8-1)).
12. Correcting `original_committed_date` (a deployment option for the GOALIE owner, §6.1).
13. Deleting from the store. Deleted is a State. A Deleted goal stays reachable by its link ([§8.1](../specs/SPEC.md#s8-1)).

## 6. Spec impact

SPEC.md sections used: §1.2, §3 rule 9, §4, §5, §6, §6.1, §6.3, §6.4, §6.6, §6.9 (reserved place only), §7.1, §7.2, §8.1, §8.2. USERS_MANUAL.md Appendix A: Create a goal, Promote a date, Report trouble, Record a slip, Close a goal, Work between reviews.

Rules this feature changes. Each is for Tig. The build assumes the recommendation until Tig answers:

- **Q-T1, for Tig.** A Promotion Milestone (type Milestone (Commit)) is Committed without a Pencil plan. Its plan is the parent goal's plan. **New** exception in §5 and §6.1 `plan_maturity`. rules.ts `committed-needs-pencil` skips a goal that is another goal's Promotion Milestone. Without it, no Fantasy or Ambition goal can be created.
- **Q-T2, for Tig.** A sub-goal inherits its parent's date and Date Type until it sets its own, and while it inherits it shares the parent's Promotion Milestone. **New** rule in §6.1 `due_date` and `parent`. Note: the store does not need it today. Every seeded sub-goal has its own date (XW-0005 to XW-0011, Nov 6, Committed). It makes the one-row sub-goal add honest for a Fantasy parent. Interaction rule 15 already draws a sub-goal's date only when it differs.
- **Q-T3, for Tig.** The create form pre-fills the Promotion Milestone and one write saves both goals. **New** in USERS_MANUAL.md Appendix A "Create a goal" step 5, which says an agent drafts it. The agent Draft stays the path for goals created through the API.
- **Q-T4, for Tig.** "Edit, then approve" a Draft is not in the MLP. Recommendation for later: a human write that also rejects the Draft, with one reason. No spec change now.
- **Q-T5, for Tig.** Screen words for §4: **New goal**, **Sub-goal**, **Slip**, **Promote**, **Close**. "Slip" is in §6.1 and §7.1, "promote" in §5, and USERS_MANUAL.md Appendix A uses "Record a slip", "Promote a date", and "Close a goal". None is a §4 term. "Sub-goal" is not in SPEC.md; §6.1 says `parent`. Recommendation: add all five to §4 in one change.
- **PTG shape, for Tig (confirm).** §6.1 already defines the PTG as steps with an owner and a date, criteria, and a trigger. The API changes to that shape. No spec change. The rule `ptg-when-yellow-or-red` checks presence today. **New** check: a YELLOW PTG has a trigger, flagged not blocked, since §6.1 lists a missing part as a lint.

Release plan change, for Chelsea (pending Q-C1): §3 "In v1, work items live on the goal page" becomes "After the MLP, work items live on the goal page."

Issue drift, for Tig to approve the edits:

- [#50](https://github.com/tig/goalie/issues/50) Scope says "Server-rendered per ADR 0010." ADR 0010 was amended on 2026-10-23: the web app is React and the browser draws every screen. The line becomes "Drawn by the React app per ADR 0010 as amended, over a write API."
- [#49](https://github.com/tig/goalie/issues/49) Scope says "Server-rendered HTML per ADR 0010" and "No drag. Drag needs browser code ADR 0010 does not allow." Both lines are out of date for the same reason. Drag to rank stays out of #49 as scope, not as an ADR limit.
- [#50](https://github.com/tig/goalie/issues/50) Out of scope says "Drafts". Release plan §3 priority 1 names "the Drafts that wait on an owner". The goal page reserves their place now; MLP 5 fills it.
- [#47](https://github.com/tig/goalie/issues/47) records XW-0004 on a Crayon plan with "Committed needs Pencil". The seed stores XW-0004 at Pencil. Q-T1 settles which is true.

Words collected from the canvas and wireframes that have no spec word, and that this feature must not put on screen: Add a goal, What, Who, When, Done when, Rules check, How it will look, team, lane, First work items, Suggest with an agent, AI, Human, Agent, Human + agent, Both, New (tag), Company goals, Work, Show, Done, Open, Late, Needs approval, Blocker, Started, was due, Edit, Live, lint, Review Draft, Fields, v14, pre-filled. The Designer uses a spec word or an icon instead (rule 13), or adds the word to this list for Tig.

## 7. Decisions for Chelsea

1. **Q-C1, pending Chelsea.** The canvas's work-item half of the goal page waits until after the MLP. Recommend: later. It is outside #50 and the spec scope, and it adds a second data shape before Nov 6.
2. **Q-C2, pending Chelsea.** Sub-goals are created on the goal page, not on the create form. Recommend: goal page only. The form makes one goal, and the Promotion Milestone is the only second goal it makes.
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
- On a goal page, a sub-goal is added in one row: summary, owner, date, Date Type. It is a full goal with that goal as its parent.
- Save opens the new goal's page.
- A create route on the write API. Each create is Events through the one write path, with the actor and a reason.
- Every label is a word in SPEC.md §4, §6, §8.2, or §9. A label with no spec word is listed on this issue for Tig.
- Product spec: docs/product/goal-page-and-create.md.

## Out of scope
Sub-goals on the create form. Work items. Drafts. Plan Doc editing. Re-ranking. Live updates. Presence.

## Work items
- [ ] Create route on the write API, one transaction for a goal and its Promotion Milestone
- [ ] New goal form: four asked fields, the rest as defaults, Date Type meanings
- [ ] Promotion Milestone pre-filled in place
- [ ] The Pencil gate at the Date Type
- [ ] Optional Priority picker
- [ ] Add a sub-goal on the goal page
- [ ] Compare the screen with the NewGoal board on the [v1 canvas](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk). Differences are listed on the pull request.
- [ ] Approve the look (Chelsea)
- [ ] Merge (Tig)

## Done when
- Galahad creates a Fantasy goal with its Promotion Milestone from Home, with no help, and lands on its page.
- A Fantasy goal with no Promotion Milestone is rejected, and the rejection names the rule. Neither goal is stored.
- A Committed goal on a Crayon plan is rejected, and the rejection names the rule.
- A sub-goal added on a goal page has that goal as its parent and passes the same rules.
- The new goal and its Events appear on Home and in its history.
- For each behavior, a test fails on the old code and passes on the new.

## For Tig
- Q-T1: a Promotion Milestone (Milestone (Commit)) is Committed without a Pencil plan. Without it, no uncommitted goal can be created.
- Q-T2: a sub-goal inherits its parent's date and Date Type until it sets its own.
- Q-T3: the form pre-fills the Promotion Milestone; USERS_MANUAL.md Appendix A "Create a goal" step 5 changes.
- Q-T5: New goal, Sub-goal, Slip, Promote, Close for §4.
```
