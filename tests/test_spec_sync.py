"""needs_spec is true only for a GOALIE behavior change that omits SPEC.md."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / ".github" / "scripts" / "spec_sync.py"
spec = importlib.util.spec_from_file_location("spec_sync", SCRIPT)
spec_sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spec_sync)


class NeedsSpec(unittest.TestCase):
    def test_rules_alone_needs_spec(self) -> None:
        self.assertTrue(spec_sync.needs_spec(["goalie/rules.py"]))

    def test_rules_plus_spec_does_not(self) -> None:
        self.assertFalse(spec_sync.needs_spec(["goalie/rules.py", "SPEC.md"]))

    def test_infrastructure_does_not(self) -> None:
        self.assertFalse(spec_sync.needs_spec(["goalie/health.py", "goalie/__main__.py"]))

    def test_layout_doc_does_not(self) -> None:
        self.assertFalse(spec_sync.needs_spec(["docs/layout.md"]))

    def test_health_and_rules_without_spec_does(self) -> None:
        self.assertTrue(spec_sync.needs_spec(["goalie/health.py", "goalie/rules.py"]))
