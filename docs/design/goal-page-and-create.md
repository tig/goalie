# Goal page and New goal

**Status:** Decided 2026-10-23 on the recommendations in [the product spec](../product/goal-page-and-create.md) and Chelsea's answers; in build

**Date:** 2026-10-23

**Owner:** Chelsea

This is the design for MLP 3 ([#50 (MLP 3: Open a goal and keep it true)](https://github.com/tig/goalie/issues/50)) and MLP 4 (Create a goal or a sub-goal).
The product spec is [docs/product/goal-page-and-create.md](../product/goal-page-and-create.md). The rules that bind every screen are [interaction-rules.md](interaction-rules.md). This file adds the rules G1 to G24 and N1 to N16 below; they move into interaction-rules.md with the screens.
The canvas boards are "Goal page (MLP)", "New goal (MLP)", and "Goal page and New goal, phone" on the [v1 canvas](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk). The v1 boards Goal and NewGoal stay as they were; the new boards keep their look and fix what the walk found.

## Bad news first

1. Work items need a store kind and a write route that do not exist. [SPEC.md §6.7](../specs/SPEC.md#s6-7) is an optional extension, and the server has no work item today. The store has a `work_item` table, but no rule checks one and no route writes one. Chelsea put work items in the MLP, so the Backend adds the rules and the route, and the owner setting `work_items` turns the extension on (D7).
2. The canvas groups sub-goals and their work items in colored team lanes. "Team" is a level, not a group, and a work item has one owner, so the canvas's Human, Agent, Human + agent, and Both pills have no field behind them. The design keeps the canvas cards and look and groups work items by status (D9).
3. Both screens wait on the write API. Nothing on them saves until it exists.

## Decided

These were questions in the flow review. They are decided, and the design builds on them.

| # | Decision |
| --- | --- |
The product spec's decisions D1 to D9 hold (§6 of [the product spec](../product/goal-page-and-create.md)): a Promotion Milestone needs no Pencil plan (D1); a sub-goal takes its parent's date and Date Type until it sets its own (D2); the form fills in the Promotion Milestone and one save creates the goal, its milestone, and its sub-goals (D3); New goal, Sub-goal, Slip, Promote, and Close are screen words (D5); the PTG has steps, criteria, and a trigger (D6); work items are on for Excaliwire (D7); a work item's status is Backlog, In Progress, Completed, or Deleted (D8); the work items group by status, and each owner is an avatar marked human or agent (D9).
The design adds two:

| # | Decision |
| --- | --- |
| DD1 | The goal page leads with the date health is judged on (the product spec's §7 item 4). |
| DD3 | A sub-goal that takes its parent's date and Date Type (D2) also shares the parent's plan, so an inherited Committed date needs no plan of its own. A sub-goal that sets its own date follows every rule itself. |
| DD2 | A goal can be created In Progress. The server writes it as Backlog, then In Progress, in one transaction, so the state lifecycle ([§7.2](../specs/SPEC.md#s7-2)) holds. |

## Entry points on Home

- A goal's title on Home opens its goal page at `/goals/<key>`. The count chip alone opens and closes the tree (rule 19). This changes rule 19: a row click no longer toggles.
- **New goal** is a 32 px button in the toolbar, last in the right cluster, filled `--brand` with `--brand-ink` text. It is in every view, so it is the one control that never moves. It opens `/goals/new`. The org unit and the owner come from the view (the view's org unit; you).
- On a phone, New goal is a 40 px button on the first toolbar row, after the view tabs.

## Screen 1: the goal page

One column, 1040 px wide at most, centered on the page like Home's content. At 1440 and 1100 the same layout; at 760 and under, the phone layout below.

```
| < Priorities                                                                   |
| ┌ HEADER ───────────────────────────────────────────────────────────────────┐ |
| │ Tig, Chelsea, and agents use GOALIE to drive Excaliwire execution         │ |
| │ XW-0003 · (C) Chelsea · In Progress · Priority 3 Run Excaliwire on GOALIE │ |
| │                                              Health ( o GREEN|^ YELLOW|# RED )│
| │ HEALTH IS JUDGED ON                                                       │ |
| │ Nov 6  Committed · Promotion Milestone                       (Promote)(Close)│
| │ Run the MLP prototype at goalie.excaliwire.com ...  >                     │ |
| │ Nov 30  Fantasy   (this goal's date, lighter)                             │ |
| │ [====started Oct 23=====|◆ Nov 6 ......................... ○ Nov 30]       │ |
| └───────────────────────────────────────────────────────────────────────────┘ |
| [ Draft slot: empty in the MLP ]                                               |
| ┌ PATH TO GREEN (PTG) ── only when YELLOW or RED ───────────────────────────┐ |
| └───────────────────────────────────────────────────────────────────────────┘ |
| ┌ DESCRIPTION ───────────────────────┐ ┌ FIELDS ─────────────────────────────┐ |
| │ Markdown                            │ │ every other §6.1 field, two columns│ |
| └─────────────────────────────────────┘ └─────────────────────────────────────┘ |
| Sub-goals                                      (+ Sub-goal)                    |
| ┌ sub-goal card: health, title, owner, progress of its work items ──────────┐ |
| └───────────────────────────────────────────────────────────────────────────┘ |
| Work items 6                                   (+ Work item)                   |
| IN PROGRESS 3 · [ ] title · (owner) · In Progress · Nov 2                      |
| BACKLOG 2 · COMPLETED 1 (closed)                                               |
| ( Comments | History )                                                         |
```

### Header card

- **G1.** The back link names the view you came from: "< Priorities". It returns to that view with its filter, search, zoom, and window (rule 5b).
- **G2.** The summary is the title: 26 px, 800 weight, up to three lines, selectable (rule 3: a page a human writes).
- **G3.** Under it, one muted 13 px line: the goal key, the owner's avatar and name, the State word, and the Priority it serves ("Priority 3 Run Excaliwire on GOALIE"), each a link where it leads somewhere. The key shows here; rule 7 keeps keys off Home only.
- **G3a. Needs you.** When something on this goal waits on the signed-in person, one line sits under the muted line, in `--red-ink` with a ! mark: "Needs you: 1 work item past its date" (or a missing Path to Green, or a Draft in MLP 5). Each part links to the place it names. With nothing waiting, the line is not drawn.
- **G4.** Health sits at the right of the header: the word Health, then a three-part control of 32 px, each part its shape and word (rule 10). The health in force is filled with its `-bg` token and `-ink` text. A health chosen but not saved is outlined in its color, not filled, until Save. A goal that is not In Progress shows no health control; its State word stands alone.
- **G5. The judged date leads.** Under the title, a muted 11 px heading "Health is judged on", then the date health is judged on at 22 px 800 weight, with its Date Type beside it. For a Committed goal that is its own date. For an Ambition or Fantasy goal it is the Promotion Milestone's Committed date, with "Promotion Milestone" beside the Date Type, and the milestone's summary under it as a link. The goal's own date follows on its own line at 15 px in `--mute`, with its Date Type. A slip shows as today: the changed date, then "· slip N days" in `--red-ink`, and the original committed date after it, locked.
- **G6.** A thin date bar runs under the dates, as the canvas: "In Progress since Oct 23", today, the judged date, and the goal's own date, with the Date Type marks of the Home legend. It is a picture of the dates above it, not a control.
- **G7.** The actions sit on the right of the date block, 32 px buttons in `--cut` outline: **Record a slip** (Committed goals only), **Promote date** (Ambition and Fantasy only), **Close goal** (any open goal). A goal in Backlog adds **Pursue**. The labels name their object, so "Close" never reads as closing a panel. An action that does not apply is not drawn.

### Draft slot

- **G8.** The place for Drafts is under the header and above everything else. In the MLP it draws nothing. When MLP 5 fills it, it is the canvas Draft card: lavender, the agent and its operator, what changes, the agent's reason, a reason box, Approve and Reject. Approve stays an outline button until a reason is typed, then fills (the walk read a grayed Approve as broken).

### Health and the Path to Green

- **G9.** Choosing YELLOW or RED in the header opens the PTG editor as a panel inside the header card, under the dates, tinted in the health's `-bg` token, titled "YELLOW needs a Path to Green (PTG)". Nothing saves until Save. Cancel puts health back. Opening it closes any other panel (one panel at a time). Choosing GREEN from YELLOW or RED opens a reason box only; the PTG goes to history on save (§6.1).
- **G10.** The PTG card has three parts, in order: **Steps** (a table: the step, its owner, its date; "+ Step" adds a row), **Criteria for GREEN** (one text box), and for YELLOW **Trigger for RED** (one text box). A **Reason** box closes the card, then Save and Cancel. One Save writes health, the PTG, and the reason together.
- **G11.** Save stays enabled. A missing required part is named at that part, in spec words, when Save is pressed, and nothing is saved. A missing trigger on YELLOW is a muted hint and does not stop the save (it is a lint in §6.1).
- **G12.** Once saved, the PTG is a card of its own under the Draft slot. It shows the same three parts as text, with a pencil icon (aria-label "Edit Path to Green") at its top right. Its border is the health's `-bg` token.

### Slip, Promote, Close, Pursue

Each opens a panel in place under the date block. One panel at a time. Each states what will happen before you confirm. Each needs a reason.

- **G13. Slip** (wireframe 08): the original committed date, locked; the changed due date; health (YELLOW or RED) with the PTG card below, filled from the current PTG; the reason. One save. The panel says, in muted text: "A Committed date can't be demoted. A slip is the only way to move it."
- **G14. Promote** (wireframe 09): Fantasy to Ambition asks for the next Promotion Milestone (summary, Committed date, owner), filled in. Ambition to Committed shows the plan and its maturity; below Pencil, Promote stays disabled with the reason and a link to the plan. Both show the new date, which can differ from the old one, and the difference. A box lists what GOALIE will do: complete the milestone, record the Original Committed Date, pin the plan version. When the milestone still has sub-goals or work items not Completed, a `--red-ink` line says so first: "XW-0004 has 7 sub-goals not Completed. Promote when the milestone is met." The new Date Type is shown as text, not a field.
- **G15. Close** (wireframe 13): Completed, Did Not Meet, or Deleted, and a reason. Completed vs Completed Late is computed against the original committed date and shown, not chosen. An Ambition goal offers "Promote and close" in one step (SPEC §7.2 closing rule): it completes the Promotion Milestone, promotes the goal to Committed on its current date, and closes it as the server computes (Completed or Completed Late). It still needs a Plan at Pencil; that refusal shows in the panel, in place. A Fantasy goal moves up one step at a time (§5), so its Close goal panel offers Did Not Meet and Deleted only, with one muted line: "Promote to Ambition first to close as Completed."
- **G16. Pursue** moves a Backlog goal to In Progress, asks for health (GREEN by default) and a reason.

### Description and Fields

- **G17.** Description and Fields sit side by side at 1440 and 1100 (1.4fr and 1fr), and stack on a phone.
- **G18.** The description is Markdown, shown as text. The pencil icon opens it in a text box with Save and Cancel and a reason box. A §6.1 part (a) to (d) that is missing shows as a muted hint under the text: "Add who shares responsibility". No section numbers on screen. The word lint is never shown.
- **G19.** Fields lists every §6.1 field not shown above, in a two-column grid of 13 px label and value: Type, Level, Org unit, Severity, Plan (a link), Plan Maturity, Work Product (links), Parent (a link), Origination, Visibility, Original Committed Date, Changed due date. An empty field writes "None" in `--mute`. The pencil icon makes the grid editable in place, with one reason box and Save.

### Sub-goals

- **G20.** The section title is "Sub-goals", with **+ Sub-goal** at its right (filled `--brand`, 32 px). + Sub-goal opens one add row at the top of the list: summary, owner, date and Date Type (this goal's, written out, by default, D2), and Add. A Date Type of Ambition or Fantasy under a Committed goal opens that row's own Promotion Milestone, as on the New goal form (N6).
- **G21.** Each sub-goal is a white card, the canvas look: its health mark (rule 10), its title as a link to its page, its State word when not In Progress, its date only when it differs from this goal's (rule 15), its owner's avatar, a "◆ Promotion Milestone" tag when it is this goal's Promotion Milestone, and, with work items on, a progress bar (`--green` on `--control`) and "N of M work items" (Completed of all that are not Deleted). A sub-goal with sub-goals of its own shows their count. Its work items live on its own page.

### Work items

Shown only when the owner setting `work_items` is on (D7).

- **G22.** The section title is "Work items" with its count, and **+ Work item** at its right. + Work item opens one add row: title, owner (a human or an agent), status (default In Progress), due date, and Add. Adding needs no reason; the Event's reason is "Filed".
- **G23.** Work items group by status, in this order: In Progress, Backlog, Completed. Each group has a small heading with its count; Completed starts closed. Deleted items show only in History. Each row is 40 px: a checkbox, the title, the owner (avatar and name; an agent's avatar has a dashed ring and the muted word "agent" after the name, §6.4), the status word, and the due date. An item not Completed and past its date shows its date in `--red-ink` followed by the word "late", so color is not the only cue. A Completed item is struck through in `--mute`.
- **G24.** Ticking the checkbox marks the item Completed. Because every status change needs a reason, the row then shows one inline box, "Reason", with Save; Enter saves, Escape undoes the tick. Clicking a row's title opens it in place, under the row: its status, owner, due date, and links as editable fields with one reason box and Save, then its Comments and History, the same as the goal's tabs, smaller. A work item has no page of its own.

### Comments and History

- Two tabs under the sub-goals: **Comments** and **History**, each with its count. Comments opens first, so the comment box is in view.
- Comments: a box first ("Comment", 3 lines, then Comment button), then comments newest first: avatar, name, time, text. No reply (§6.6).
- History: newest first. Each row: avatar, actor, time, then "field: old → new" and the reason in quotes. Filters as chips: All, Dates, Health, State, Comments. A comment shows here too.

### States

| State | What shows |
| --- | --- |
| Loading | The header card and two section skeletons (rule L1). |
| Not found | "No goal XW-0099." and the back link. |
| Deleted goal | The page, read-only, with "Deleted" as its State and the reason beside it (§8.1: stays findable). |
| Saving | The button shows a small spinner. The page does not move. |
| Rule broken | The message sits at the field it names, in `--red-ink`, in the server's words. Nothing saves. |
| Stale save | A card at the top of the panel: "Someone saved this goal after you opened it." Your typed values stay in the panel. The current values show under each field you changed, in `--mute`. Save again writes against the new version. |
| Signed in as someone else's goal | Every control shows; the server decides who may write. |

### Phone

- The header stacks: title, the muted line, then health as a full-width three-part control of 44 px, then the judged date block, then the actions as one row of buttons.
- Description, then Fields (one column), then sub-goal cards full width, then work items (each row two lines: title, then owner, status, and date), then the tabs.
- Panels open full width in place. A table of PTG steps becomes one card per step.

## Screen 2: New goal

One page at `/goals/new`, not a dialog, not a wizard (wireframe 05). The canvas NewGoal layout: the form on the left (1fr), a 320 px summary rail on the right that stays on screen while the form scrolls. On a phone the rail becomes a bar at the bottom with the Create button.

```
| < Priorities                                                       |
| New goal                                       ( Goal | Sub-goal ) |  (no toggle: see N2)
| ┌ 1 Summary and description ───────────────┐ ┌ rail ─────────────┐ |
| ┌ 2 Owner and Priority ────────────────────┐ │ preview card      │ |
| ┌ 3 Date ──────────────────────────────────┐ │ what will be made │ |
| │   date · Date Type · Promotion Milestone │ │ checks            │ |
| ┌ More fields (one row of defaults) ───────┐ │ (Create XW-0012)  │ |
| ┌ 4 Sub-goals (optional) ──────────────────┐ └───────────────────┘ |
| ┌ 5 Work items (optional) ─────────────────┐                       |
```

- **N1.** Five numbered cards, in the order the walk liked (what, who, when, then sub-goals). The section titles are spec words: "Summary and description", "Owner and Priority", "Date", "Sub-goals", "Work items".
- **N2.** No Goal or Sub-goal toggle (the walk could not tell what it switched). Starting from a goal page's "+ Sub-goal" opens the same form with **Parent** filled in and shown in card 2; that is the only difference.
- **N3. Card 1.** Summary (one line, placeholder "Start with a verb: Launch, Reduce, Increase"). Description: a 6-line box. Under it, four chips for the §6.1 parts: Key results, Metrics, Why it matters, Who shares it. A chip turns green as its part is written (the canvas look). They are hints, not a gate. There is no "Done when" field: key results carry it.
- **N4. Card 2.** Owner: a picker of humans, defaulting to you. Priority: the current Priorities of the org unit as a short list of rows (rank number, title), one selectable, or "None". Picking one maps the goal to it. The list does not move and has no arrows: creating a goal never re-ranks. Parent shows here when set.
- **N5. Card 3.** Date: a date picker that always writes the year ("Feb 28, 2027"). Date Type: three choices, none selected, each with its one-line meaning under the control once chosen and in its help: Committed "A promise. Others plan around it.", Ambition "A stretch. Not a promise.", Fantasy "A wish. Fine as a starting point." (§5).
- **N5a. Health.** Under the Date Type, Health: GREEN, YELLOW, RED, none selected, each with its §6.1 meaning in one line once chosen. YELLOW or RED opens the Path to Green fields there (G10). A new goal is never GREEN unless its owner picks it.
- **N6.** Ambition or Fantasy opens the Promotion Milestone box in place (lavender, as the canvas): one sentence, "A Committed date by which this date moves up to Ambition (or Committed). Health is judged against it.", then its summary (filled: "Commit a date for <summary>"), its Committed date (filled: two weeks from today, before this goal's date), and its owner (filled: this goal's owner). The heading names the step the milestone promotes to.
- **N6a.** A Promotion Milestone the app makes, on New goal or on Promote date, starts In Progress, with the health of the goal it backs. It is a Committed date being pursued, and that goal's health is judged on it. A goal created in Backlog has no health, so its milestone starts in Backlog too, as does a sub-goal's own milestone; the promotion rule still applies (SPEC §7.2). Completing a Backlog milestone on Promote date moves it through In Progress in the same save, and History shows that save as one row, "Promoted · XW-00NN completed", which opens to list its steps.
- **N7.** Committed opens the plan box in place instead: Plan (a link or "None"), and Plan Maturity (Watercolor, Crayon, Pencil), with the chosen one's meaning from §4 under it: Watercolor "Broad strokes, soft edges.", Crayon "Main parts clear, details flexible.", Pencil "Precise and ready to execute." A muted line: "No plan yet? Choose Ambition now, and commit when the plan is at Pencil." Below Pencil, a `--red-ink` line: "A Committed date needs a Plan at Pencil." and a link: "Use Ambition with a Promotion Milestone instead", which switches the Date Type and opens N6.
- **N8. More fields.** One row of chips, each a field and its default, each a small picker: Type Milestone (Launch) · Severity sev2 · State In Progress · Origination New · Level (from the org unit) · Visibility Organization-wide · Work Product None. Each chip has a ? help with its §6.1 meaning. Galahad never has to open them; Tig sees every default.
- **N9. Card 4, Sub-goals.** Optional. One add row: summary, owner (default this goal's owner), date and Date Type (default this goal's date and Date Type, D2, written out: "Fantasy Feb 28, 2027", with "this goal's date" after it in `--mute`). A sub-goal on this goal's uncommitted date shares this goal's Promotion Milestone, and its row says so: "shares XW-0013". Added sub-goals list above the row with up and down to order them, and an x. Each is a full goal when saved. A row given its own date and Date Type follows the same rules as the goal: Committed opens that row's plan and Plan Maturity (N7); Ambition or Fantasy opens that row's own Promotion Milestone (N6). The row grows to show them, and its check joins the rail.
- **N10. Card 5, Work items.** Optional, and shown only when the extension is on. One add row: title, which goal it sits on (this goal's summary, or one of the sub-goals above, by summary), owner (a human or an agent), due date. Each starts In Progress. Added items list above the row.
- **N11. The rail.** Top: a preview card as it will sit on Home: rank (if a Priority is picked), health mark, summary, owner, the date bar. Then "Create will make": each key with what it is ("XW-0013 this goal", "XW-0012 its Promotion Milestone"). The keys come from the server in its create order, so the milestone may take the lower key; the labels make that clear, and no key is reserved. Then "N sub-goals" (and "sharing XW-0012" when they share it), "N work items". Then the checks: exactly what the server's dry run (`check: true`) returns for the whole save, one line per rule, a green check or a red mark with the field it points to. The app adds no check of its own. With today's rules that is: one human owner; a date and a Date Type; a Promotion Milestone before the date (uncommitted only); a Plan at Pencil (Committed only); every uncommitted sub-goal backed by a Promotion Milestone (its own, or this goal's shared one). Sub-goal dates need not fall on or before this goal's: no SPEC rule asks it. Clicking a red line scrolls to its field. This is the canvas's rules check, without the word "rules" and without lints.
- **N12.** The button is **Create XW-0012** (the next key). It stays enabled. With a check red, a `--red-ink` line under it says "1 check to fix", so the button never looks ready when it is not. Pressing it with a check red scrolls to the first red field and names the rule there. Nothing is stored unless every goal in the save passes (one transaction).
- **N13.** Cancel is a text link under the button. Leaving with typed text asks once: "Leave without creating?"
- **N14.** On save, GOALIE opens the new goal's page. A Promotion Milestone made with it shows in the header as its judged date (G5), linked.
- **N15.** On a phone, the cards stack full width in the same order, and every field stays a field (the Promotion Milestone too); the rail's checks move to the top of the page as a one-line count that opens the list; Create is a 48 px bar fixed at the bottom.
- **N16.** Every date input writes the Date Type beside the date in the summary rail and in the preview (rule 14).

## How this answers the walk's six blocks

| Block | Answer |
| --- | --- |
| No sub-goal on the create form (wf05) | Card 4 (N9), and + Sub-goal on the goal page (G20). |
| No Plan Maturity anywhere; Committed was a dead end | N7: plan and maturity appear when Committed is picked, with the way out to Ambition. |
| Required §6.1 fields missing on both forms | N8: every required field is on the form, with its default, in one row. Fields card on the page (G19). |
| The canvas ranked the goal itself | N4: pick a Priority; no re-rank. |
| No history or comments on the canvas Goal | The Comments and History tabs, on the goal and on each work item. |
| The canvas Goal hid plan, type, severity, parent | The Fields card (G19). |

The long form stays short for Galahad: he fills four things (summary, owner, date, Date Type) and reads one sentence; every other field has a visible default. Work items stay, as the canvas, with the owner's kind taken from the actor, so no Human, Agent, or Both pills are needed, and two words for one thing (Human + agent, Both) are gone.

## Words

Words on these screens that SPEC.md §4, §6, §8.2, or §9 does not name, kept here for later: New goal, Sub-goal, Slip, Promote, Close, Pursue, Create, Comment (as a button), Steps, Criteria for GREEN, Trigger for RED, Health is judged on, Needs you, Record a slip, Promote date, Close goal, late, In Progress since, Create will make, shares, this goal's date, None, Filed, More fields, Metrics, Who shares it, Why it matters, Key results, Promote and close, agent (as a mark after a name).

## Not checked

The boards are drawn, not built. I have not measured the boards at 1100. The User Researcher walked the boards twice. The second walk found all six first-walk blocks fixed, and one new block (sub-goals on an uncommitted date did not show their Promotion Milestone), fixed in N9 and N11. Its slows are fixed in G3a, G4, G7, G14, G22, N5a, N7, N12, and N15. Not walked: the Close panel, the Comments tab, keyboard, and contrast.
