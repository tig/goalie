# New goal: usability test

**Status:** Done

**Date:** 2026-10-24

**Owner:** User Researcher, for Chelsea

**Build:** 4468090 (bundle index-CkfMzaf8.js, the same bundle that localhost:4000 serves)

Chelsea finds New goal hard to understand and too complicated. This test finds out why, and splits the form into what a person must decide to save a goal and what can come later.

## Method

The User Researcher played three people and thought aloud. Each person did one real task with the Excaliwire seed: Priorities 1 to 3, owners Chelsea and Tig.
The server ran from the main checkout at 4468090 on a scratch copy of the seed, so no test goal reached the preview store. Headless Chrome ran at 1280 px, and every control was driven over the Chrome DevTools Protocol.
A step is one thing the person does: type in a field, choose an option, or press Create.
Time is the estimated time a person needs to read, decide, and type. It is not a stopwatch on a real person. No real person took this test.
Words are SPEC.md §4 and §6.1 words where one exists.

## The form at 4468090

The blank form shows 21 inputs in 5 numbered sections, a More fields card, a Preview card, and a Create will make card.
Choosing Ambition or Fantasy adds 3 inputs: the Promotion Milestone summary, its committed date, and its owner.
Choosing Committed adds 2 inputs: Plan and Plan Maturity.
Choosing YELLOW or RED adds 5 inputs: the Path to Green (PTG) step, step owner, step date, Criteria for GREEN, and (for YELLOW) Trigger for RED.
The most a person sees at once is 29 inputs.

| Section | Inputs on the blank form |
| --- | --- |
| 1 Summary and description | Summary, Description, and 4 prompt chips |
| 2 Owner and Priority | Owner, Priority |
| 3 Date | Due date, Date Type, Health |
| More fields | Type, Severity, State, Origination, Level, Visibility, Work Product |
| 4 Sub-goals | Summary, Owner, the date choice, + Sub-goal |
| 5 Work items | Title, Goal, Owner, Due date, + Work item |

## Case 1: Chelsea creates a Committed goal for Q4 under an existing Priority

Task: "Run four weekly reviews in GOALIE by Dec 18", Committed, under Priority 3 "Run Excaliwire on GOALIE".

Steps: 10. Create pressed 2 times. Estimated time: 3 to 4 minutes. It saved as XW-0012.

1. Type the summary. Create will make says "Choose a date and a Date Type."
2. Type the description. All 4 parts are in it, but none of the 4 chips lights.
3. Choose Priority 3.
4. Choose the due date, Dec 18.
5. Choose Committed. Two checks show: "XW-0012: a Committed date needs a Plan at Pencil." and "XW-0012: an In Progress goal has a health."
6. Press Create. Nothing saves. The list now shows only the Plan check, and the health check is gone.
7. Type the plan link, docs/release-plan.md.
8. Choose Pencil. The health check comes back.
9. Choose GREEN. "✓ Every check passes".
10. Press Create. The goal page opens.

Thinking aloud, as Chelsea:
- "Owner is me. Good."
- "I have the plan. But Plan is a text box that says None, not a choice of my docs."
- "I pressed Create and one of my two problems vanished. Did I fix it? No, it came back later."
- "An In Progress goal has a health. Is that telling me, or asking me? I guess it means pick one."
- "I never opened More fields. I do not know if the defaults are right for this goal."

Did not understand: Plan Maturity until its line "Broad strokes, soft edges." showed; "an In Progress goal has a health."
Filled but did not need: nothing. Left on the default without reading: all 7 More fields.
Rule messages that confused: the check list that changed after Create.
Gave up or guessed: guessed that Type "Milestone (Launch)" was right.

## Case 2: a team lead creates an Ambition goal that needs a Promotion Milestone

Played as Tig, as the lead of Priority 2 "Grow the XW team". Task: "Hire a second engineer", Ambition, Jan 29, 2027, YELLOW, Level Team.

Steps: 13. Create pressed 2 times. Estimated time: 5 to 6 minutes. It saved as XW-0014, with Promotion Milestone XW-0013.

