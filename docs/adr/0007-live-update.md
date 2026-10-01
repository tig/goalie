# 0007. Live-update transport and resume

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires the live-update transport and how a client resumes.
[SPEC.md](../../SPEC.md) §6.6 says the event log is the change stream, the sequence only increases, and a client that reconnects resumes from the last sequence it received.
It must then receive every later Event, so it misses nothing.
Views and agents use that same stream.
[SPEC.md](../../SPEC.md) §8.2 says a committed change appears in every open view within the configured time.
[SPEC.md](../../SPEC.md) §12 sets that default to 1 second.
Presence is not an Event ([0009](0009-presence.md)).

## Decision

The transport is Server-Sent Events on one HTTP GET route.
The event `id` is the Event sequence.
On reconnect the client sends `Last-Event-ID` with the last sequence it applied.
The server sends every Event with a greater sequence, in order, from the log in [0002](0002-storage.md).
The server pushes a committed Event as soon as its transaction commits.
The 1 second default is the deadline, not a poll interval.
Views and agents use this same route.
The route must not carry Presence.
Webhooks ([0003](0003-api-style.md)) are an extra push for a receiver that does not hold this connection.
A gap in webhook sequences is filled by this resume, not by guessing.

## Consequences

A client must not poll the log as its way to stay current.
A reconnect that omits the last sequence must not be treated as up to date.
The server must not drop an Event to meet the deadline.
Markdown collaboration uses [0008](0008-concurrent-markdown.md) for the live merge, and this stream still carries the Event that records the committed text.
