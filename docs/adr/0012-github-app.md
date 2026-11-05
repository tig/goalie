# 0012. GitHub App

**Status:** Accepted

**Date:** 2026-11-03

**Amended:** 2026-11-03. A signed notice that an issue was closed updates the linked work item. Reopening a closed issue stays out.

**Amended:** 2026-11-04. The repositories in scope are the owner setting `github_repos`, not one repository named in process configuration. An entry is `owner/repo` or `owner/*`. A goal's repositories are the `repo` entries on its work product.

**Amended:** 2026-11-04. The update uses the installation GitHub reports for that repository.

**Amended:** 2026-11-05. When owner settings have no `github_repos` list, the repository named in process configuration is in scope. A written list, including an empty list, is the scope.

**Amended:** 2026-11-05. Add as Github Issue, beside Add, files the work item and opens an issue for it in one repository in `github_repos` and on that goal, with the work item's title, its status as the label, the status trailer as the body, and the issue URL on the work item, using that repository when there is one, asking for a pick when there are several, and hiding the button when there are none.

**Amended:** 2026-11-05. Attach, on add and on edit, adds an existing issue or pull request in a repository that is in `github_repos` and on that goal, `#` in the title searches those repositories, the first issue attaches when the work item has no issue link, a pull request stays a link, and completing the work item closes an attached issue.

## Context

[#72 (Enable Github integration)](https://github.com/tig/goalie/issues/72) pushes a work item's status to one linked GitHub issue.
[0005](0005-auth-and-identity.md) federates human sign-in with Entra.
A GitHub user token must not stand in for that sign-in.
The private key must stay off this repo.

## Decision

The deployment calls GitHub as a GitHub App.
Process configuration names the app id, the installation id, the path of the private key, and the public URL of this deployment.
The private key is a file outside this repo.
The owner setting `github_repos` names the repositories in scope. An entry is `owner/repo` or `owner/*`.
When owner settings have no `github_repos` list, the repository named in process configuration is in scope. A written list, including an empty list, is the scope.
A goal's repositories are the `repo` entries on its work product.
Add as Github Issue, beside Add, files the work item and opens an issue for it in one repository in `github_repos` and on that goal, with the work item's title, its status as the label, the status trailer as the body, and the issue URL on the work item, using that repository when there is one, asking for a pick when there are several, and hiding the button when there are none.
Attach, on add and on edit, adds an existing issue or pull request in a repository that is in `github_repos` and on that goal, `#` in the title searches those repositories, the first issue attaches when the work item has no issue link, a pull request stays a link, and completing the work item closes an attached issue.
A committed change of a work item's status, when its links name an issue in a repository that is in `github_repos` and on that goal, updates that issue after the commit.
The update sets one status label, keeps a body trailer that links back to the work item, closes the issue as completed when the status is Completed, and closes it as not planned when the status is Deleted.
The update is not an Event.
A failed update leaves the work item committed and shows the failure on the work item.
A later open status does not reopen a closed issue.
Tests call a stand-in API and hold no real key.
A signed notice updates a work item only when the issue's repository is in `github_repos` and on that work item's goal.
The update uses the same write as any other change of status.
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
