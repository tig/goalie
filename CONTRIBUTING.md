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
main is the release branch.
develop is the in-development branch and the primary branch.
A pull request for in-development work targets develop.
A release is a pull request from develop into main.
develop runs the same workflows and does not require them to merge.
The server publishes on a push to develop, or when an operator dispatches the server workflow on a branch.
README.md and docs/ are pure docs, except docs/specs/SPEC.md.
They run no CI commands and need no test.
Test-first does not apply to documentation or to configuration.
docs/specs/SPEC.md and USERS_MANUAL.md stay inputs of the shared tests.
A seat must pick up only an issue or a pull request assigned to the GitHub user named by harness-gh-user.
harness-gh-user is config outside this repo.
When harness-gh-user is empty, a seat must pick up nothing.

- `server/` runs [`.github/workflows/server.yml`](.github/workflows/server.yml). Commands: `npm ci --prefix server`, `npm run lint --prefix server`, `npm run typecheck --prefix server`, `npm run build --prefix server`, and `python -m unittest discover -s server/tests -v`.
- `tests/` runs [`.github/workflows/tests.yml`](.github/workflows/tests.yml). Command: `python -m unittest discover -s tests -v`. This suite is shared tests and shared test infrastructure. `docs/specs/SPEC.md` and `USERS_MANUAL.md` are inputs.
- `guidance/` runs [`.github/workflows/guidance.yml`](.github/workflows/guidance.yml). Commands: `python -m unittest discover -s guidance/tests -v` and `python .github/scripts/agent_forms.py check`. `AGENTS.md` and `.github/scripts/agent_forms.py` are inputs.

Server code is TypeScript in `server/src/`, on Node.js 24 or newer.
`server/src/server.ts` exports `createApp` and `listen`.
The app is Hono.
`listen` uses `@hono/node-server`.
The web app is React in `server/web/` ([ADR 0010](docs/adr/0010-app-shape.md)).
`npm run build --prefix server` builds it into `server/web/dist/`.
The server workflow builds it before the server tests, and the publish carries it.
You must not put a second server language here.
`npm start --prefix server` starts the process.
`PORT`, `HOST`, `GOALIE_DB`, `GOALIE_WEB_DIST`, `GOALIE_SIGN_IN_URL`, and `GOALIE_TODAY` are process configuration.
`GOALIE_DB` is the path of the SQLite file ([ADR 0006](docs/adr/0006-deployment-target.md)). The default is `goalie.db` in the working directory.
`GOALIE_WEB_DIST` is the folder of the built web app. The default is `server/web/dist`.
`GOALIE_SIGN_IN_URL` is the host's login route that the sign-in page links to, with the page to return to as `rd`. The default is `/oauth2/start`.
Today is the org's calendar day: the owner setting `time_zone`, else the process's local time zone. `GOALIE_TODAY` (YYYY-MM-DD) pins it. The server tests pin it to 2026-10-23, so no test reads the wall clock for a product date.
`GOALIE_ISSUERS` is the issuer list ([ADR 0005](docs/adr/0005-auth-and-identity.md)). It is a JSON list of `{"issuer", "audience"}`, with optional `jwks_uri` or inline `jwks`.
Unset means no issuer, so every token is refused.
A deployment's issuer list lives with its host configuration, not in this repo. Keys come from the issuer's discovery document.
Tests do not need Entra. `server/tests/sign_token.mjs` signs tokens with a fresh key, and the test sets a test issuer with that key inline in `jwks`.
Every token is still verified: RS256 signature, issuer, audience, and expiry.
`node src/cli.ts` is a local tool against the `GOALIE_DB` file: `write --as <actor>`, `read <kind> <id>`, `events [after]`, `seed [file]`, `check`, and `whoami`. It is not reachable over HTTP.
A seed is a data file of writes, each with its `as` actor. `server/seed/excaliwire.json` is the default. A seed lives outside `src/`, so the publish does not carry it.
`server/seed/build-team.json` is our build team: each seat an agent actor with `app_id` `app-<seat>`, and each seat's current tasks as work items. It loads onto the Excaliwire seed with `node src/cli.ts seed seed/build-team.json`, and loads again after an edit: an existing actor, or a work item with the same owner and title, is updated, and an unchanged one writes nothing. `server/tests/sign_token.mjs` signs a seat token with claims `idtyp: "app"` and `azp: "app-<seat>"`.
The app's dev fixtures in `server/web/fixtures/` are generated from the seed: `python server/tests/test_fixture.py --write`. `test_fixture.py` fails when they drift from the API.
The default host is `127.0.0.1`.
`GET /health` answers `ok`.
`GET /health` is the one path that needs no verified actor.
`GET /api/priorities` answers the Priorities view as JSON for the verified actor. The shape is `PrioritiesResponse` in `server/src/api.ts`. The app filters and draws it.
`GET /api/goals/:id` answers one goal's page (`GoalPageResponse`). `GET /api/options` answers what New goal offers (`FormOptions`). `GET /api/work` answers every work item, or one actor's with `?owner=`.
`POST /api/commands` writes: a list of commands, in order, in one transaction (`CommandsRequest`). With `check: true` it runs the batch, rolls it back, and answers the same.
`GET /api/events` streams each committed goal and work item Event as Server-Sent Events ([ADR 0007](docs/adr/0007-live-update.md)). `id` is the sequence. `Last-Event-ID` resumes from the log. A rolled-back or `check` batch sends nothing. A write from `node src/cli.ts` runs in another process and is not streamed.
Every other `/api/` path answers 404. An `/api/` request with no verified token answers 401 with `{"error", "reason"}`.
GOALIE has no `/api/feedback` route. The app's Feedback control posts a note and the page URL there, and host configuration sends that path to xw-feedback before GOALIE sees it. Until the host does, GOALIE answers 404, and the app says that feedback is not available.
`GET /assets/*` answers a file of the build. Any other path that names a file, such as `/main.js`, answers 404. Every other path answers the build's `index.html`, so the app routes in the browser.
A page or asset request with no verified token answers 401 with the sign-in page. The sign-in page loads the shared Excaliwire chrome from `/_xw/`. Host configuration serves `/_xw/`.
With no build in `GOALIE_WEB_DIST`, a page request answers 503 with a plain message.
`GOALIE_ORG_UNIT` names the org unit whose Priorities the API answers. The default is the root org unit.
Host configuration lives in excaliwire/operations.
This repo must not name the machine or the public hostname.
`.github/scripts/deploy_server.sh` publishes the server when the host secrets are set.
It publishes `package.json`, `package-lock.json`, `src/`, and `web/dist/`. It refuses to publish without `web/dist/index.html`.
The publish runs on a push to `develop`, and on `workflow_dispatch` on the branch the operator names.
A pull request merged into `develop` publishes. A push to `main` does not publish, so an older main cannot overwrite a newer develop.
It must not run on a pull request.

