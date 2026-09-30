# 0003. API style

**Status:** Accepted

**Date:** 2026-09-30

## Context

[Issue #21](https://github.com/tig/goalie/issues/21) records the API style before any route exists.
[Issue #1](https://github.com/tig/goalie/issues/1) requires one validation layer, and it builds the API before the UI.
[SPEC.md](../../SPEC.md) §4 names the concepts, and [SPEC.md](../../SPEC.md) §6 names the entities.
[SPEC.md](../../SPEC.md) §13 requires an API that agents can use for every read and write.
Stage 0 exposes no domain route.

## Decision

The API is JSON over HTTP.
Resource names must use [SPEC.md](../../SPEC.md) §4 and [SPEC.md](../../SPEC.md) §6.
One validation layer sits in front of every write.
The API, the MCP server, and the UI must not each invent a rule.
The API is not GraphQL.
Stage 0 exposes no domain route.
The only route in the walking skeleton is `GET /health`.

## Consequences

`goalie/health.py` implements `GET /health`.
`goalie/__main__.py` serves that process.
`GET /health` is a process check.
It is not goal Health in [SPEC.md](../../SPEC.md) §4.
[0007](0007-deployment-target.md) requires HTTP 200 and the body `{"status":"ok"}` followed by a newline.
Stage 0 must not add a domain route.
The validation layer is not built in Stage 0, because Stage 0 has no domain write.
When a write exists, it must pass that one layer inside `goalie/`.
The MCP server and the UI must call it, not a copy.