1. Type the summary.
2. Choose Priority 2.
3. Choose the due date, Jan 29, 2027.
4. Choose Ambition. A Promotion Milestone box opens, already filled: "Commit a date for Hire a second engineer", Committed date Nov 7, 2026, owner Tig.
5. Two checks show. One reads "✕ not checked yet: it names $goal, whose create was refused". The same text shows inside the Promotion Milestone box.
6. Choose YELLOW. The PTG fields open. The check list now shows "✕" with no words, and "1 check to fix".
7. Set Level to Team. Nothing changes. The org unit is Excaliwire, a Company.
8. Press Create. Nothing saves. Now the check reads "XW-0014: a YELLOW goal has a Path to Green: at least one step, each with text, a human owner, and a date, and criteria for GREEN."
9. Type the PTG step.
10. Choose the step date.
11. Type Criteria for GREEN. The list still shows a blank "✕".
12. Type Trigger for RED. "✓ Every check passes".
13. Press Create. The goal page opens, with health judged on Nov 7.

Thinking aloud, as the team lead:
- "Nov 7 is a promise to commit the date. I did not choose Nov 7. The form did."
- "What is $goal? Whose create was refused? I have not pressed Create yet."
- "1 check to fix, and the check is an empty cross. What do I fix?"
- "I chose Team, because I lead a team. Nothing told me that this goal belongs to the Company."

Did not understand: the $goal message; the blank check; why Level is a choice when the org unit is fixed.
Filled but did not need: Level (it changed nothing and nothing checked it).
Rule messages that confused: "not checked yet: it names $goal, whose create was refused"; the blank "✕".
Gave up or guessed: kept Nov 7 for the Promotion Milestone without deciding it.

## Case 3: a first-time user creates the simplest goal that saves

Played as Galahad, who has never used a tool like GOALIE. Task: save any goal.

Steps: 8. Create pressed 4 times. Estimated time: 3 minutes, most of it spent reading rule messages. It saved as XW-0016, with Promotion Milestone XW-0015.

1. Type "Learn GOALIE".
2. Press Create. "Choose a date and a Date Type."
3. Choose Nov 30.
4. Choose Committed, the first Date Type. "a Committed date needs a Plan at Pencil" and "an In Progress goal has a health."
5. Press Create. Nothing saves.
6. Choose Fantasy, to get away from the Plan. The button changes from "Create XW-0015" to "Create XW-0016". A Promotion Milestone XW-0015 appears, dated Nov 7.
7. Press Create. Nothing saves. "an In Progress goal has a health."
8. Choose GREEN and press Create. The goal page opens.

Thinking aloud, as Galahad:
- "Committed sounds like what I want. It is first, so I chose it."
- "Plan at Pencil? I do not have a plan, and I do not know what Pencil is."
- "I chose Fantasy only so that it would let me save."
- "My goal's number changed while I was filling it in."
- "There is now a second goal, Commit a date for Learn GOALIE, due Nov 7, that I did not ask for. I made a promise without knowing."
- "I chose GREEN because I had to choose something."

Did not understand: Date Type, Plan at Pencil, Promotion Milestone, why health is needed for a goal that has not started, and all 7 More fields.
Filled but did not need: nothing. The minimum was 4 decisions: Summary, Due date, a Date Type that is not Committed, and Health.
Rule messages that confused: "an In Progress goal has a health."; the $goal message.
Gave up or guessed: Date Type (chose Fantasy to escape a rule), Health (chose GREEN to escape a rule), and the Promotion Milestone date (never seen as a decision).
The summary "Learn GOALIE" has 2 words, and no message said so (§6.1 lint: 5 words or more).

## What all three show

- The form asks for 21 to 29 inputs. The three people decided 4 to 10 of them. The rest stayed on defaults that nobody read.
- The checks are not a live list. They come one or two at a time, change after Create, and sometimes show no words. Create was pressed 8 times for 3 goals, and 5 of those presses saved nothing.
- Ambition and Fantasy make a second goal, the Promotion Milestone, with a Committed date 14 days out. In 2 of 2 cases, the person did not choose that date.
- Health is needed before the person has started the work. The form does not say that a Backlog goal needs no health.

## Foundation and detail

The foundation of a goal is what a person must decide to save it: what it is, who owns it, when, and how firm that date is.
SPEC.md §6.1 makes owner, date, and Date Type invariants. For an uncommitted date, SPEC.md §5 makes a Promotion Milestone with a Committed date an invariant. That Committed date is a promise, so a person decides it. The form must not pick it.
Health is a judgment about work in progress. A goal that is new and not yet In Progress does not need one (§6.1: health "while In Progress").
Everything else has a safe default or belongs on the goal page after save.

