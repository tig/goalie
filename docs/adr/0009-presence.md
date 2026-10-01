# 0009. Presence

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires Presence, which is not an Event.
[SPEC.md](../../SPEC.md) §4 defines Presence as which actors are viewing or editing an entity right now.
An actor is a human or an agent.
[SPEC.md](../../SPEC.md) §8.2 says a view shows the Presence of every actor viewing or editing an entity it shows.
Presence must not enter the event log, because it is not a change to the organization's memory.

## Decision

Presence is an in-memory map in the server process, keyed by entity.
The value is the set of actors currently viewing or editing that entity.
A client refreshes its Presence at least once per live-update interval, whose default is 1 second ([SPEC.md](../../SPEC.md) §12).
The server drops an actor that has not refreshed within two intervals.
The server publishes the map on a Server-Sent Events route that is not the event route ([0007](0007-live-update.md)).
That route has no sequence number and no resume cursor.
A process restart clears Presence.
Clients must send Presence again after they reconnect.
Presence must not be written to SQLite and must not append an Event.

## Consequences

A view must render Presence from this map, not from the event log.
An export of the event log must not contain Presence.
Two server processes would not share Presence, which [0006](0006-deployment-target.md) avoids by running one process.
