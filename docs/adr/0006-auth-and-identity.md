# 0006. Auth and identity

**Status:** Accepted

**Date:** 2026-09-30

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) records auth and identity before any request is authenticated.
[SPEC.md](../../SPEC.md) §6.4 defines an actor as `human` or `agent`, requires every change to be attributed to an actor, and says only humans can own goals or org units.
[#5 (Epic 4: API, identity, and events)](https://github.com/tig/goalie/issues/5) is the API, identity, and events work.
Stage 0 does not authenticate.

## Decision

An actor is `human` or `agent`.
Every change must be attributed to an actor.
Only humans can own goals or org units.
Stage 0 does not authenticate.
`GET /health` is open.
Auth arrives with [#5 (Epic 4: API, identity, and events)](https://github.com/tig/goalie/issues/5).
Stage 0 must not add accounts, tokens, or a login page.

## Consequences

`goalie/health.py` must serve `GET /health` with no credential.
`goalie/__main__.py` must not require a login to start.
Stage 0 must not add account storage, token checks, or a login route.
When [#5 (Epic 4: API, identity, and events)](https://github.com/tig/goalie/issues/5) adds auth, a write must name an actor whose kind is `human` or `agent`.
A goal owner must be a human, as [SPEC.md](../../SPEC.md) §6.4 requires.
That issue must not split human and agent rules into a second validation layer ([0003](0003-api-style.md)).