Server tests are Python unittest in `server/tests/`.
The serving test points `GOALIE_WEB_DIST` at a temporary folder with a stub `index.html`. `test_top_bar_phone.py` opens the built app at 375 px in headless Chrome, through `server/tests/measure_page.mjs`. It skips with no build or no Chrome, and fails instead when `CI` is set. `CHROME` names the browser. The other server tests read only `/health`, `/api/`, and the sign-in page, and need no build.

Local preview of the built app:

1. `npm ci --prefix server` and `npm run build --prefix server`.
2. `GOALIE_DB=goalie.db node src/cli.ts seed` in `server/`, once.
3. `npm start --prefix server`, with `GOALIE_ISSUERS` set to an issuer that signs your token.
4. Open `http://127.0.0.1:3000/` with that token in `Authorization: Bearer`.

Without a token the preview answers the sign-in page.
`npm run dev --prefix server` serves the app with no server and no token. `/api/priorities` answers `server/web/fixtures/priorities.json`.
With `GOALIE_API=http://127.0.0.1:3000`, it sends `/api/` to a running server instead.
That server refuses a request with no verified actor. Set `GOALIE_TOKEN` to a token it accepts, and the dev server sends it as `Authorization: Bearer`.
`server/tests/sign_token.mjs` signs a test token and prints the inline `jwks` for `GOALIE_ISSUERS`. A human actor's `subject` must match the token's `oid`. A human token with no `oid` is refused.
Guidance tests are Python unittest in `guidance/tests/`.
Shared tests and shared test infrastructure are Python unittest in `tests/`.
Spec tests stay Python.
Lint is eslint.
Typecheck is `tsc --noEmit`.
The tests command includes the skipped conformance suite.
You must not invent another command for a component.

Architecture decision records are [`docs/adr/`](docs/adr/README.md).
A reversal amends that same record in the reversing pull request.

A behavior change and the SPEC.md change must land in the same pull request.
The same rule is in [`guidance/agents.md`](guidance/agents.md).

The product contract is [`docs/specs/SPEC.md`](docs/specs/SPEC.md).
How to run the tests is [`docs/testing.md`](docs/testing.md).
The record index is [`docs/adr/README.md`](docs/adr/README.md).

There is no `CLAUDE.md`.
`AGENTS.md` is generated from [`guidance/agents.md`](guidance/agents.md).
You must not edit `AGENTS.md` by hand.
