# MLP review

**Status:** Round 1 fixed. Round 2 not run yet

**Date:** 2026-10-22

**Owner:** Chelsea

This is the review list for pull request #52 (XW-0003 MLP). It is overwritten each round.
Reviewers: QA, Head of Engineering, and the Experience pair (User and UI/UX designer). Round 1 read commit 05ff75b. The fixes are in 285cf8f.
Status words: **blocks** stops the merge, **open** is a real problem with a clear fix, **yours** is Chelsea's call, **Tig** is a word or decision for Tig, **fixed** is done.

## Summary

| Status | Count |
| --- | --- |
| blocks | 0 |
| open | 0 |
| decided | 1 |
| Tig | 4 |
| fixed | 51 |

The one-minute test (release plan §1), User as Tig: Q1 "Are we keeping our commitments?" yes, about 15 s. Q2 "What needs me?" no. Q3 "What is next?" partly, about 20 s, no owner names. The test fails. Round 2 runs it again.

## Code: QA

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| Q1 | fixed | write.ts | An agent's write to a goal takes effect with no human approval (SPEC §6.9, §10, §13.22) | Reject goal and priority writes from an agent: rule `agent-writes-a-draft` |
| Q2 | fixed | rules.ts | Dates are checked by pattern only. "2026-13-45" is accepted, and one such goal breaks Home for everyone | Parse dates as real calendar dates |
| Q3 | fixed | rules.ts | A goal can be its own ancestor. Home then fails for everyone | Rule `parent-not-cycle` |
| Q4 | fixed | tests | No test for the real Entra key path, key refetch, nbf, a malformed token, a slip, a Promotion Milestone due, or an empty Priority | Add the tests |
| Q5 | fixed | auth.ts | A failed key fetch crashes instead of refusing | Catch and refuse |
| Q6 | fixed | auth.ts | Any caller can make the server refetch Entra keys on every request | One refetch per issuer per 5 minutes |
| Q7 | fixed | priorities.ts | One old goal anywhere pushes today off the timeline | Scope to the view's goals; keep today inside the window |
| Q8 | fixed | priorities.ts | Home ignores the saved view definition: Completed and Team goals show | Apply the definition |
| Q9 | fixed | rules.ts | Fantasy to Committed in one step, Completed with a Fantasy date, and Completed back to Backlog are accepted (SPEC §5, §7) | Add the §7.1 and §7.2 transitions |
| Q10 | fixed | server.ts | The sign-in page drops the reason ("no human actor for this token") | Show the reason |
| Q11 | fixed | write.ts | A wrong-typed value crashes the write path | Rule `field-value` |
| Q12 | fixed | seed.ts | The seed is not one transaction | One transaction |

## Code: Head of Engineering

