# 0001. Language and runtime

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires a language before the store, the API, or the app can be built.
[SPEC.md](../../SPEC.md) is implementation-neutral and names no language.
The app already uses browser JavaScript for live updates, the Markdown CRDT, and Presence ([0010](0010-app-shape.md)).
The Markdown CRDT is Yjs ([0008](0008-concurrent-markdown.md)).
A TypeScript server runs that same library.
Python stays the language of `.github/scripts/agent_forms.py` and `tests/`.
That tooling is not the GOALIE server.
[SPEC.md](../../SPEC.md) §8.1 requires validation once, on the server, in one transaction.

## Decision

The server language is TypeScript.
The runtime is Node.js 24 or newer.
The application is Hono.
`@hono/node-server` listens for that app and wraps Node's `node:http`.
The MCP server is a route on that same Hono app ([0004](0004-mcp-hosting.md)).
The store uses Node's `node:sqlite` module ([0002](0002-storage.md)).
The server must not add a second language.
Browser code must stay inside the limits in [0010](0010-app-shape.md).

## Consequences

Later server code must be TypeScript on Node.js 24 or newer.
Validation, the commit check, and writes to the store must live in this Node process.
The browser must not contain a second copy of those rules.
The guidance script and the spec tests stay Python.
