# 0004. MCP hosting

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires a decision on how the MCP server is hosted.
[SPEC.md](../../SPEC.md) §13 requires an API complete enough for agents, ideally as an MCP server.
[SPEC.md](../../SPEC.md) §1.1 says agents and humans follow the same rules.
[SPEC.md](../../SPEC.md) §6.6 says agents subscribe to the same change stream as views.
The official MCP Python SDK serves Streamable HTTP as a Starlette app, and it can be mounted into an existing ASGI app.

## Decision

The MCP server runs inside the same Starlette process as the API ([0001](0001-language-and-runtime.md)).
Its deployment transport is Streamable HTTP on that process.
Its tools call the same Python functions the HTTP API calls.
It must not be a second process, a second deploy, or a second language.
Stdio is not the deployment transport.

## Consequences

One process start must bring up the API and the MCP server together.
An agent that changes data must pass the same validation and the same actor rules as a human ([0003](0003-api-style.md), [0005](0005-auth-and-identity.md)).
An agent that wants the change stream uses [0007](0007-live-update.md), not a private stream.
