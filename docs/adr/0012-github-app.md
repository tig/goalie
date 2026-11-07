# 0012. GitHub App

**Status:** Accepted

**Date:** 2026-11-03

**Amended:** 2026-11-03. A signed notice that an issue was closed updates the linked work item. Reopening a closed issue stays out.

**Amended:** 2026-11-04. The repositories in scope are the owner setting `github_repos`, not one repository named in process configuration. An entry is `owner/repo` or `owner/*`. A goal's repositories are the `repo` entries on its work product.

**Amended:** 2026-11-04. The update uses the installation GitHub reports for that repository.

**Amended:** 2026-11-05. When owner settings have no `github_repos` list, the repository named in process configuration is in scope. A written list, including an empty list, is the scope.

**Amended:** 2026-11-05. Add as Github Issue, beside Add, files the work item and opens an issue for it in one repository in `github_repos` and on that goal, with the work item's title, its status as the label, the status trailer as the body, and the issue URL on the work item, using that repository when there is one, asking for a pick when there are several, and hiding the button when there are none.

**Amended:** 2026-11-05. Attach, on add and on edit, adds an existing issue or pull request in a repository that is in `github_repos` and on that goal, `#` in the title searches those repositories, the first issue attaches when the work item has no issue link, a pull request stays a link, and completing the work item closes an attached issue.

**Amended:** 2026-11-05. An update that adds an issue URL in `github_repos` and on that goal, when that URL was not already in the work item's links, updates that issue the same way as a status change, at the work item's current status. An update that adds only a pull request does not. A work item list shows each pull request named in links, and that link keeps its `/pull/` URL.

**Amended:** 2026-11-06. A work item's due_date is the linked issue's Target date. The update sets that field when the repository owner lists a date field named Target date. A 404 list, or a list with no Target date field, still succeeds and sets no date. Any other answer fails the update and the work item stays committed. A null due_date does not set a date. Start date stays unset. A pull request is not dated.

**Amended:** 2026-11-06. A GitHub issue or pull request reference in a repository that is in `github_repos` and on that goal shows that issue's title and whether it is open or closed. A bare repository name is a link only when that goal has exactly one such repository of that name. No repository name is assumed. A failed read does not invent open or closed.

**Amended:** 2026-11-06. The GOALIE owner sets the app id, the installation id, the private key, and the public URL on the GitHub page. A value set there is kept in the store. A value not set there uses the process name. Clearing the app id, the installation id, or the public URL removes that stored value. A blank private key leaves the stored private key. Pasting a private key replaces it. The page shows no private key. The save is not an Event.

**Amended:** 2026-11-06. The GOALIE owner adds and removes the repositories on the GitHub page. An entry is `owner/repo` or `owner/*`. An empty list stays empty. A work item title's `#N` is that issue when `github_repos` names exactly one repository. The work item editor shows that issue. When `github_repos` names more than one repository, or none, a number alone is not a link.

## Context

[#72 (Enable Github integration)](https://github.com/tig/goalie/issues/72) pushes a work item's status to one linked GitHub issue.
[0005](0005-auth-and-identity.md) federates human sign-in with Entra.
A GitHub user token must not stand in for that sign-in.
The private key must stay off this repo.

## Decision

The deployment calls GitHub as a GitHub App.
Process configuration names the app id, the installation id, the path of the private key, and the public URL of this deployment.
The private key is a file outside this repo.
The GOALIE owner sets the app id, the installation id, the private key, and the public URL on the GitHub page.
A value set there is kept in the store.
A value not set there uses the process name.
Clearing the app id, the installation id, or the public URL removes that stored value.
A blank private key leaves the stored private key.
Pasting a private key replaces it.
The page shows no private key.
The save is not an Event.
The owner setting `github_repos` names the repositories in scope. An entry is `owner/repo` or `owner/*`.
When owner settings have no `github_repos` list, the repository named in process configuration is in scope. A written list, including an empty list, is the scope.
The GOALIE owner adds and removes the repositories on the GitHub page.
A work item title's `#N` is that issue when `github_repos` names exactly one repository.
The work item editor shows that issue.
When `github_repos` names more than one repository, or none, a number alone is not a link.
A goal's repositories are the `repo` entries on its work product.
Add as Github Issue, beside Add, files the work item and opens an issue for it in one repository in `github_repos` and on that goal, with the work item's title, its status as the label, the status trailer as the body, and the issue URL on the work item, using that repository when there is one, asking for a pick when there are several, and hiding the button when there are none.
Attach, on add and on edit, adds an existing issue or pull request in a repository that is in `github_repos` and on that goal, `#` in the title searches those repositories, the first issue attaches when the work item has no issue link, a pull request stays a link, and completing the work item closes an attached issue.
A committed change of a work item's status, when its links name an issue in a repository that is in `github_repos` and on that goal, updates that issue after the commit.
The update sets one status label, keeps a body trailer that links back to the work item, closes the issue as completed when the status is Completed, and closes it as not planned when the status is Deleted.
A work item's due_date is the linked issue's Target date.
The update sets that field when the repository owner lists a date field named Target date.
A 404 list, or a list with no Target date field, still succeeds and sets no date.
Any other answer fails the update and the work item stays committed.
A null due_date does not set a date.
Start date stays unset.
A pull request is not dated.
The update is not an Event.
An update that adds an issue URL in `github_repos` and on that goal, when that URL was not already in the work item's links, updates that issue the same way, at the work item's current status. An update that adds only a pull request does not.
A work item list shows each pull request named in links, and that link keeps its `/pull/` URL.
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
A GitHub issue or pull request reference in a repository that is in `github_repos` and on that goal shows that issue's title and whether it is open or closed.
A bare repository name is a link only when that goal has exactly one such repository of that name.
No repository name is assumed.
A failed read does not invent open or closed.

## Consequences

A missing name or an unreadable key file commits the work item and shows that GitHub is not configured.
The key must not be logged.
A signed notice from GitHub is the amendment of 2026-11-03. Reopening a closed issue stays a later amendment of this record.
