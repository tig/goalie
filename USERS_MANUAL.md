# GOALIE User's Manual

> **Template, v0.1.** An organization adopting GOALIE copies this manual, fills in the parts marked `‹…›`, and keeps it current. It is the written definition of GOALIE for that organization. People and agents both work from it. The rules behind it are in [SPEC.md](SPEC.md).

| | |
|---|---|
| **Organization** | ‹name› |
| **GOALIE owner** | ‹one named person›, ‹how to reach them› |
| **Manual version** | ‹version, date› (see [Changelog](#changelog)) |

---

## 1. Purpose

GOALIE is how ‹organization› sets goals, commits to dates, and inspects progress. It exists so that these things happen by default rather than by heroics:

- every goal has one human owner, a date, and a test for whether it was met;
- it is always clear whether a date is a **promise** (Committed), a **stretch** (Ambition), or a **wish** (Fantasy);
- problems show up as YELLOW early, not as RED surprises;
- effort goes to the top priorities, and the rest are starved on purpose.

If you only read one section, read **§4 Rules**.

## 2. Words we use

| Term | Meaning here |
|---|---|
| **Goal** | Something an org unit sets out to do. It has one human owner, a date, and criteria. |
| **Org unit** | ‹list your levels, e.g. Company → Program / Function → Team → Individual›. Each has one owner. |
| **Program / Project / Product** | Program: a long-term area of customer value, with one leader. Project: a specific deliverable by a date. Product: what customers experience. |
| **Date Type** | **Committed:** a promise; plan around it. **Ambition:** a stretch; don't plan around it yet. **Fantasy:** a wish; a starting point only. |
| **Promotion Milestone** | A small goal with a *committed* date, by which an Ambition or Fantasy date moves up one step. |
| **Plan / Plan Maturity** | The doc behind a goal (5Ps, PR/FAQ, Working Backwards, or a Markdown plan in GOALIE). Maturity: **Watercolor** (broad strokes) → **Crayon** (shapes clear, details soft) → **Pencil** (precise, ready to execute). |
| **Work Product** | Links to where the output lives: repo, PR, docs, deployed URL, metric dashboard. |
| **Severity** | `sev1` critical / urgent / blocking · `sev2` important · `sev3` nice to have. How much the goal matters on its own terms. |
| **Priority** | An entry in an org unit's short, **ranked** list of current priorities. Goals map to one. Lower entries are starved on purpose. |
| **Health** | **GREEN:** on track. **YELLOW:** at risk, but there's still a credible path to the date. **RED:** the date isn't credible without intervention. |
| **Path to Green (PTG)** | The written recovery plan for a YELLOW or RED goal. |
| ‹local terms› | ‹any renames or additions› |

## 3. Who does what

| Role | Your job |
|---|---|
| **Goal owner** (a human) | Keep your goal's date, date type, health, and PTG true. Promote dates on time. Report YELLOW early. Show up to the reviews where your goals are discussed. |
| **Org-unit owner** | Keep your unit's goals and ranked priority list in GOALIE. Keep the priority list short. Run or attend your unit's review. |
| **Review owner** | Run the review in the format in §6, and keep that review's page current. |
| **GOALIE owner** | Own this manual and the configuration. Inspect GOALIE's health each quarter (§8) and improve it. |
| **Agents** | Check rules when records are saved. Turn goals RED when committed dates pass. Flag status theater and hygiene gaps. Draft promotion milestones, PTGs, and review pre-reads. Agents never own goals, and they never commit a date on a human's behalf. Each agent has a human operator: ‹list agents and operators›. |

## 4. Rules

**Hard rules.** GOALIE enforces these; you can't turn them off.
1. Every goal has **exactly one human owner**.
2. Every goal has a **date** and a **date type**.
3. An **Ambition** or **Fantasy** date has a **Promotion Milestone** with a *committed* date:
   - an Ambition date's milestone is when it becomes Committed;
   - a Fantasy date's milestone is when it becomes Ambition.
4. A **Committed** date has a **Plan at Pencil**.
5. The **Original Committed Date** can't be edited. Slips are recorded as a changed date with a reason. ‹Who, if anyone, may correct a data-entry error.›
6. A Committed date can't be demoted. If you can't hit it, that's a slip.
7. Changing a **date, date type, or state** needs a written **reason**.
8. **YELLOW or RED** needs a **PTG**.
9. A priority list has **no ties**.

**Happens automatically**
- A committed date that passes without being met turns the goal **RED**. For a Promotion Milestone, its parent turns RED too.
- A **GREEN → RED** jump is flagged for the next review.
- Records that break a rule stay visible in the **Hygiene** view until fixed.

**Defaults you can change for your scope (the change is visible)**
- Default views sort RED → YELLOW → GREEN and show the date type next to every date.
- Goals are scoped to the plan period: ‹e.g. calendar year›.
- ‹other local defaults›

**Norms.** These are inspected in reviews. Agents flag them; nothing blocks you.
- Summaries are short and contain a verb.
- Descriptions cover key results, the metrics and how often they're reviewed, why the goal matters, and who shares responsibility.
- A good PTG gives an owner and a date for each step, testable criteria for returning to GREEN, and (for YELLOW) the trigger that turns it RED.
- Multi-step goals have intermediate milestones.
- A priority list has no more than ‹4› entries above the cut line.
- Action items leave a review with an owner and a date.

## 5. Cadence

| When | Review | Owner | Page |
|---|---|---|---|
| ‹Quarterly› | ‹Business / Product / People reviews› | ‹name› | ‹link› |
| ‹Bi-weekly› | ‹Programs review (rotating)› | ‹name› | ‹link› |
| ‹Weekly› | ‹Launch readiness› | ‹name› | ‹link› |
| ‹Daily› | ‹Team standups› | ‹each team lead› | ‹link› |
| ‹Nov–Jan› | Plan period set-up: goals and priority lists for the next period | ‹name› | |
| ‹Year end› | Period reset: close out every goal | GOALIE owner | |

## 6. How a GOALIE review runs (default format)

1. The review owner opens the review's view.
2. Discussion goes to **RED and YELLOW** goals and their PTGs. GREEN goals are skipped unless someone raises one.
3. Walk the list line by line: owner, date, date type, health, PTG.
4. Ask of each item under discussion: **"By when?"**, **"Committed, ambition, or fantasy?"**, and for plans, **"Watercolor, crayon, or pencil?"**
5. Check the promotion milestones due since last time. Each was either promoted or missed. Missed means RED.
6. At org or program level, open the **Priorities** view. Is effort concentrated at the top? Is the starvation below the line deliberate? Re-rank here, with a reason.
7. Treat surprises and poor hygiene as the important signal. Analyze the first miss of the period rigorously, without blame.
8. Every action item leaves with an owner and a date, or a date for a date.

A review owner can adapt this format. Write the changes on the review's page (Appendix B).

## 7. Outputs

- **Views:** org overview, one per org unit, *My goals*, *Promotions due*, *Priorities*, *Hygiene*, and the period-end scorecard.
- **Pre-reads:** drafted by agents before each review. They cover the RED/YELLOW list, slips, promotions due, status-theater flags, and the starvation report.
- **Period-end scorecard:** on time / late / not met, measured against original committed dates.

## 8. How we know GOALIE is working

The GOALIE owner inspects these each quarter and changes the configuration, reviews, or this manual in response.

| Signal | Target |
|---|---|
| Committed goals met on time | ‹%› |
| Committed-date slips per quarter (count, size) | ‹trend down› |
| Promotion milestones met on time | ‹%› |
| Share of the plan that is Committed, by mid-period | ‹%› |
| GREEN → RED jumps (status theater) | ‹0; each one investigated› |
| Effort concentrated in the top priorities (no peanut butter) | ‹qualitative / %› |
| Hygiene gaps open longer than one review cycle | ‹0› |

---

## Appendix A: How-tos

**Create a goal**
1. Write a short summary with a verb, e.g. "Launch self-serve onboarding".
2. Set the owner, org unit, type, and severity.
3. Map it to a priority (usually only for org or program goals).
4. Set a date and an honest date type.
5. If the date isn't Committed, add the Promotion Milestone. An agent will draft one for you to confirm.
6. Link a plan if you have one.

**Promote a date**
- **Fantasy → Ambition:** on or before the milestone date, change the date type, complete the milestone, and add the next milestone (the one for Ambition → Committed).
- **Ambition → Committed:** get the plan to Pencil, then change the date type. The committed date is recorded as the Original Committed Date.

**Report trouble**
1. Set the goal to YELLOW as soon as there is real risk. Don't wait for RED.
2. Write the PTG: steps, each with an owner and a date; criteria for returning to GREEN; and the trigger that turns it RED.

**Record a slip**
1. Set the changed due date, with a reason.
2. Set health to YELLOW or RED, and write a PTG.
3. The original date stays on record.

**Close a goal**
- Set it to Completed, Completed Late, Did Not Meet, or Deleted, with a reason. Lateness is measured against the original committed date.
- If the work finished while the date was still Ambition, promote the date and complete the goal in one step.

**Re-rank priorities**
- Do it in the scheduled review, with a reason.
- Retire entries that nothing maps to.
- Keep no more than ‹4› entries above the cut line.

**Period reset**
1. Close out every open goal.
2. Re-create any continuing work as new goals marked Carryover or Repeating, each with an honest date type.
3. Set up the new period's priority lists.

## Appendix B: Review page template

Copy this for each review in §5.

| | |
|---|---|
| **Review** | ‹name› |
| **Owner** | ‹one person› |
| **Cadence** | ‹when› |
| **Participants** | Owners of the goals in scope, plus ‹others› |
| **View** | ‹link› |
| **Pre-read** | ‹what agents prepare, and when it goes out› |
| **Agenda** | Default (§6), or: ‹changes› |
| **Outputs** | Action items (owner + date), re-rankings, promotions, and PTGs sent back |

## Appendix C: Examples

**Goal summary**
- **Weak:** "Onboarding improvements for new users in Q1" (no verb, and it's a sentence).
- **Strong:** "Launch self-serve onboarding"

**Date**
- **Weak:** "Target: March 31." Is that a promise or a hope?
- **Strong:** "Mar 31 (**Ambition**). Commit the date by **Nov 15** (GOAL-57, Committed)."

**Path to Green**
- **Weak:** "Work with vendor to resolve issue. Verify the fix in the field."
- **Strong:**
  1. Sally gets the vendor fix to Doug by noon on 04-Feb.
  2. Doug deploys to 10 beta sites by 05-Feb and reports results by 12-Feb.
  3. If the results are positive, Sally marks the goal GREEN on 12-Feb.
  4. If the results are negative before 12-Feb, the launch slips two weeks to 01-Apr and the goal goes RED.

**Priority list**
- **Weak:** 11 "top priorities", all of them staffed.
- **Strong:** 3 ranked priorities above the cut line. The description of each says what it starves.

## Changelog

| Date | Change | Why | By |
|---|---|---|---|
| ‹date› | Adopted template v0.1 | ‹› | ‹GOALIE owner› |
