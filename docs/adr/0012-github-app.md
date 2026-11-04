# 0012. GitHub App

**Status:** Accepted

**Date:** 2026-11-03

**Amended:** 2026-11-03. A signed notice that an issue was closed updates the linked work item. Reopening a closed issue stays out.

## Context

[#72 (Enable Github integration)](https://github.com/tig/goalie/issues/72) pushes a work item's status to one linked GitHub issue.
[0005](0005-auth-and-identity.md) federates human sign-in with Entra.
A GitHub user token must not stand in for that sign-in.
The private key must stay off this repo.

## Decision

The deployment calls GitHub as a GitHub App.
Process configuration names the app id, the installation id, the path of the private key, one repository (`owner/repo`), and the public URL of this deployment.
The private key is a file outside this repo.
A committed change of a work item's status, when its links name an issue in that repository, updates that issue after the commit.
The update sets one status label, keeps a body trailer that links back to the work item, closes the issue as completed when the status is Completed, and closes it as not planned when the status is Deleted.
The update is not an Event.
A failed update leaves the work item committed and shows the failure on the work item.
A later open status does not reopen a closed issue.
Tests call a stand-in API and hold no real key.
A signed notice that an issue in that repository was closed updates each linked work item through the same write as any other change of status.
The notice names the version it read, and the write is an Event.
Closed as completed sets status to Completed.
Closed as not planned, or as duplicate, sets status to Deleted.
The actor is an agent whose operator is the GOALIE owner.
Process configuration names that actor.
The owner adds the actor.
The reason names the GitHub login.
That agent may change status on a work item it does not own. It changes no other field.
When status is already that value, the notice writes nothing.
A notice whose signature does not verify is refused and writes nothing.

## Consequences

A missing name or an unreadable key file commits the work item and shows that GitHub is not configured.
The key must not be logged.
A signed notice from GitHub is the amendment of 2026-11-03. Reopening a closed issue stays a later amendment of this record.
