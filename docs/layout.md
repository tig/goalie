# Layout

Product code lives in the `goalie/` package.
Tests live under `tests/` and use unittest.
The conformance suite will live in `tests/conformance/`.
Architecture decision records (ADRs) live in `docs/adr/`.

The language is Python 3.12 or newer.
Stage 0 must use the standard library only.
Do not add a third-party runtime dependency.
Project metadata is in `pyproject.toml`.

A change to GOALIE behavior under `goalie/` and the SPEC.md change must land in the same PR.
`goalie/health.py` and `goalie/__main__.py` are the health server.
Those two paths are infrastructure, not behavior.
A change that only touches them does not need a SPEC.md change.
`.github/scripts/spec_sync.py` is that check.
The spec-sync workflow runs it on each pull request.

A seat must run these commands.
The CI workflow (`.github/workflows/ci.yml`) runs the same commands.

- `python -m ruff check .`
- `python -m mypy goalie` when `goalie/` exists
- `python -m unittest discover -s tests -v`

There is no formatter.
Do not add one.

There is no CLAUDE.md.
Do not add CLAUDE.md.
AGENTS.md is the only agent guide.
AGENTS.md is generated.
Do not edit AGENTS.md by hand.
