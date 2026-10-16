# Goalie release plan

The 5Ps for Goalie, and the plan for XW-0003. Format from Tig's [The 5 P's](https://blog.kindel.com/2011/06/14/the-5-ps-achieving-focus-in-any-endeavor/). Each section opens with his definition.
Owner: Chelsea. Spec: [SPEC.md](specs/SPEC.md), owned by Tig. This plan does not restate the spec. We change the plan in pull requests.

## 1. Purpose

*"What is the point of the plan? … What will we deliver?"*

**Goalie is an open-source goal system for companies where people and AI agents work side by side. It shows leaders where every goal stands, what matters most, and what needs a human decision.**

**The test:** a leader answers three questions in under a minute. Are we keeping our commitments? What needs me? What is next?

**What we deliver first:** XW-0003. By Nov 30, 2026, Tig, Chelsea, and agents use Goalie to drive XW execution.

## 2. Principles: project tenets

*"The Principles you debate and agree on will enable everyone involved to know how to behave throughout the endeavor."*

These say how we act while we build Goalie. How Goalie itself works is in [SPEC.md §3](specs/SPEC.md#s3).

1. **Built by agents, for agents.** We build Goalie with an agentic approach. Agents do most of the building, each with a human operator. Agents are also first-class users of what we build.
2. **The spec is the contract.** SPEC.md is the source of truth. A behavior change and its spec change land in the same pull request. Tig picks every new term.
3. **Prototype to learn, then build to spec.** A working prototype goes in front of real users first. What survives is rebuilt on the stages in [issue #1](https://github.com/tig/goalie/issues/1).
4. **Test with real people early.** Each week someone outside the build uses Goalie, Galahad first. We fix what confuses them before we add features.

## 3. Priorities

*"Priorities indicate two things: The order in which things get done and the mass applied to each."*

1. **The core loop.** See every goal, decide what matters, and act on what needs you, every week. Home, the goal page, and the decisions that wait on a human.
2. **Agents keep it true.** Agents propose health from real work, GitHub first. They flag missing dates and plans and prepare the weekly review.
3. **Prove it at a real company.** Excaliwire runs on Goalie. We change the product and the spec from what we learn.
4. **Make it anyone's.** A company sets Goalie up from the docs alone, with its own logo, colors, and configured names.

**Below the cut line, starved on purpose:** scorecards and reports, a separate work tracker (v1 keeps work items on the goal page), a full mobile app, integrations beyond GitHub.

The build order under these priorities is in [issue #1](https://github.com/tig/goalie/issues/1).

## 4. People

*"Who's accountable for every key part of the plan? Who's just an observer?"*

**Who we build for**

| Who | What they do in Goalie |
| --- | --- |
| Leaders who own goals: founders, executives, team leads | Set direction, rank Priorities, commit dates |
| People who do the work: engineers, designers, operators | Keep the health of their goals true |
| AI agents | Do work, gather evidence, propose Drafts. A human always decides. |
| Companies | First: small companies that use many agents. Later: larger companies with many levels of goals. |

**Who is accountable**

| Role | Accountable for | Who |
| --- | --- | --- |
| Approver | Goalie ships. Owns XW-0003. | Chelsea |
| Consulted: spec owner | The rules and the terms. Signs off on new terms and Committed dates. Merges. | Tig |
| Responsible: builders | Building Goalie. Each agent has a human operator. | Claude Code, operated by Chelsea. Mike's agents when Mike runs here ([#15](https://github.com/tig/goalie/issues/15)). |
| Responsible: GOALIE owner at Excaliwire | XW's configuration, reviews, and User's Manual ([SPEC.md §1](specs/SPEC.md#1-what-goalie-is)) | To name |
| User | Uses Goalie for his own goals. He has never used a tool like Jira or Goalie, so he is the usability test case. Not accountable for delivery. | Galahad |
| Informed | Kept up to date, not accountable | Design partners and developers, then the open-source community |

## 5. Plan

*"The Plan is a top-down schedule."*

**Is end of November realistic?** Yes, for a small MLP. Not for the full Goalie, which is Stage 2 of [issue #1](https://github.com/tig/goalie/issues/1).

| When | Milestone | Date Type |
| --- | --- | --- |
| Wed Oct 14, 2026 | This plan agreed | Committed |
| Fri Nov 6, 2026 | **MLP prototype live** at goalie.excaliwire.com on the walking skeleton ([#19](https://github.com/tig/goalie/issues/19)), with XW-0001, XW-0002, and XW-0003 loaded as real goals. Promotion Milestone for XW-0003. | Committed |
| Mon Nov 30, 2026 | **XW-0003:** Tig, Chelsea, and agents use Goalie to drive XW execution | Ambition, backed by Nov 6 |
| Date to set | Tig and Chelsea each use Goalie for one of their other endeavors. For example Tig's leadership coaching, or Chelsea's Controlla, piano app, or branding clients. This does not count as a second customer. | Fantasy |
| Q1 2027 | Excaliwire runs one full quarter in the app ([#13](https://github.com/tig/goalie/issues/13)). Product and spec change from what we learn. | Fantasy |
| Mid 2027 | Open-source release ([#14](https://github.com/tig/goalie/issues/14)). A company outside our circle deploys Goalie from the docs alone. | Fantasy |

**Test, learn, adjust.** Each week at Excaliwire we record what confused people, what nobody used, and what was missing. Each finding becomes an issue. The spec changes in the same pull request.

### The MLP: what "using Goalie to drive XW execution" means

A prototype built from the [v1 designs](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk), on the walking skeleton. Three epics.

**Epic 1: See XW's goals and their health.**

- As Tig, I open Goalie and see XW-0001, XW-0002, and XW-0003, each with its owner, date, Date Type, health, and Path to Green. ([§6.1](specs/SPEC.md#s6-1))
- As a goal owner, I change health or a date and write the reason. ([§3](specs/SPEC.md#s3) rule 9)
- As Chelsea, I open XW-0001 and see its sub-goals and the factory issues behind it. ([§6.1](specs/SPEC.md#s6-1), [§6.7](specs/SPEC.md#s6-7))

**Epic 2: The Priorities timeline.**

- As Tig, Goalie opens on XW's Priorities in rank order on a timeline, with health as color.
- As Tig, I see which dates are Committed and which are Ambition or Fantasy. ([§8.2](specs/SPEC.md#s8-2))

**Epic 3: Agents draft health.**

- As an agent, I read the GitHub issues behind a goal, for example factory #361 and #172, and propose a health Draft with the evidence. ([§6.9](specs/SPEC.md#s6-9), [§10](specs/SPEC.md#s10))
- As the owner, I approve or reject the Draft. Nothing changes until I do.
- Needs: agents get read access to the private Excaliwire repos.

**Not in the MLP:** the weekly review in Goalie, a separate work tracker, mobile, rollups. They follow on Tig's stages.

## Decided: the default view

On Oct 14, 2026 Tig approved: the default view is the Priorities view, drawn as a timeline, sorted by Priority rank with health as color. [SPEC.md §8.2](specs/SPEC.md#s8-2) sorts by health today. The pull request that builds the timeline changes §8.2 in the same change.
