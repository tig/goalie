# 0004. MCP hosting

**Status:** Accepted

**Date:** 2026-09-30

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) records how the MCP server is hosted.
[#6 (Epic 5: MCP server)](https://github.com/tig/goalie/issues/6) adds the MCP server after the API in [#5 (Epic 4: API, identity, and events)](https://github.com/tig/goalie/issues/5).
[SPEC.md](../../SPEC.md) §13 requires an API complete enough for agents, ideally as an MCP server.
[SPEC.md](../../SPEC.md) §1.1 treats agents as participants under the same rules as humans.
Stage 0 does not mount the MCP server.

## Decision

The MCP server runs in the same process as the API.
[#6 (Epic 5: MCP server)](https://github.com/tig/goalie/issues/6) adds it.
It is not a second deploy.
It is not a second language.
Stage 0 does not mount it.

## Consequences

`goalie/__main__.py` is the one process entry.
[#6 (Epic 5: MCP server)](https://github.com/tig/goalie/issues/6) must add the MCP server in that process, not in a second program.
The `Dockerfile` must still produce one process.
`.github/workflows/deploy.yml` must still run one container.
Stage 0 must not mount an MCP endpoint from `goalie/health.py` or `goalie/__main__.py`.
The MCP server must use the same validation layer as the API ([0003](0003-api-style.md)).
