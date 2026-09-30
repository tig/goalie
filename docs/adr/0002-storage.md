# 0002. Storage

**Status:** Accepted

**Date:** 2026-09-30

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) records storage before a store exists.
[SPEC.md](../../SPEC.md) §6.6 is the append-only history: one entry per change, attributed to an actor.
[SPEC.md](../../SPEC.md) §6 is the current state that history tracks.
[SPEC.md](../../SPEC.md) §13 requires both.
Stage 0 does not build the store.

## Decision

Storage is not built in Stage 0.
The later store is one SQLite file per deployment.
An append-only event table is the history ([SPEC.md](../../SPEC.md) §6.6).
Current-state tables must update in the same transaction as the event append.
There is no hosted database.
Postgres is not the Stage 0 choice.

## Consequences

Stage 0 must not add a database, a SQLite file, or store code under `goalie/`.
When the store arrives, that deployment has one SQLite file, not a hosted database.
A write must append the event and update the current-state tables in one transaction, or persist neither.
Invariant checks on that history live in `tests/conformance/`, skipped until the rules exist.
They must not use a second store.
