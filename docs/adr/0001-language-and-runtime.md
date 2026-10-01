# 0001. Language and runtime

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires a language before the store, the API, or the app can be built.
[SPEC.md](../../SPEC.md) is implementation-neutral and names no language.
The repo already runs Python for `.github/scripts/agent_forms.py` and `tests/`.
This machine runs Python 3.14.6.
A second server language would split the validation that [SPEC.md](../../SPEC.md) §8.1 requires to happen once, on the server, in one transaction.

## Decision

The server language is Python 3.12 or newer.
The HTTP stack is Starlette, served by uvicorn, as one process.
The MCP server mounts into that same Starlette app ([0004](0004-mcp-hosting.md)).
The store uses the standard-library `sqlite3` module ([0002](0002-storage.md)).
Browser JavaScript is allowed only for the app behaviors in [0010](0010-app-shape.md).
The server must not add a second language.

## Consequences

Later code must run on Python 3.12 or newer.
Later code must not introduce a second server runtime.
Validation, the commit check, and writes to the store must live in this Python process.
The browser must not contain a second copy of those rules.
