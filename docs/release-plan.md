# Release plan

This is the 5Ps plan for Goalie: Purpose, Principles, Priorities, People, and Plan.
The format is from Tig's post [The 5 P's](https://blog.kindel.com/2011/06/14/the-5-ps-achieving-focus-in-any-endeavor/). Each section opens with his definition.
Goalie is an open-source product. Excaliwire is the first company to test it.
Owner: Chelsea. Spec owner: Tig. We change this plan in pull requests and merge when we agree.

## 1. Purpose

*"What is the point of the plan? … What will we deliver?"*

**Goalie is an open-source goal system for companies where people and AI agents work side by side. It shows leaders where every goal stands, what matters most, and what needs a human decision. Promises are kept and surprises are rare.**

| Who it is for | What they do in Goalie |
| --- | --- |
| Leaders who own goals: founders, executives, team leads | Set direction, rank Priorities, commit dates |
| People who do the work: engineers, designers, operators | Keep the health of their goals true |
| AI agents | Do work, gather evidence, and propose Drafts. A human always decides. |
| Companies of any size | First fit: small companies that use many agents. Later: larger companies with many levels of goals. |

**The test:** a leader answers three questions in under a minute. Are we keeping our commitments? What needs me? What is next?

## 2. Principles

*"The Principles you debate and agree on will enable everyone involved to know how to behave throughout the endeavor."*

These are project tenets. They tell us how we act while we build Goalie.
How Goalie itself works is in [SPEC.md §3](specs/SPEC.md#s3). This plan does not repeat it.

1. **Built by agents, for agents.** We build Goalie with an agentic approach: agents write most of the code, and each agent has a human operator. Agents are also first-class users of what we build.
2. **The spec is the contract.** [SPEC.md](specs/SPEC.md) is the source of truth. A behavior change and its SPEC.md change land in the same pull request. Tig picks every new term.
3. **We use Goalie to build Goalie.** Goalie's own goals move into Goalie as soon as it can hold them.
4. **Issues hold the work.** Work starts as an issue. A pull request opens early, as a draft, against develop. Tig merges.
5. **Test with real people early.** Each week someone outside the build uses Goalie. We fix what confuses them before we add features.
6. **Bad news first.** We say a date is at risk the week we know it.
7. **Decide in writing.** A decision and its reason go on its issue or pull request.

## 3. Priorities

*"Priorities indicate two things: The order in which things get done and the mass applied to each."*

1. **The core loop.** See every goal, decide what matters, and act on what needs you, every week. The screens are Home, the goal page, and the decisions that wait on a human.
2. **Agents keep it true.** Agents propose health changes from real work, GitHub first. They flag missing dates and plans, and they prepare the weekly review.
3. **Prove it at a real company.** Excaliwire runs on Goalie. We learn what works and change the product and the spec as we go.
4. **Make it anyone's.** A company sets Goalie up from the docs alone, with its own logo, colors, and configured names.

**Below the cut line, starved on purpose:** scorecards and reports, a separate work tracker (v1 keeps work items on the goal page), a full mobile app, live co-editing, and integrations beyond GitHub.

## 4. People

*"Who's accountable for every key part of the plan? Who's just an observer?"*

The roles stay the same as the team grows. The last column shows who holds each role today.

| Role | Accountable for | Today |
| --- | --- | --- |
| Approver: product owner | Goalie ships | Chelsea |
| Consulted: spec owner | The rules and the terms. Signs off on new terms and on Committed dates. | Tig |
| Responsible: builders | Building Goalie. Each agent has a human operator. | Claude Code, operated by Chelsea. Mike later. Engineers as they join. |
| Responsible: pilot company | Uses Goalie for real and reports what breaks | Excaliwire |
| User | Uses Goalie for his own goals. He has never used a tool like Jira or Goalie, so he is the test case for usability. | Galahad |
| Informed | Kept up to date, not accountable | Design partners and developers, then the open-source community |

## 5. Plan

*"The Plan is a top-down schedule."*

**Test, learn, adjust.** Each week at the pilot company we record what confused people, what nobody used, and what was missing. Each finding becomes an issue. The spec changes in the same pull request.

| When | Milestone | Date Type |
| --- | --- | --- |
| Wed Oct 14, 2026 | This plan agreed | Committed |
| Mon Oct 19, 2026 | First weekly review at Excaliwire, on the v1 designs, with real goals | Ambition |
| Wed Oct 28, 2026 | v1 scope and build dates set. Each Fantasy date below gets a Promotion Milestone. | Committed |
| Mon Nov 30, 2026 | v1 in daily use at Excaliwire | Fantasy |
| Q4 2026 | Tig uses Goalie for another of his endeavors, for example his leadership practice | Fantasy |
| Q1 2027 | One full quarter at Excaliwire. The product and the spec change from what we learn. | Fantasy |
| Q1 2027 | A second company pilots Goalie, set up from the docs alone | Fantasy |
| Mid 2027 | Open-source release | Fantasy |

The second company must be outside our circle. Tig's own endeavors do not count as that company, so they are a separate milestone.
The quarter at Excaliwire and the open-source release match the build plan in [#13](https://github.com/tig/goalie/issues/13) and [#14](https://github.com/tig/goalie/issues/14).
The v1 designs are on the [Goalie v1 canvas](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk).

## 6. Requirements we build to

Every rule here comes from [SPEC.md](specs/SPEC.md). This plan does not change the spec.

| # | Rule | Spec |
| --- | --- | --- |
| 1 | Every goal has one date with a Date Type. An Ambition or Fantasy date has a Promotion Milestone with a Committed date. | [§5](specs/SPEC.md#s5) |
| 2 | The owner sets health. Health is judged against the Committed date: the goal's own date, or its Promotion Milestone's date. | [§6.1](specs/SPEC.md#s6-1) |
| 3 | A missed Committed date or a missed Promotion Milestone turns the goal RED. | [§8.1](specs/SPEC.md#s8-1) |
| 4 | A sub-goal is a goal with a parent. A multi-step goal has intermediate milestones, each with an owner and a date. | [§3](specs/SPEC.md#s3), [§6.1](specs/SPEC.md#s6-1) |
| 5 | Every goal belongs to one org unit. The goal page groups sub-goals by org unit. | [§6.1](specs/SPEC.md#s6-1), [§6.2](specs/SPEC.md#62-org-unit) |
| 6 | A blocker is a health reason, not a link. YELLOW means real unknowns or blockers. The Path to Green says how they clear. | [§6.1](specs/SPEC.md#s6-1) |
| 7 | Work items belong to a goal or a sub-goal. They are evidence for health. | [§6.7](specs/SPEC.md#s6-7) |
| 8 | An agent proposes a health change as a Draft. Only the owner approves it. | [§6.9](specs/SPEC.md#s6-9), [§10](specs/SPEC.md#s10) |

**The agent's health rule.** This is a suggestion. Tig sets the thresholds.

- RED: the Committed date or the Promotion Milestone has passed. Or the goal's date is Committed and the work, at its pace so far, finishes after that date.
- YELLOW: the goal's date is Ambition or Fantasy and the work, at its pace so far, finishes after that date. Or 10% or more of the work items due so far are late.
- GREEN: all other cases.

## 7. The default view: Priorities on a timeline

**Decided on Oct 14, 2026.** Tig approved both points.

1. The default view is the Priorities view, drawn as a timeline.
2. It sorts by Priority rank, not by health. Health shows as color.

**Why a timeline.** A leader has many moving pieces. The timeline gives one concrete view of what must be done first and what can be done later.
It is in Priority order, so a leader goes from top to bottom through every goal, one by one.
A lower priority can often wait longer than the one above it. It sits lower, and its date can sit later. The leader sees the rank and the timing at once.
Every part comes from the spec: a ranked Priority list with a cut line ([§6.3](specs/SPEC.md#s6-3)), the Date Type next to every date ([§8.2](specs/SPEC.md#s8-2)), and health judged against the Committed date ([§6.1](specs/SPEC.md#s6-1)).

**The default sort changes from the spec.** [§8.2](specs/SPEC.md#s8-2) sorts views by health, RED first. The default view sorts by rank instead. This pull request does not change SPEC.md. The view work that ships it changes §8.2 in the same pull request.
