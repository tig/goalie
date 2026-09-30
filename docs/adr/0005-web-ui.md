# 0005. Web UI

**Status:** Accepted

**Date:** 2026-09-30

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) records the web UI approach.
[#1 (Build GOALIE)](https://github.com/tig/goalie/issues/1) says build for agents first: the API and the MCP server come before the UI.
[#8 (Epic 7: Views and web UI)](https://github.com/tig/goalie/issues/8) is that UI.
[SPEC.md](../../SPEC.md) §8.2 describes views.
Stage 0 has no UI.

## Decision

There is no UI in Stage 0.
The UI comes after the API and the MCP server.
When the UI exists, it is server-rendered and calls the same API.
It is not a single-page app.
This repo has no JavaScript toolchain for Stage 0.

## Consequences

Stage 0 must not add UI routes, UI templates, or a JavaScript toolchain.
The `Dockerfile` must not gain a JavaScript build.
`.github/workflows/ci.yml` must not install or run a JavaScript toolchain.
When [#8 (Epic 7: Views and web UI)](https://github.com/tig/goalie/issues/8) adds the UI, the pages must be server-rendered and must call the API in [0003](0003-api-style.md).
The UI must not write storage except through that API.
The UI must not carry its own copy of the validation layer.
