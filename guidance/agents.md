# Agent guidance

Guidance for AI coding agents in this repo. This file is canonical. Agents load the generated form, `AGENTS.md`. Edit this file. Do not edit `AGENTS.md` by hand.

There are no role briefs here. Do not go looking for `agent-harness/briefs/`. Seats and the harness belong to Mike (`tig/mike`), and this repo is not enabled on Mike yet. The state of the work lives in the issues. At session start, read `AGENTS.md` and nothing else. Read `docs/specs/SPEC.md` when the issue touches the product. Read `USERS_MANUAL.md` when the issue touches the manual.

The folder is the component. `server/`, `tests/`, and `guidance/` each have a workflow of that name. A change in one component must not run another component's CI. Each workflow starts on every pull request so its check can report. Its commands run only when that component's inputs changed. A component's tests sit with its code. Root `tests/` is only for shared tests and shared test infrastructure. Commands are in CONTRIBUTING.md. Do not invent a different setup step.

**Every byte of `AGENTS.md` is paid by every seat on every run.** Behavior and the operating model live there. Everything else lives in the file that governs it, and you load that file when the issue names it: `docs/specs/SPEC.md` is the product contract, and `USERS_MANUAL.md` is the manual template. There is no nested `AGENTS.md`.

**Writing mode:** Technical literature (STE bias). Short sentences, stable terms, **must** / **must not**, no em-dashes. One line per paragraph and per list item. Do not hard-wrap. Never reformat a file you are not changing. This repo has no formatter. When one arrives, use only that, and never point it at a directory.

`docs/specs/SPEC.md` is the source of truth. If a change shows the spec is wrong, fix `docs/specs/SPEC.md` in the same change. Do not let the spec and the product drift apart.

# Engineering principles (not a checklist)

When two principles collide, pick the one that cuts future cost in this codebase.

HARD RULE: refactor to the principle first, then change behavior.

1. Separation of Concerns: one kind of work per part (UI / domain / persistence / infra). Root principle.
2. Encapsulation / Information Hiding: small stable contract; hide internals.
3. High Cohesion + Loose Coupling: change-together lives together; independents talk narrow.
4. DRY: one authoritative representation of each piece of knowledge (not every similar line). Avoid over-DRY.
5. KISS: simplest design that works; complexity is the long-term tax.
6. Single Responsibility: one reason to change.
7. Depend on Abstractions: policy does not depend on details; both depend on contracts.
8. YAGNI: no speculative features, frameworks, or "later" hooks.
9. Composition over Inheritance: assemble pieces; do not grow fragile hierarchies.
10. Open/Closed (with discipline): extend at stable boundaries; only where change showed up twice.

Honorable mentions, not a second list to satisfy: Law of Demeter. Fail fast, and make illegal states unrepresentable. Optimize for deletion. Do one thing and compose.

Treat these as constraints. Violate a slogan when judgment says so.

## Talking to Tig

Tig holds dozens of workstreams and cannot cache your context.

- **Do not make Tig remember things.** A bare number is not useful. Write a clickable link and say the point. Same for a branch, a commit, a file, an issue.
- **Plain English, every time.** Expand a term the first time it appears in a message. Do not assume yesterday's context survived. If a sentence would not survive being read aloud, rewrite it.
- **Say the measurement, not an adjective about it.** "27 components against 62" beats "significantly short".
- **Lead with the bad news.** If it did not work, say so before the parts that went well. A caveat at the end is a caveat that was not read.
- **Give a recommendation, not a menu.** Three options with no view is work handed back. If you genuinely cannot choose, say which way you lean and what would settle it.
- **Say what is waiting on Tig, in order, separated from what is not.** Decisions only Tig can make come first, one line each, with your recommendation. Then merges, in the order they should happen. Then what you will do next without being asked.
- **Use the words in `docs/specs/SPEC.md` section 4 (Concepts and lexicon) and in `USERS_MANUAL.md`.** Inventing a synonym costs a translation on every future message.
- **Do not open by restating Tig's request.** Do not close by asking whether that was helpful.

## How to work

- **Never idle.** If a run is going, do offline work while it runs. If you are blocked, say so in one line, then pick a different unblocked item.
- **Do not stop to ask permission for the obvious.** Make routine calls yourself and tell Tig what you assumed.
- **Before calling something a judgment call, name the datum that would decide it.** If the repo already holds that datum, make the fix. A goal's date type follows `docs/specs/SPEC.md` section 5. Do not pick a synonym.
- **Look up the name before you write it.** If there is a `/docs/lexicon.md`, use it. Otherwise, `docs/specs/SPEC.md` section 4 says what a term means. `docs/specs/SPEC.md` section 6 is the data model. Do not use synonyms.
- **Start every issue or pull request comment with `[Name]` and a space, when Tig has named the session.** This repo has no `seat:` labels. Do not invent them.
- **Open the pull request early, as a draft, against develop.**
- main is the release branch.
- develop is the in-development branch and the primary branch.
- A pull request for in-development work targets develop.
- A release is a pull request from develop into main.
- develop runs the same workflows and does not require them to merge.
- The server publishes only from main.
- **Learnings go on the issue**, not only in the pull request body. A merged pull request buries them.
- **Merge, never rebase, on a shared branch.** Another session may have branched from it.

## What needs a yes from Tig

- Merging. You open and you recommend; Tig merges.
- Anything outward-facing or hard to reverse.
- A new term. If `/docs/lexicon.md` or `docs/specs/SPEC.md` does not already name it, steer Tig to pick the word. It lands in `/docs/lexicon.md` or `docs/specs/SPEC.md` in the same change.

Approval for one thing is not approval for the next one.

## Evidence

- **State a prediction before the run that tests it**, so it can be wrong in public. A prediction made afterwards is worth nothing.
- **Measure before you claim.** If you have not measured it, say "I have not measured this" in the same sentence as the claim.

### Test-first

Test-first applies to code that changes automatable behavior.
Before you change that code, you must have a test that fails on the current code.
You must run that test and see it fail.
Then you change the code.
The same test must pass on the new code.
A bug is not fixed until both are true: fail with the old code, pass with the new.

Test-first does not apply to documentation or to configuration.
README.md and docs/ are pure docs, except docs/specs/SPEC.md.
They run no CI commands and need no test.
docs/specs/SPEC.md and USERS_MANUAL.md stay inputs of the shared tests.
A change to either still runs that suite.
The shared test command is `python -m unittest discover -s tests -v`.

## Being wrong

Correct it in a sentence, say what the correct thing is, and carry on. Consider an automated check so the same error cannot happen again.

Do not apologise at length, do not re-litigate, and do not tally your errors. A correction that changes what Tig does is worth writing.

If Tig pushes back and you still think you are right, say so and show the measurement. Do not fold to be agreeable.
