# 0001. Language and runtime

**Status:** Accepted

**Date:** 2026-09-30

## Context

[Issue #21](https://github.com/tig/goalie/issues/21) requires this record before later Stage 0 work depends on a language.
The only code in the repo today is Python: `.github/scripts/agent_forms.py` and `tests/test_agent_forms.py`, exercised by unittest.
[SPEC.md](../../SPEC.md) does not choose a language.

## Decision

The language is Python 3.12 or newer.
The standard library is the runtime for Stage 0.
The repo must not add a second language.
A later stage may add a library only when an issue needs it.
Ruff lints.
Ruff must not format.
Mypy typechecks the `goalie` package.
Tests run as `python -m unittest discover -s tests -v`.

## Consequences

Application code lives in the `goalie/` package.
The Stage 0 health server lives in `goalie/health.py` and `goalie/__main__.py`.
This record does not add that server.
`.github/workflows/ci.yml` must lint with Ruff, typecheck the `goalie` package with Mypy, and run `python -m unittest discover -s tests -v`.
`tests/` holds unittest modules, including the existing `tests/test_agent_forms.py`.
`tests/conformance/` holds the skipped invariant suite.
[Issue #23](https://github.com/tig/goalie/issues/23) adds that suite, and [issue #4](https://github.com/tig/goalie/issues/4) fills it in.
This record does not add tests.
The `Dockerfile` must run Python 3.12 or newer.
Stage 0 must not edit `AGENTS.md` and must not add `CLAUDE.md`.
[Issue #18](https://github.com/tig/goalie/issues/18) owns the contributor guide.
