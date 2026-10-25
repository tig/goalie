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
- **G14. Promote** (wireframe 09): Fantasy to Ambition asks for the next Promotion Milestone (summary, Committed date, owner), filled in; its summary defaults to "Commit a date to move <goal summary> to Committed", never the old milestone's (review F7). Ambition to Committed shows the plan and its maturity; below Pencil, Promote stays disabled with the reason and a link to the plan. Both show the new date, which can differ from the old one, and the difference. A box lists what GOALIE will do: complete the milestone, record the Original Committed Date, pin the plan version. When the milestone still has sub-goals or work items not Completed, a `--red-ink` line says so first: "XW-0004 has 7 sub-goals not Completed. Promote when the milestone is met." The new Date Type is shown as text, not a field.
- **G15. Close** (wireframe 13): Completed, Did Not Meet, or Deleted, and a reason. Completed vs Completed Late is computed against the original committed date and shown, not chosen. An Ambition goal offers "Promote and close" in one step (SPEC §7.2 closing rule): it completes the Promotion Milestone, promotes the goal to Committed on its current date, and closes it as the server computes (Completed or Completed Late). It still needs a Plan at Pencil; that refusal shows in the panel, in place. A Fantasy goal moves up one step at a time (§5), so its Close goal panel offers Did Not Meet and Deleted only, with one muted line: "Promote to Ambition first to close as Completed."
- **G16. Pursue** moves a Backlog goal to In Progress, asks for health (GREEN by default) and a reason.

### Saved

- **G26.** After a save that adds or moves something out of view (+ Sub-goal, + Work item, Promote date, Record a slip, Close goal), one live status line under the actions says what happened, with `role="status"`, and goes on the next action: "Added XW-0020 under this goal.", "Promoted to Ambition. XW-0021 is the next Promotion Milestone." (review U2, U3).

### Who may change it

- **G25.** Only the goal's owner, an owner of a goal above it, and the GOALIE owner may change the goal (Chelsea's rule; product spec checks 42 to 44). The page reads `mayChange` from the server and holds no copy of the rule. For anyone else the page is the same page, read-only: health is its shape and word in its `-ink` token (rule 10: no pill, no buttons); Pursue, Record a slip, Promote date, Close goal, the Path to Green, Description, and Fields pencils, and + Sub-goal are not drawn (hidden, not grayed, so nothing looks broken); every field reads as text; the "Needs you" line is not drawn; the Description hints ("Add key results · …") are not drawn, while "No description yet." stays. Comment and + Work item stay open, as does anything else the server allows. One muted line sits under the date bar: each person as a small avatar and name, then "can change this goal. You can comment." The goal's owner comes first, then the owners of the goals above, nearest first, then the GOALIE owner if not already named; each person once, at most three. With more, the line ends "…, or an owner of a goal above it can change this goal." Each name's tooltip says why ("Owner of XW-0003", "GOALIE owner"). Example: "(C) Chelsea and (T) Tig can change this goal. You can comment."

### Description and Fields

- **G17.** Description and Fields sit side by side at 1440 and 1100 (1.4fr and 1fr), and stack on a phone.
- **G18.** The description is Markdown, shown as text. The pencil icon opens it in a text box with Save and Cancel and a reason box. A §6.1 part (a) to (d) that is missing shows as a muted hint under the text: "Add who shares responsibility". No section numbers on screen. The word lint is never shown.
- **G19.** Fields lists every §6.1 field not shown above, in a two-column grid of 13 px label and value: Type, Level, Org unit, Severity, Plan (a link), Plan Maturity, Work Product (links), Parent (a link), Origination, Visibility, Original Committed Date, Changed due date. An empty field writes "None" in `--mute`. The pencil icon makes the grid editable in place, with one reason box and Save.

### Sub-goals

