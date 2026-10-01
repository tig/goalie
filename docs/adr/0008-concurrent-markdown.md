# 0008. Concurrent Markdown

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires concurrent Markdown so an edit is not lost.
[SPEC.md](../../SPEC.md) §6.5 says more than one actor may edit a Doc body, or a goal description, at the same time.
An edit must not be lost.
A saved Doc version is taken from that text.
[SPEC.md](../../SPEC.md) §6 says structured fields do not follow that rule.
A stale structured write is rejected, and automatic merging must not apply to structured fields.
[SPEC.md](../../SPEC.md) §6.6 says every change to a Doc is an Event with an old value and a new value.

## Decision

The Doc body and the goal description are a Yjs text CRDT over the Markdown source.
The browser and the server both use the Yjs library.
The server stores the CRDT state in the SQLite file ([0002](0002-storage.md)).
Each accepted update is one transaction: store the new CRDT state, and append an Event whose old and new values are the Markdown snapshots before and after the merge.
A saved Doc version is that new snapshot.
Structured fields are not a CRDT.
They keep the integer version and the stale-write reject ([0003](0003-api-style.md)).

## Consequences

Two actors may type in the same Markdown at the same time, and neither actor's characters may be dropped.
The browser must not save Markdown by sending a whole-string replace.
A Doc version a human reads is the snapshot, not the CRDT encoding.
The server and the browser must use the same Yjs library.
A later change of CRDT library must amend this record.
