# Testing

Unit tests are pure functions and process checks (health server, spec-sync). They live in `tests/test_*.py` and must pass.

Conformance tests are one skipped test per marked SPEC invariant, under `tests/conformance/`. Issue #4 (Epic 3: Rules engine: invariants, lifecycles, promotion rule, lints) replaces each skip with a real assertion. The test name carries the invariant sentence.

Later, not this suite: norms and lints (§3 and §6.1 lints), views, rollups, the API, MCP, and the UI.
