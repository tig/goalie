# Testing

A unit test checks one repo rule or one module.
The existing files [tests/test_adrs.py](../tests/test_adrs.py), [tests/test_agent_forms.py](../tests/test_agent_forms.py), [tests/test_spec_collaboration.py](../tests/test_spec_collaboration.py), and [tests/test_spec_human_session.py](../tests/test_spec_human_session.py) are unit tests.
They are not this suite.

A conformance test is one skipped test per marked invariant in [SPEC.md](../SPEC.md) Draft 0.2.
A restatement in another section is the same test.
The test name is the invariant.
The skip message names the epic issue that fills it.
The suite is [tests/test_conformance.py](../tests/test_conformance.py).
The harness is the standard-library unittest module.

Behavior of those tests is a later stage.
This change does not fill them.
One test is not skipped.
It checks that the scaffold names every marked invariant, and it must pass.

The command is `python -m unittest discover -s tests -v`.
This suite is the tests component.
Its workflow is [`.github/workflows/tests.yml`](../.github/workflows/tests.yml).
A server-only change must not run it.
`SPEC.md` and `USERS_MANUAL.md` are inputs of this workflow.

## Who fills what

- [#3](https://github.com/tig/goalie/issues/3) Epic 2 stores versions, the sequence, Drafts, comments as Events, and the committed_plan_version column. Those tests do not replace rule, stream, or Markdown tests.
- [#4](https://github.com/tig/goalie/issues/4) Epic 3 fills rule invariants only: marked rules in §2 through §7, plus structured fields, stale writes, the commit check, deleted records that stay findable, comment rules, and rejection of a stale Draft approval. #4 does not fill view, stream, or Markdown tests.
- [#5](https://github.com/tig/goalie/issues/5) Epic 4 fills monotonic sequence, resume, the same stream for views and agents, and who may change owner settings and user settings.
- [#6](https://github.com/tig/goalie/issues/6) Epic 5 fills MCP tests for comments, approve or reject a Draft, and subscribing to the same stream.
- [#7](https://github.com/tig/goalie/issues/7) Epic 6 fills Markdown: an edit must not be lost, a saved Doc version is taken from that text, a Doc is a page, and promotion pins committed_plan_version.
- [#8](https://github.com/tig/goalie/issues/8) Epic 7 fills views: a view is a screen plus a saved definition, live updates, Presence, between-reviews work, history read on the record, and favorite views and appearance.
- [#9](https://github.com/tig/goalie/issues/9) Epic 8 fills a Draft that appears live and must not take effect until a human approves it. A stale approval stays on #4.
- [#12](https://github.com/tig/goalie/issues/12) Epic 12 fills work items: a human can file one with no agent, the items are the list under the goal, a comment on a work item is an Event, and the extension stays optional.