| Field (SPEC.md §6.1 word) | Group | Why |
| --- | --- | --- |
| Summary | Must decide now | It is the goal. Required. |
| Owner | Has a good default | Required, one human. The default is the person who creates it. |
| Due date | Must decide now | Required. |
| Date Type | Must decide now | Required. Honest by choice, with no default. |
| Promotion Milestone: Committed date | Must decide now, for Ambition or Fantasy | It is a Committed date, a promise. The person picks it. |
| Promotion Milestone: summary | Has a good default | "Commit a date for …" is right. |
| Promotion Milestone: owner | Has a good default | The goal's owner. |
| Plan | Must decide now, for Committed only | Committed needs a Plan at Pencil (§5). For Ambition and Fantasy, it can wait. |
| Plan Maturity | Must decide now, for Committed only | The same rule. Otherwise the default Watercolor is honest. |
| Health | Can wait until after save, if the goal starts in Backlog | Health is kept while In Progress. A person judges it once work starts. |
| Path to Green (PTG) | Can wait until after save | Needed only when health is YELLOW or RED. It belongs where health is set, on the goal page. |
| State | Has a good default | Recommend Backlog for a new goal, so that health and PTG wait. Today the default is In Progress. |
| Org unit | Has a good default | The view the person came from. |
| Level | Has a good default | It agrees with the org unit's level (§6.1). It must not be a free choice. |
| Priority | Can wait until after save | Optional (§6.1). |
| Description | Can wait until after save | Required by §6.1, but its four parts are lints, not blocks. It is long writing. |
| Type | Has a good default | Milestone (Launch). |
| Severity | Has a good default | sev2. |
| Origination | Has a good default | New. |
| Visibility | Has a good default | Organization-wide. Restricting it is a logged exception. |
| Work Product | Can wait until after save | Optional. |
| Sub-goals | Can wait until after save | Each one is a goal of its own. + Sub-goal on the goal page saves. |
| Work items | Can wait until after save | Optional extension. + Work item on the goal page saves. |

A goal that keeps only the first group can be saved in 4 to 5 decisions: Summary, Due date, Date Type, and the Promotion Milestone's Committed date (or the Plan at Pencil for Committed). Owner is filled in already.

## Top five problems, worst first

1. **Rule messages that are broken or empty.** "not checked yet: it names $goal, whose create was refused" shows in 2 of 3 cases, in the Create will make card and in the Promotion Milestone box, before any Create. A "✕" with no words and "1 check to fix" shows from the moment YELLOW is chosen until the last PTG field is filled. Fix: name every check in plain words, and never show a check about a create that has not happened.
2. **Checks arrive one at a time and change after Create.** Create was pressed 8 times for 3 goals, and 5 of those presses saved nothing. In case 1 a check disappeared after Create and came back later. Fix: list every unmet rule at once, live, beside its field, before Create is pressed.
3. **The form asks for everything at once.** 21 inputs on the blank form, up to 29. The three people decided 4 to 10. Seven More fields, Sub-goals, and Work items are open on a form whose foundation is 4 or 5 decisions. Fix: show only the foundation (Summary, Owner, Due date, Date Type, and the Promotion Milestone date or Plan at Pencil it calls for). Move the rest behind one "More" and to the goal page.
4. **The form makes a promise the person did not choose.** Ambition and Fantasy create a Promotion Milestone with a Committed date 14 days out (Nov 7) in 2 of 2 cases, and the goal's key changes under the person (Create XW-0015 becomes Create XW-0016). Galahad chose Fantasy only to escape the Plan rule. Fix: leave the Promotion Milestone's Committed date empty until the person picks it, and say in one line that it is a promise to commit by that date.
5. **The first choices lead into walls.** Committed is the first Date Type, and it needs a Plan at Pencil that a first-time user does not have. Health is needed because State defaults to In Progress, and "an In Progress goal has a health." does not say what to do. Fix: start a new goal in Backlog so that health waits, and order the Date Types so the cost of each shows before it is chosen ("Committed needs a Plan at Pencil").

## Also seen

- The 4 Description chips never light, even when the text has all 4 parts.
- Level accepts Team for a goal in the Excaliwire org unit, a Company. No check runs.
- A 2-word summary ("Learn GOALIE") gets no lint.
- Plan is a free text box that says None. There is no way to pick or start a Doc.

## Not tested

Phone width, keyboard, screen reader, a real person with a stopwatch, the "Its own date" sub-goal path, and New goal opened from a goal page as a sub-goal. The Backlog path could not be tested: the State select did not change under the headless browser.
