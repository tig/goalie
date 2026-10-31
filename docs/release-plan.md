# Release plan

**Status:** Proposed

**Date:** 2026-10-16

**Owner:** Chelsea

This is the 5Ps for GOALIE. The format is [The 5 P's](https://blog.kindel.com/2011/06/14/the-5-ps-achieving-focus-in-any-endeavor/).
The product contract is [SPEC.md](specs/SPEC.md). This plan does not restate it.
The build order is [#1 (Build GOALIE)](https://github.com/tig/goalie/issues/1). This plan does not restate it.
This plan changes by pull request.

## 1. Purpose

GOALIE is an open-source goal system for organizations where humans and AI agents work side by side.
It shows a leader where every goal stands, what matters most, and what needs a human decision.
The test: a leader answers three questions in under one minute. Are we keeping our commitments? What needs me? What is next?
The first deliverable is XW-0003: by Nov 30, 2026, Tig, Chelsea, and agents use GOALIE to drive Excaliwire execution.

## 2. Principles

These are project tenets. They say how we act while we build GOALIE.
How GOALIE works is [SPEC.md §3](specs/SPEC.md#s3).

1. **Built by agents, for agents.** Agents do most of the building. Each agent has a human operator. Agents are first-class users of what we build.
2. **The spec is the contract.** [SPEC.md](specs/SPEC.md) is the source of truth. A behavior change and its spec change land in the same pull request. Tig picks every new term.
3. **Prototype to learn, then build to spec.** A working prototype goes in front of real users first. What survives is rebuilt on the stages in [#1 (Build GOALIE)](https://github.com/tig/goalie/issues/1).
4. **Test with real people early.** Every week one person outside the build uses GOALIE. We fix what confused them before we add a feature.

## 3. Priorities

1. **The core loop.** See every goal, decide what matters, act on what needs a human, every week. Home, the goal page, and the Drafts that wait on an owner.
2. **Agents keep it true.** Agents propose health from real work, GitHub first. They flag a missing date or plan. They prepare the weekly review.
3. **Prove it at a real organization.** Excaliwire runs on GOALIE. The product and the spec change from what we learn.
4. **Make it anyone's.** An organization sets GOALIE up from the docs alone, with its own logo, colors, and configured names.

Below the cut line, starved on purpose: reports beyond the standard views in [SPEC.md §8.2](specs/SPEC.md#s8-2), a separate work tracker, a mobile app, integrations beyond GitHub.
In v1, work items live on the goal page.

## 4. People

Who GOALIE is for:

| Who | What they do in GOALIE |
| --- | --- |
| A leader who owns goals: founder, executive, team lead | Sets direction, ranks Priorities, commits dates |
| A person who does the work: engineer, designer, operator | Keeps the health of their goals true |
| An agent | Does work, gathers evidence, proposes Drafts. A human decides. |
| An organization | First a small organization with many agents. Later a larger organization with many levels of goals. |

Who is accountable:

| Role | Accountable for | Who |
| --- | --- | --- |
| Approver | GOALIE ships. Owner of XW-0003. | Chelsea |
| Consulted | The spec and its terms. Signs off on a new term and on a Committed date. Merges. | Tig |
| Responsible: build | Building GOALIE. | Claude Code, operated by Chelsea. Mike's seats once [#15 (Epic 0: Mike-enable tig/goalie)](https://github.com/tig/goalie/issues/15) is done. |
| Responsible: Excaliwire deployment | The Excaliwire configuration, reviews, and User's Manual ([SPEC.md §1](specs/SPEC.md#1-what-goalie-is)). | Tig |
| User | Uses GOALIE for his own goals. He has not used a tool like Jira or GOALIE. He is the usability test case. Not accountable for delivery. | Galahad |
| Informed | Kept up to date. Not accountable. | Design partners and developers, then the open-source community |

## 5. Plan

| When | Milestone | Date Type |
| --- | --- | --- |
| Wed Oct 14, 2026 | This plan is agreed. | Committed |
| Fri Nov 6, 2026 | The MLP prototype runs at goalie.excaliwire.com on the walking skeleton from [#19 (Stage 0.5: Walking skeleton that deploys)](https://github.com/tig/goalie/issues/19). XW-0001, XW-0002, and XW-0003 are loaded as real goals. This is the Promotion Milestone for XW-0003. | Committed |
| Mon Nov 30, 2026 | XW-0003: Tig, Chelsea, and agents use GOALIE to drive Excaliwire execution. | Ambition |
| Fri Jan 29, 2027 | Tig and Chelsea each run one other endeavor on GOALIE. Examples: Tig's leadership coaching, Chelsea's Controlla. This is not a second customer. | Fantasy |
| Q1 2027 | Excaliwire completes one quarter on GOALIE ([#13 (Epic 11: First deployment: Excaliwire pilot)](https://github.com/tig/goalie/issues/13)). | Fantasy |
| Mid 2027 | Open-source release ([#14 (Epic 13: Open-source release: packaging, docs, multi-org)](https://github.com/tig/goalie/issues/14)). An organization outside our circle deploys GOALIE from the docs alone. | Fantasy |

Each week at Excaliwire we record what confused people, what nobody used, and what was missing. Each finding becomes an issue. The spec changes in the same pull request.

### The MLP

"Using GOALIE to drive Excaliwire execution" means the three epics below.
The MLP is a prototype built from the [v1 designs](https://claude.ai/artifact/KL6KBcJMeBMG3Cr7bPWyMk). It runs on the walking skeleton. It is rebuilt on the stages in #1 after Nov 30.

**Epic 1: See Excaliwire's goals and their health.**

- As Tig, I open GOALIE and see XW-0001, XW-0002, and XW-0003, each with its owner, date, Date Type, health, and Path to Green ([§6.1](specs/SPEC.md#s6-1)).
- As a goal owner, I change health or a date and write the reason ([§3](specs/SPEC.md#s3) rule 9).
- As Chelsea, I open XW-0001 and see its sub-goals and the factory issues behind it ([§6.1](specs/SPEC.md#s6-1), [§6.7](specs/SPEC.md#s6-7)).

**Epic 2: The Priorities timeline.**

- As Tig, GOALIE opens on Excaliwire's Priorities in rank order on a timeline. Health is the color.
- As Tig, I see which date is Committed and which is Ambition or Fantasy ([§8.2](specs/SPEC.md#s8-2)).

**Epic 3: Agents draft health.**

- As an agent, I read the GitHub issues behind a goal, for example factory #361 and #172, and propose a health Draft with the evidence ([§6.9](specs/SPEC.md#s6-9), [§10](specs/SPEC.md#s10)).
- As a human, I approve or reject the Draft. Nothing changes until I do.
- Agents must have read access to the Excaliwire repos.

Not in the MLP: the weekly review inside GOALIE, a separate work tracker, mobile, rollups.

### One live GOALIE for Tig and Chelsea

Tig and Chelsea sign in to goalie.excaliwire.com and see the same goals. These items block it, in order:

- [ ] Tig accepts the amendment to [ADR 0005](adr/0005-auth-and-identity.md): the first deployment has more than one human actor.
- [ ] The Excaliwire Entra ID gate ([ADR 0005](adr/0005-auth-and-identity.md), oauth2-proxy) lets both Tig and Chelsea through. Waits on Tig's and Chelsea's first sign-in ([excaliwire/operations#171](https://github.com/excaliwire/operations/issues/171)). Measured so far: an unsigned request answers 302 to `/oauth2/start`, and the gate passes its access token to GOALIE ([operations#171](https://github.com/excaliwire/operations/issues/171#issuecomment-6533165956)).
- [x] The host's issuer list names the Excaliwire tenant. Measured: the host's `GOALIE_ISSUERS` names the tenant's v2 issuer, and `/` with no token answers 401 from GOALIE ([operations#171](https://github.com/excaliwire/operations/issues/171#issuecomment-6533165956)).
- [x] The host's store is seeded once from `server/seed/excaliwire.json` ([CONTRIBUTING.md](../CONTRIBUTING.md)). Tig and Chelsea are its human actors. XW-0001, XW-0002, and XW-0003 are its goals. Done ([operations#171](https://github.com/excaliwire/operations/issues/171#issuecomment-6531944620)).
- [x] The GOALIE owner sets Tig's and Chelsea's Entra object ids (`oid`) as the subjects of their actors in the host's store. The seed names neither subject. Done ([operations#171](https://github.com/excaliwire/operations/issues/171#issuecomment-6531944620)).
- [x] [#52 (XW-0003 MLP)](https://github.com/tig/goalie/pull/52) leaves draft. Tig merges `chelsea/mlp` into develop, at a3845a5.
- [x] #52's code is live. An operator dispatched the server workflow on `chelsea/mlp` at cfe7318 ([run 41116472005](https://github.com/tig/goalie/actions/runs/41116472005)). The push to develop that merged #52 skipped the publish under the old rule ([run 41123574578](https://github.com/tig/goalie/actions/runs/41123574578)).
- [ ] The push to develop that merges [#55](https://github.com/tig/goalie/pull/55) publishes develop. develop at a3845a5 has the same tree as cfe7318, so that publish changes no code. A push to main does not publish.
- [ ] Tig and Chelsea each sign in and open Home. Each sees the same Priorities, goals, and health.

## Decisions

1. The default view is the Priorities view, drawn as a timeline, sorted by Priority rank. Health is the color. Decided by Tig on 2026-10-14. [SPEC.md §8.2](specs/SPEC.md#s8-2) sorts by health today. The pull request that builds the view changes §8.2.
2. [SPEC.md §1](specs/SPEC.md#1-what-goalie-is) gains the Purpose statement and the one-minute test above. Separate pull request.
3. Tig's use of GOALIE for another endeavor is a milestone, not a customer. A customer is outside our circle.
