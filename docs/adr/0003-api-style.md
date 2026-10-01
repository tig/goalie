# 0003. API style

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires an API style before routes exist.
[SPEC.md](../../SPEC.md) §13 requires an API that can do every read and write a human can do.
[SPEC.md](../../SPEC.md) §4 and [SPEC.md](../../SPEC.md) §6 name the entities.
[SPEC.md](../../SPEC.md) §8.1 requires one validation path and one commit check.
[SPEC.md](../../SPEC.md) §13 also requires webhooks so an agent can react without holding a connection.
The model is a fixed set of entities, not a graph the client composes.

## Decision

The API is JSON over HTTP.
Resource names must use the terms in [SPEC.md](../../SPEC.md) §4 and [SPEC.md](../../SPEC.md) §6.
Every write goes through one TypeScript validation path and the single-transaction commit check ([0002](0002-storage.md)).
A structured-field write must name the version it read.
A stale structured-field write is rejected and the response returns the current state.
Markdown writes follow [0008](0008-concurrent-markdown.md), not that version reject.
A webhook is an HTTP POST of one Event JSON object, including its sequence.
The API is not GraphQL.

## Consequences

The MCP server and the app must call this validation path ([0004](0004-mcp-hosting.md), [0010](0010-app-shape.md)).
They must not keep a second copy of the rules.
A webhook receiver that sees a sequence gap must resume with [0007](0007-live-update.md).
Later code must not add a second query language.