- **G20.** The section title is "Sub-goals", with **+ Sub-goal** at its right (filled `--brand`, 32 px). + Sub-goal opens one add row at the top of the list: summary, owner, date and Date Type (this goal's, written out, by default, D2), and Add. A Date Type of Ambition or Fantasy under a Committed goal opens that row's own Promotion Milestone, as on the New goal form (N6).
- **G21.** Each sub-goal is a white card, the canvas look: its health mark (rule 10), its title as a link to its page, its State word when not In Progress, its date only when it differs from this goal's (rule 15), else "This goal's date" in `--mute`, plus "· shares XW-nnnn" under an uncommitted goal (review U1), its owner's avatar, a "◆ Promotion Milestone" tag when it is this goal's Promotion Milestone, and, with work items on, a progress bar (`--green` on `--control`) and "N of M work items" (Completed of all that are not Deleted). A sub-goal with sub-goals of its own shows their count. Its work items live on its own page.

### Work items

Shown only when the owner setting `work_items` is on (D7).

- **G22.** The section title is "Work items" with its count, and **+ Work item** at its right. + Work item opens one add row: title, owner (a human or an agent), status (default In Progress), due date, and Add. Adding needs no reason; the Event's reason is "Filed".
- **G23.** Work items group by status, in this order: In Progress, Backlog, Completed. Each group has a small heading with its count; Completed starts closed. Deleted items show only in History. Each row is 40 px: a checkbox, the title, the owner (avatar and name; an agent's avatar has a dashed ring and the muted word "agent" after the name, §6.4), the status word, and the due date. An item not Completed and past its date shows its date in `--red-ink` followed by the word "late", so color is not the only cue. A Completed item is struck through in `--mute`.
- **G24.** Each row has a status picker (Backlog, In Progress, Completed, Deleted) with a reason box, like the tick (review U6). Ticking the checkbox marks the item Completed. Because every status change needs a reason, the row then shows one inline box, "Reason", with Save; Enter saves, Escape undoes the tick. Clicking a row's title opens it in place, under the row: its status, owner, due date, and links as editable fields with one reason box and Save, then its Comments and History, the same as the goal's tabs, smaller. A work item has no page of its own.

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

## Screen 2: New goal (foundation first)

Rewritten on 2026-10-24 from the usability test ([docs/research/new-goal-usability.md](../research/new-goal-usability.md)) and the product spec's N-F1 to N-F4. It replaces N1 to N16. N6a (a made milestone starts with its goal's State and health), N13 (leave guard), and N15a (phone layout under 960 px) stay.
The test: three people needed 4 to 10 decisions, and the form showed 21 to 29 inputs. Create was pressed 8 times for 3 goals; 5 presses saved nothing. The form chose a Committed date for the person in 2 of 2 cases.

```
| < Priorities                                                             |
| New goal                                                                 |
| ┌ NEEDED TO SAVE ─────────────────────────────┐ ┌ rail ────────────────┐ |
| │ Summary   [Start with a verb …            ] │ │ Preview card         │ |
| │ Owner     (C) Chelsea  ▾                    │ │ To save: 2 to go     │ |
| │ Date      [Feb 28, 2027]                    │ │ ✓ Summary            │ |
| │ How firm is the date?                       │ │ ○ Date Type          │ |
| │ ( Committed  )( Ambition  )( Fantasy   )    │ │ ○ Milestone date     │ |
| │  A promise.    A stretch.   A wish.         │ │ (Create goal)        │ |
| │  Needs a plan  Needs a      Needs a         │ │ Cancel               │ |
| │  at Pencil.    Promotion    Promotion       │ └──────────────────────┘ |
| │                Milestone.   Milestone.      │                          |
| │ ┌ Promotion Milestone ───────────────────┐  │                          |
| │ │ Commit this goal's date by [ date ]    │  │                          |
| │ └────────────────────────────────────────┘  │                          |
| └─────────────────────────────────────────────┘                          |
| ┌ OPTIONAL · add now or later on the goal page ────────────────── ▸ ┐    |
| │ Description · None   Priority · None   State · Backlog   …          │  |
| │ Sub-goals · none     Work items · none                              │  |
| └─────────────────────────────────────────────────────────────────────┘  |
```

### The foundation

- **NF1. One card, "Needed to save".** It holds only what a person must decide (N-F1): Summary, Owner, Date, Date Type, the one block the Date Type opens, and Priority (NF4a). Every field in it is required, so no field carries a required mark; the card's title says it once. Nothing else is in this card.
- **NF2. Summary** first, one line, placeholder "Start with a verb: Launch, Reduce, Increase". A summary under 5 words or with no verb shows one muted hint under it once the person leaves the field ("A good summary has a verb and 5 words or more."); it never blocks.
- **NF3. Owner** is pre-filled with the signed-in person, shown as their avatar and name in a picker of humans, drawn with its chevron so it reads as changeable.
- **NF4. Date**, a date picker that always writes the year.
- **NF4a. Priority** is in the foundation, after Date Type: the org unit's current Priorities as rows (rank, title) plus "None", none chosen; pre-filled when New goal opens from a Priority. Home lists only goals mapped to a Priority, at the org unit's level, Backlog or In Progress (server/src/priorities.ts), so with None one muted line says "It will not show on Priorities." It is a deliberate choice, not a default (review: a goal saved with the defaults vanished from Home).
- **NF5. Date Type** is three tiles, none chosen, under the question "How firm is the date?". Each tile shows its meaning and its cost before it is chosen: Committed "A promise. Needs a plan at Pencil.", Ambition "A stretch. Needs a Promotion Milestone.", Fantasy "A wish. Needs a Promotion Milestone." So no choice leads into a wall unseen (test problem 5). The order is the spec's (§5).
- **NF6. Ambition or Fantasy** opens one block in place: "Promotion Milestone", one sentence, "A promise to make this goal's date firmer by a Committed date.", and one field, "Commit this goal's date by", **empty**, required, between tomorrow and the goal's date (test problem 4). Under the field, muted: "Pick the date by which you will know the real date." Under the field, one muted line: "Owner Chelsea · 'Commit a date for <summary>'" with a Change link that opens the owner and summary fields. The form never picks the date.
- **NF7. Committed** opens one block in place: Plan (a link; starting a plan Doc in GOALIE is not in the MLP) and Plan Maturity as three tiles with the §4 meanings, Watercolor, Crayon, Pencil. Below Pencil, one plain line, "A Committed date needs a plan at Pencil. No plan yet? Choose Ambition now and commit later.", with "Use Ambition instead" as a link that switches the tile and keeps the date.
- **NF8. A new goal starts at Backlog** (N-F3). Health and the Path to Green are not in the foundation. A Backlog goal with a Priority shows on Home as a row with the hollow mark (rule 11) and no health. The page says so once, muted, under the card: "It starts in Backlog. Set its health when work starts."
- **NF9. From + Sub-goal** on a goal page, the same form opens with "Under <parent summary>" at the top of the card, and Date and Date Type start as "This goal's date" (D2), with Priority taken from the parent: the foundation is then the summary only. The record holds no date, Date Type, or milestone of its own; the server resolves the parent's for every read (D2: inherited until it sets its own). The sub-goal's row on the goal page writes that date and "· shares XW-nnnn" (G21). A sub-goal on an uncommitted parent shares the parent's Promotion Milestone and says so.

### The details

- **NF10. One folded card, "Details · defaults set, change now or later on the goal page"**, closed by default, under the foundation (N-F2). Most of its fields are required by §6.1 and have a good default; they are not optional, and the title does not say so. Closed, it shows five values in one muted line, each value capitalized as in the open rows, then "and 6 more".
- **NF11. Open, it is a list of rows**, each a label, its value, and a Change link that opens the field in place: Description (None), State (Backlog), Type (Milestone (Launch)), Severity (sev2), Origination (New), Visibility (Organization-wide), Work Product (None, optional), Sub-goals (None, optional, "+ Add"), Work items (None, optional, "+ Add"). "Optional" marks only those three. Each field has its ? help with its §6.1 meaning. Level is not a choice: it reads "Level · Company, from Excaliwire" (§6.1: it agrees with the org unit). Org unit reads the same way.
- **NF12. State In Progress** in the details asks for Health in the same row (no default), and YELLOW or RED opens the Path to Green there. This is the only way health enters New goal.
- **NF13.** Sub-goal and work item rows add one item at a time, as today, and list what was added under the row.

### The rail and Create

- **NF14. The rail** keeps the Preview card and, under it, "Create will make" without keys: "This goal · its Promotion Milestone · 2 sub-goals · 1 work item". Under that, "To save" is a live checklist of what the foundation still needs, in plain words, one line each with an empty circle until done and a check when done: "Summary", "Date", "Date Type", "Promotion Milestone date" (or "Plan at Pencil"). It counts down: "To save: 2 to go". It shows only the step in view: details' checks appear only after the details card is opened and something in it is changed.
- **NF15. Plain words only.** The form maps each server rule to its sentence and field; it never shows a raw server message, a `$name`, or an empty mark. A rule that depends on a part not yet filled (the milestone, before its date exists) is not shown (test problem 1). Before the first Create press nothing is red; after a press, unmet lines turn `--red-ink` and each field shows its own line in place (test problem 2).
- **NF16. Every check at once.** The list is the whole dry-run answer for the step in view, all at once, live, never one at a time (product check: the server's `all`).
- **NF17. Create** reads "Create goal". No key shows before save, because keys follow the server's create order and change as the form changes (test: "my goal's number changed"). Create is drawn muted while the list has lines left; a press scrolls to the first unmet field. The new goal's key appears on its page.
- **NF18. Phone and under 960 px** (N15a): one column, the foundation card, then the details card; "To save: 2 to go" is a line at the top that opens the checklist; Create is a 48 px bar fixed to the bottom; every field and tile is at least 44 px tall; the page keeps bottom padding of the bar's height plus 16 px, so the bar never covers the last field or Cancel.

### Kept from the first New goal

- **N6a.** A Promotion Milestone the app makes, on New goal or on Promote date, starts In Progress, with the health of the goal it backs. It is a Committed date being pursued, and that goal's health is judged on it. A goal created in Backlog has no health, so its milestone starts in Backlog too, as does a sub-goal's own milestone; the promotion rule still applies (SPEC §7.2). Completing a Backlog milestone on Promote date moves it through In Progress in the same save, and History shows that save as one row, "Promoted · XW-00NN completed", which opens to list its steps.
- **N13.** Cancel is a text link under the button. Leaving with typed text asks once: "Leave without creating?"
- **N15a.** Under 960 px of page, New goal uses the phone layout of N15: the form takes the full width, the checks are a one-line count at the top, and Create is a 48 px bar fixed to the bottom. The rail does not shrink; a 410 px form beside a narrow rail breaks the three-field rows.

## How this answers the walk's six blocks

| Block | Answer |
| --- | --- |
| No sub-goal on the create form (wf05) | The details card (NF13), and + Sub-goal on the goal page (G20). |
| No Plan Maturity anywhere; Committed was a dead end | NF7: plan and maturity appear when Committed is picked, with the way out to Ambition. |
| Required §6.1 fields missing on both forms | NF11: every required field is in the details card, with its default. Fields card on the page (G19). |
| The canvas ranked the goal itself | NF11: Priority is picked in the details; no re-rank. |
| No history or comments on the canvas Goal | The Comments and History tabs, on the goal and on each work item. |
| The canvas Goal hid plan, type, severity, parent | The Fields card (G19). |

The long form stays short for Galahad: he fills four things (summary, owner, date, Date Type) and reads one sentence; every other field has a visible default. Work items stay, as the canvas, with the owner's kind taken from the actor, so no Human, Agent, or Both pills are needed, and two words for one thing (Human + agent, Both) are gone.

## Words

Words on these screens that SPEC.md §4, §6, §8.2, or §9 does not name, kept here for later: New goal, Sub-goal, Slip, Promote, Close, Pursue, Create, Comment (as a button), Steps, Criteria for GREEN, Trigger for RED, Health is judged on, Needs you, Record a slip, Promote date, Close goal, late, In Progress since, Create will make, shares, this goal's date, None, Filed, More fields, Metrics, Who shares it, Why it matters, Key results, Promote and close, agent (as a mark after a name).

## Not checked

The boards are drawn, not built. I have not measured the boards at 1100. The User Researcher walked the boards twice. The second walk found all six first-walk blocks fixed, and one new block (sub-goals on an uncommitted date did not show their Promotion Milestone), fixed in N9 and N11. Its slows are fixed in G3a, G4, G7, G14, G22, N5a, N7, N12, and N15. Not walked: the Close panel, the Comments tab, keyboard, and contrast.
