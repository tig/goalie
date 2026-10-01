# 0005. Auth and identity

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires auth and identity for human and agent actors.
[SPEC.md](../../SPEC.md) §6.4 defines an actor as `human` or `agent`, and an agent has an `operator` who is a human.
Only a human can own a goal or an org unit ([SPEC.md](../../SPEC.md) §3 and [SPEC.md](../../SPEC.md) §6.4).
Every change is attributed to an actor ([SPEC.md](../../SPEC.md) §6.6).
[0006](0006-deployment-target.md) is one self-hosted process, so the first version has no external identity provider.

## Decision

An actor is a row with kind `human` or `agent`.
A human signs in with a password.
The password is stored as an Argon2id hash.
A successful sign-in sets an HTTP-only session cookie.
An agent authenticates with a bearer token.
The token is stored as a hash, bound to that agent actor, and shown only when it is created.
The agent row must name its operator, and that operator must be a human actor.
Every read and every write must resolve to one actor.
No request is anonymous.
A goal owner and an org-unit owner must be a human actor.
The first version must not add an external identity provider.

## Consequences

The API and the MCP server must resolve the cookie or the bearer token to an actor before they touch the store.
A write's Event uses that actor.
A request that sets a goal owner or an org-unit owner to an agent must fail validation.
Owner settings and user settings use this same actor ([0011](0011-owner-and-user-settings.md)).
