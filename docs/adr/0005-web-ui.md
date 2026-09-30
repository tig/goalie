# 0005. Web UI

**Status:** Accepted

**Date:** 2026-09-30

## Context

[Issue #21](https://github.com/tig/goalie/issues/21) records the web UI approach.
[Issue #1](https://github.com/tig/goalie/issues/1) says build for agents first: the API and the MCP server come before the UI.
[Issue #8](https://github.com/tig/goalie/issues/8) is that UI.
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
When [issue #8](https://github.com/tig/goalie/issues/8) adds the UI, the pages must be server-rendered and must call the API in [0003](0003-api-style.md).
The UI must not write storage except through that API.
The UI must not carry its own copy of the validation layer.
