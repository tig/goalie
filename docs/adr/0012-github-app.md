# 0012. GitHub App

**Status:** Accepted

**Date:** 2026-11-03

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

## Consequences

A missing name or an unreadable key file commits the work item and shows that GitHub is not configured.
The key must not be logged.
A webhook from GitHub, and reopening a closed issue, are later amendments of this record.
