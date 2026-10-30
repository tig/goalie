# 0010. Web-and-mobile app shape

**Status:** Accepted

**Date:** 2026-10-01

**Amended:** 2026-10-23. The web app is React. The browser draws every screen. This replaces the limit on browser JavaScript to live updates, the Markdown CRDT, and Presence.

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires the shape of the web-and-mobile app.
[SPEC.md](../specs/SPEC.md) §1 says the app is available on the web and on mobile devices.
[SPEC.md](../specs/SPEC.md) §1.2 says a human can open a view, open a goal, edit it, write the plan, and comment with no agent required.
[SPEC.md](../specs/SPEC.md) §8.2 says a view is a screen a human opens, plus a saved definition of goals, columns, and sort.
A database view alone must not satisfy that requirement.
The commit check stays on the server ([SPEC.md](../specs/SPEC.md) §8.1).

## Decision

There is one web app, served by the same Node process as the API.
The web app is REACT based.
The same pages must be usable at phone width.
A phone browser is the mobile app.
There is no native store client and no second codebase.
The browser draws every screen in React, including live updates ([0007](0007-live-update.md)), the Markdown CRDT ([0008](0008-concurrent-markdown.md)), and Presence ([0009](0009-presence.md)).
The browser reads and writes only through the API ([0003](0003-api-style.md)).
The browser holds no invariant, must not validate invariants, and must not open the SQLite file.
The same Node process serves the built app and the API.

## Consequences

A later native client would be a new choice and must amend this record.
A screen's layout, labels, and filter live in the app. Its data and every rule live on the server.
The app must keep working when no agent is signed in.
A view screen must be backed by a saved view definition.
A database view must not be offered as a view.
