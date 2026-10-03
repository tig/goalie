# 0011. Owner settings and user settings

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires owner settings and user settings to stay apart.
[SPEC.md](../specs/SPEC.md) §12 defines both.
Only the GOALIE owner may change owner settings.
A user must not change them.
Each user may change only their own user settings, and must not change another user's settings.
User settings are favorite views and appearance.
The default favorite views are none beyond the standard views.
The default appearance is light, and a user may choose dark.
[SPEC.md](../specs/SPEC.md) §1 says one named human owns the deployment.

## Decision

Owner settings are one row in the SQLite file.
That row stores the [SPEC.md](../specs/SPEC.md) §12 owner settings, including the live-update time, and the actor id of the GOALIE owner.
The owner must be a human actor ([0005](0005-auth-and-identity.md)).
A write to that row must be from that actor.
User settings are one row per human actor.
The columns are favorite views and appearance (`light` or `dark`).
A write to a user-settings row must be from that same human.
An agent has no user-settings row.
The listen address and the database path stay process configuration ([0006](0006-deployment-target.md)).
They must not be added to either row.

## Consequences

The API must reject a user write to owner settings.
The API must reject a write to another user's settings.
The app must show each kind of settings only to the actor who may change it.
A missing user-settings row means the defaults in [SPEC.md](../specs/SPEC.md) §12.
The invariants in [SPEC.md](../specs/SPEC.md) §2 are not settings and must not appear in either row.
