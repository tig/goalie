# Contributing

Server code is TypeScript in `src/`, on Node.js 24 or newer.
`src/server.ts` exports `createApp` and `listen`.
The app is Hono.
`listen` uses `@hono/node-server`.
Domain routes are later issues.
You must not put a second server language here.

Tests are Python unittest in `tests/`.
Spec tests stay Python.

Architecture decision records are [`docs/adr/`](docs/adr/README.md).
A reversal amends that same record in the reversing pull request.

Install and check with these commands, in this order:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `python -m unittest discover -s tests -v`

Lint is eslint.
Typecheck is `tsc --noEmit`.
Tests include the skipped conformance suite once it exists.
You must not invent another command.

A behavior change and the SPEC.md change must land in the same pull request.
The same rule is in [`guidance/agents.md`](guidance/agents.md).

The product contract is [`SPEC.md`](SPEC.md).
How to run the tests is [`docs/testing.md`](docs/testing.md).
The record index is [`docs/adr/README.md`](docs/adr/README.md).

There is no `CLAUDE.md`.
`AGENTS.md` is generated from [`guidance/agents.md`](guidance/agents.md).
You must not edit `AGENTS.md` by hand.
