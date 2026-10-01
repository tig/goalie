# 0006. Deployment target

**Status:** Accepted

**Date:** 2026-10-01

## Context

[#21 (Stage 0.1: Architecture decision records)](https://github.com/tig/goalie/issues/21) says the deployment target is self-hosted first.
[SPEC.md](../../SPEC.md) §1 says one named human owns a deployment.
[SPEC.md](../../SPEC.md) §13 says the organization owns its memory, including a full export.
[SPEC.md](../../SPEC.md) names no vendor and no host.

## Decision

A deployment is one OS process and one SQLite file on a machine the organization controls.
The process is the Node process that serves the Hono app in [0001](0001-language-and-runtime.md).
The file is the store in [0002](0002-storage.md).
This repo must not run GOALIE as a service for other organizations.
The listen address and the database file path are process configuration.
They are not owner settings ([0011](0011-owner-and-user-settings.md)).
The record names no hostname, no cloud account, and no vendor runtime.

## Consequences

Later packaging must still start as one process and one file.
A hosted database, a second service, or a SaaS account must not be required.
Export is a copy of that file, plus any webhook configuration stored in it.
Presence dies with the process and is rebuilt when clients reconnect ([0009](0009-presence.md)).
