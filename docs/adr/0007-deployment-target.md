# 0007. Deployment target

**Status:** Accepted

**Date:** 2026-09-30

## Context

[Issue #21](https://github.com/tig/goalie/issues/21) records where Stage 0 runs.
[Issue #1](https://github.com/tig/goalie/issues/1) builds GOALIE as a product an organization runs, not as a service this repo operates for others.
This repo names no durable host.
Stage 0 still needs a deploy check before a host exists.

## Decision

Self-hosted first means we run the process, not a SaaS.
This repo names no durable host.
Stage 0 must not invent a hostname, a VM, or a cloud account.
Stage 0 deploy is GitHub Actions.
That deploy builds a container from the repo `Dockerfile`, runs it, and requires `GET /health` to return 200 with body `{"status":"ok"}` and a trailing newline.
Pushing the image to ghcr.io is allowed on a push to `main` only.
A later amendment of this record names a durable host when one exists.

## Consequences

The `Dockerfile` lives at the repo root.
It must run the `goalie` package on Python 3.12 or newer ([0001](0001-language-and-runtime.md)).
`goalie/__main__.py` must be the process that container starts, and `goalie/health.py` must serve `GET /health`.
`.github/workflows/deploy.yml` must build that image, run the container, and request `GET /health`.
The check must fail unless the status is 200 and the body is the characters `{"status":"ok"}` followed by a newline.
The workflow must push the image to ghcr.io only on a push to `main`.
It must not push on a pull request or on any other branch.
`.github/workflows/ci.yml` is lint, typecheck, and unittest.
It is not the deploy workflow.
No file in `docs/adr/` may name a hostname, a VM, or a cloud account until this record is amended.
