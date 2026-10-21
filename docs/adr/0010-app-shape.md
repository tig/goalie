# 0010. Web-and-mobile app shape

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) requires the shape of the web-and-mobile app.
[SPEC.md](../specs/SPEC.md) §1 says the app is available on the web and on mobile devices.
[SPEC.md](../specs/SPEC.md) §1.2 says a human can open a view, open a goal, edit it, write the plan, and comment with no agent required.
[SPEC.md](../specs/SPEC.md) §8.2 says a view is a screen a human opens, plus a saved definition of goals, columns, and sort.
A database view alone must not satisfy that requirement.
The commit check stays on the server ([SPEC.md](../specs/SPEC.md) §8.1).

## Decision

There is one web app, served by the same Node process as the API.
The server renders each view's HTML from the saved view definition.
The same pages must be usable at phone width.
A phone browser is the mobile app.
There is no native store client and no second codebase.
Browser JavaScript is limited to live updates ([0007](0007-live-update.md)), the Markdown CRDT ([0008](0008-concurrent-markdown.md)), and Presence ([0009](0009-presence.md)).
Every write goes to the API ([0003](0003-api-style.md)).
The browser must not validate invariants and must not open the SQLite file.

## Consequences

A later native client would be a new choice and must amend this record.
The app must keep working when no agent is signed in.
A view screen must be backed by a saved view definition.
A database view must not be offered as a view.