| # | Status | Where | Finding | Fix |
| --- | --- | --- | --- | --- |
| E1 | fixed | write.ts, seed.ts | Owner settings and user settings accept writes from anyone (ADR 0011). The seed writes owner settings as Chelsea | Settings write rules; seed owner settings as Tig |
| E2 | fixed | priorities.ts | The screen is not drawn from its saved definition (ADR 0010) | Drive select, states, and sort from the definition |
| E3 | fixed | priorities.ts, rules.ts | "The date a goal is judged against" is written four times | One domain module for goal rules |
| E4 | fixed | home.ts | "/ Excaliwire" typed into the top bar | Use the org unit's name |
| E5 | fixed | home.ts | One named person has their own avatar color in CSS | Color from a token palette by actor id |
| E6 | fixed | home.ts | Brand literals (title, logo, chrome, font) in code | One brand object |
| E7 | fixed | home.ts | Raw colors outside the tokens | Make each a token |
| E8 | fixed | home.ts | "Company goals" and the level "Company" are literals | Read from the org unit |
| E9 | fixed | config.ts, cli.ts | Defaults name one deployment ("excaliwire", "chelsea") | Default to the root org unit and the GOALIE owner |
| E10 | fixed | write.ts | Visibility default is a literal | One home for the default |
| E11 | fixed | write.ts, seed.ts | New goals get GOAL-n, seeded goals are XW-n | Key prefix as an owner setting |
| E12 | fixed | priorities.ts | 4 to 6 queries per goal row | Load once, build from memory |
| E13 | fixed | write.ts | The store check reads 1+N rows per kind | Read once |
| E14 | fixed | write.ts | The foreign-key check scans the whole table on every write. Not measured | Check the written row only |
| E15 | fixed | write.ts, auth.ts | Reads live in the write module; auth has a third read path | Move reads to one read module |
| E16 | fixed | priorities.ts | The open Drafts count can never change | Count Drafts until the Drafts slice |
| E17 | fixed | store.ts, seed.ts | The cut line is text holding "true" | One type |
| E18 | fixed | priorities.ts | No period filter | Filter on the current period |
| E19 | fixed | priorities.ts | State lists repeated as literals | Name them once |
| E20 | fixed | home.ts | Rank badge drawn twice | One component |
| E21 | fixed | home.ts | Home and sign-in repeat the page shell | One layout |
| E22 | fixed | home.ts | CSS in the page logic file | Its own module |
| E23 | fixed | priorities.ts | English month table, fixed window | Use Intl for labels |

## Experience: User and UI/UX designer

| # | Status | Who hit it | Finding | Fix |
| --- | --- | --- | --- | --- |
| X1 | fixed | Design, Galahad | "Company goals" and "sub-goal" are not spec words | Title from the org unit's name; drop the count word until Tig picks one |
| X2 | fixed | Tig | At phone width a date wraps ("Fantasy Nov" / "30") | No wrap inside a date |
| X3 | fixed | Tig, Chelsea | Titles are cut with "…" | Wrap to two lines. A title longer than two lines still ends in "…", with the full title on hover |
| X4 | fixed | Tig | "What needs me?" can't be answered: XW-0001 is RED and no Path to Green or decision shows | Show the PTG line under RED and YELLOW rows |
| X5 | fixed | Tig | Health isn't the color of the bars | Tint each bar with its health |
| X6 | fixed | Galahad, Tig | "1 of 3 GREEN" over a red, yellow, green meter reads as a contradiction | "1 RED · 1 YELLOW · 1 GREEN" |
| X7 | fixed | Galahad, Tig | Owners are a bare letter | Show the owner's name |
| X8 | fixed | Galahad, Chelsea | "Backlog" is both a grey pill and the cut line | No pill for a goal with no health |
| X9 | fixed | Chelsea | Eight identical "Committed Nov 6" bars | Draw a sub-goal's date only when it differs from its parent's |
| X10 | fixed | Galahad | "Promotion Milestone" has no explanation | One plain sentence on the card; a short legend note |
| X11 | fixed | Design | Two text colors below 4.5:1 contrast | Darken; 12 px minimum |
| X12 | fixed | Design | Some colors not tokens | Tokens |
| X13 | fixed | Chelsea | Expand arrow is 26 px, needs 44; no keyboard focus ring | Whole row is the target; focus ring |
| X14 | fixed | Tig | On a phone Tig scrolls a full screen before goal 1 | Priorities first, compact cards |
| X15 | decided | Galahad | Nothing to click | Recommendation: no "New goal" button until creating a goal works. A dead button is worse |
| X16 | fixed | Galahad | No mark for "my goals" | Recommendation: outline the viewer's own avatar |
| X17 | Tig | Chelsea | XW-0003 doesn't say which date is its own | Recommendation: wait for Tig's word |

## For Tig

| # | Question |
| --- | --- |
| T1 | The word for a goal under another goal. The canvas and #47 say "sub-goal". SPEC.md says only "parent". |
| T2 | The title of Home. The Experience pair recommends the org unit's name. |
| T3 | A line that names a goal's own date when it also has a Promotion Milestone. |
