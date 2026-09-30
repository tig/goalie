# Architecture decision records

These records are the decisions for [#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21), under [#2 (Epic 1: Foundations: architecture, repo, CI)](https://github.com/tig/goalie/issues/2).
They record the decisions. They do not implement them.
A later change that reverses a decision must amend that record in the same pull request.

- [0001. Language and runtime](0001-language-and-runtime.md). Accepted 2026-09-30.
- [0002. Storage](0002-storage.md). Accepted 2026-09-30.
- [0003. API style](0003-api-style.md). Accepted 2026-09-30.
- [0004. MCP hosting](0004-mcp-hosting.md). Accepted 2026-09-30.
- [0005. Web UI](0005-web-ui.md). Accepted 2026-09-30.
- [0006. Auth and identity](0006-auth-and-identity.md). Accepted 2026-09-30.
- [0007. Deployment target](0007-deployment-target.md). Accepted 2026-09-30.

Stage 0 work that follows these records must use these paths, and must not invent others:

- Package `goalie/`. The health server lives in `goalie/health.py` and `goalie/__main__.py`.
- `Dockerfile` at the repo root.
- `.github/workflows/ci.yml` for lint, typecheck, and unittest.
- `.github/workflows/deploy.yml` for the container and the health check.
- `docs/adr/` for these records.
- `tests/` for unittest, and `tests/conformance/` for the skipped invariant suite.
- Do not edit `AGENTS.md`. Do not add `CLAUDE.md`.
