# 0002. Storage

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires a store for the event log and for current state.
[SPEC.md](../../SPEC.md) §6.6 is an append-only log with a sequence number that only increases.
[SPEC.md](../../SPEC.md) §6 gives every writable entity a version, and a stale write is rejected.
[SPEC.md](../../SPEC.md) §8.1 checks invariants on the committed result, on the server, in one transaction.
[SPEC.md](../../SPEC.md) §13 requires a full export, because the organization owns its memory.
[0006](0006-deployment-target.md) is self-hosted and names no hosted database.

## Decision

Each deployment has one SQLite file, opened with Node's `node:sqlite` module (`DatabaseSync`).
The event log is one append-only table.
Its sequence is an integer primary key that only increases.
Current-state tables update in the same transaction as the event append.
A failed commit check rolls that transaction back, so the failed write must not become visible.
SQLite WAL mode is on, so a reader can follow the log during a write.
There is no second database and no ORM.

## Consequences

A write must append the Event and update the current row in one transaction, or persist neither.
The sequence a client has seen is the resume cursor ([0007](0007-live-update.md)).
Export of a deployment must include this file.
Presence must not be stored in this file ([0009](0009-presence.md)).
The CRDT state for Markdown is stored in this file ([0008](0008-concurrent-markdown.md)).
