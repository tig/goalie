# Contributing

The folder is the component.
The workflow file has the same name as that folder.
Looking at the folder tells you which CI runs.
A change in one component must not run another component's CI.
A component's tests sit with its code.
`tests/` holds shared tests and shared test infrastructure.
A component's own tests must not live there.
A path outside the folder is an input of that component.
`.github/scripts/ci_affected.py` lists every input.
The workflow starts on every pull request so its check can report.
The component's commands run only when its inputs changed.
You must not let one component's commands run on another component's change.

- `server/` runs [`.github/workflows/server.yml`](.github/workflows/server.yml). Commands: `npm ci --prefix server`, `npm run lint --prefix server`, `npm run typecheck --prefix server`, and `python -m unittest discover -s server/tests -v`.
- `tests/` runs [`.github/workflows/tests.yml`](.github/workflows/tests.yml). Command: `python -m unittest discover -s tests -v`. This suite is shared tests and shared test infrastructure. `SPEC.md`, `USERS_MANUAL.md`, and `docs/` are inputs.
- `guidance/` runs [`.github/workflows/guidance.yml`](.github/workflows/guidance.yml). Commands: `python -m unittest discover -s guidance/tests -v` and `python .github/scripts/agent_forms.py check`. `AGENTS.md` and `.github/scripts/agent_forms.py` are inputs.

Server code is TypeScript in `server/src/`, on Node.js 24 or newer.
`server/src/server.ts` exports `createApp` and `listen`.
The app is Hono.
`listen` uses `@hono/node-server`.
Domain routes are later issues.
You must not put a second server language here.
`npm start --prefix server` starts the process.
`PORT` and `HOST` are process configuration.
The default host is `127.0.0.1`.
`GET /health` answers `ok`.
Host configuration lives in excaliwire/operations.
This repo must not name the machine or the public hostname.
`.github/scripts/deploy_server.sh` publishes the server when the host secrets are set.
The publish runs on a push to `main` and on `workflow_dispatch`.
It must not run on a pull request.

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
