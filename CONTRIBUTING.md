# Contributing

The folder is the component.
The workflow file has the same name as that folder.
Looking at the folder tells you which CI runs.
A change in one component must not run another component's CI.
A component's tests sit with its code.
`tests/` holds shared tests and shared test infrastructure.
A component's own tests must not live there.
A path outside the folder is an input of that component.
The workflow file lists every input.
You must not add a workflow that runs on every file.

- `server/` runs [`.github/workflows/server.yml`](.github/workflows/server.yml). Commands: `npm ci --prefix server`, `npm run lint --prefix server`, `npm run typecheck --prefix server`, and `python -m unittest discover -s server/tests -v`.
- `tests/` runs [`.github/workflows/tests.yml`](.github/workflows/tests.yml). Command: `python -m unittest discover -s tests -v`. This suite is shared tests and shared test infrastructure. `SPEC.md`, `USERS_MANUAL.md`, and `docs/` are inputs.
- `guidance/` runs [`.github/workflows/guidance.yml`](.github/workflows/guidance.yml). Commands: `python -m unittest discover -s guidance/tests -v` and `python .github/scripts/agent_forms.py check`. `AGENTS.md` and `.github/scripts/agent_forms.py` are inputs.

Server code is TypeScript in `server/src/`, on Node.js 24 or newer.
`server/src/server.ts` exports `createApp` and `listen`.
The app is Hono.
`listen` uses `@hono/node-server`.
Domain routes are later issues.
You must not put a second server language here.

Server tests are Python unittest in `server/tests/`.
Guidance tests are Python unittest in `guidance/tests/`.
Shared tests and shared test infrastructure are Python unittest in `tests/`.
Spec tests stay Python.
Lint is eslint.
Typecheck is `tsc --noEmit`.
The tests command includes the skipped conformance suite.
You must not invent another command for a component.

Architecture decision records are [`docs/adr/`](docs/adr/README.md).
A reversal amends that same record in the reversing pull request.
A change under `docs/` runs the tests workflow.

A behavior change and the SPEC.md change must land in the same pull request.
The same rule is in [`guidance/agents.md`](guidance/agents.md).

The product contract is [`SPEC.md`](SPEC.md).
How to run the tests is [`docs/testing.md`](docs/testing.md).
The record index is [`docs/adr/README.md`](docs/adr/README.md).

There is no `CLAUDE.md`.
`AGENTS.md` is generated from [`guidance/agents.md`](guidance/agents.md).
You must not edit `AGENTS.md` by hand.
