# 0005. Auth and identity

**Status:** Proposed. The amendment of 2026-10-25 waits on Tig. The record before it was Accepted on 2026-10-01.

**Date:** 2026-10-01

**Amended:** 2026-10-25. The first deployment has more than one human actor. Tig and Chelsea sign in to the same deployment. This replaces the rule that the first deployment has one human actor.

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires auth and identity for human and agent actors.
[SPEC.md](../specs/SPEC.md) §6.4 defines an actor as `human` or `agent`, and an agent has an `operator` who is a human.
Only a human can own a goal or an org unit ([SPEC.md](../specs/SPEC.md) §3 and [SPEC.md](../specs/SPEC.md) §6.4).
Every change is attributed to an actor ([SPEC.md](../specs/SPEC.md) §6.6).
[SPEC.md](../specs/SPEC.md) §13 requires actor identity that tells humans and agents apart.
The first deployment is for Excaliwire, Inc.
That company already signs humans and agents in with Entra ID.
[#43 (Entra ID sign-in)](https://github.com/excaliwire/operations/issues/43) puts the host behind oauth2-proxy as Caddy `forward_auth`.
[#30 (Entra ID app registration)](https://github.com/excaliwire/operations/issues/30) is the tenant, the v2 tokens, and the rule that agents are applications.
A password stored in GOALIE would be a second identity system.

## Decision

An actor is a row with kind `human` or `agent`.
Sign-in is federated.
The issuer list is deployment configuration.
The first issuer is Entra ID for tenant `8136e28b-aee3-4d34-ab49-c0da1a468e3a`, at `https://login.microsoftonline.com/8136e28b-aee3-4d34-ab49-c0da1a468e3a/v2.0`.
The first deployment's gate is oauth2-proxy, as specified in [#43](https://github.com/excaliwire/operations/issues/43).
GOALIE verifies every bearer token's signature against that issuer list.
It reads the token from `Authorization`, or from `X-Auth-Request-Access-Token` when the gate forwarded a session.
`X-Auth-Request-Email` must match the verified token.
A header alone must not authenticate anyone.
A human token has `idtyp` other than `app`.
GOALIE maps that token's subject to one human actor.
An agent token has `idtyp` of `app`.
GOALIE maps that token's application id to one agent actor.
The agent row must name its operator, and that operator must be a human actor.
The first deployment has more than one human actor.
Its human actors are Tig, the GOALIE owner, and Chelsea.
Each maps from the subject of an Entra ID token in the Excaliwire tenant.
One subject maps to one human actor, and one human actor has one subject per issuer.
Only the GOALIE owner adds a human actor or an agent actor, or changes one.
Adding or changing an actor is an Event, with the GOALIE owner as its actor ([SPEC.md](../specs/SPEC.md) §6.4, §6.6).
A person whose subject maps to no actor is refused, and is not added on sign-in.
GOALIE must not store a password for a human.
Every read and every write must resolve to one actor.
No request is anonymous.
A goal owner and an org-unit owner must be a human actor.

## Consequences

The API and the MCP server must verify the token and resolve it to an actor before they touch the store.
A write's Event uses that actor.
A request that sets a goal owner or an org-unit owner to an agent must fail validation.
An agent token must not be accepted as a human, and a human token must not be accepted as an agent.
The client secret for the gate stays out of this repo.
Adding an issuer is a configuration change to the issuer list.
Owner settings and user settings use this same actor ([0011](0011-owner-and-user-settings.md)).
Each human actor has their own user settings. Two human actors read the same store and see the same goals.
The GOALIE owner is named in owner settings. It is one of the human actors, not the only one.
A new person needs their subject before they can sign in. The GOALIE owner reads it from the Entra ID tenant and adds the actor.
The seed names the human actors. Their subjects are set on the deployment's host, so the repo does not carry them.
