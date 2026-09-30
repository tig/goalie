"""The stage-date proposal names every stage and does not commit a date.

docs/stage-dates.md must include each stage name, each ISO date, Ambition,
Fantasy, and tig/mike#2 (Master: move agent harness to Mike (dashboard → tests → spec → moms)). "proposed Committed" is allowed. A sentence that
applies "Committed date" as an already-true stage date is not.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOC = REPO / "docs" / "stage-dates.md"

STAGE_NAMES = (
    "Epic 0 (#15 (Epic 0: Mike-enable tig/goalie))",
    "Stage 0 Foundations (#2 (Epic 1: Foundations: architecture, repo, CI))",
    "Stage 1 Core (#3 (Epic 2: Core data model and event log), #4 (Epic 3: Rules engine: invariants, lifecycles, promotion rule, lints), #5 (Epic 4: API, identity, and events), #6 (Epic 5: MCP server))",
    "Stage 2 Docs, views, agents (#7 (Epic 6: Docs: hosted plans and the User's Manual), #8 (Epic 7: Views and web UI), #9 (Epic 8: Automation agents: triggers, hygiene, drafting))",
    "Stage 3 Rollups and reviews (#10 (Epic 9: Rollups and fitness functions), #11 (Epic 10: Review support: review pages, pre-reads, action items))",
    "Stage 4 Excaliwire pilot (#13 (Epic 11: First deployment: Excaliwire pilot))",
    "Stage 5 Work items (#12 (Epic 12: Work items (issue tracking)))",
    "Stage 6 Open-source release (#14 (Epic 13: Open-source release: packaging, docs, multi-org))",
)

ISO_DATES = (
    "2026-10-16",
    "2026-10-09",
    "2026-12-18",
    "2026-11-06",
    "2027-02-12",
    "2027-03-26",
    "2027-06-30",
    "2027-07-31",
)

# Ambition date, then the proposed Promotion Milestone date.
STAGE_DATES = {
    "Stage 0 Foundations (#2 (Epic 1: Foundations: architecture, repo, CI))": ("2026-10-16", "2026-10-09"),
    "Stage 1 Core (#3 (Epic 2: Core data model and event log), #4 (Epic 3: Rules engine: invariants, lifecycles, promotion rule, lints), #5 (Epic 4: API, identity, and events), #6 (Epic 5: MCP server))": ("2026-12-18", "2026-11-06"),
    "Stage 2 Docs, views, agents (#7 (Epic 6: Docs: hosted plans and the User's Manual), #8 (Epic 7: Views and web UI), #9 (Epic 8: Automation agents: triggers, hygiene, drafting))": ("2027-02-12", "2026-12-18"),
    "Stage 3 Rollups and reviews (#10 (Epic 9: Rollups and fitness functions), #11 (Epic 10: Review support: review pages, pre-reads, action items))": ("2027-03-26", "2027-02-12"),
    "Stage 4 Excaliwire pilot (#13 (Epic 11: First deployment: Excaliwire pilot))": ("2027-06-30", "2027-03-26"),
    "Stage 5 Work items (#12 (Epic 12: Work items (issue tracking)))": ("2027-03-26", "2027-02-12"),
    "Stage 6 Open-source release (#14 (Epic 13: Open-source release: packaging, docs, multi-org))": ("2027-07-31", "2027-06-30"),
}

ASSUMPTIONS = (
    "One swarm builds a stage at a time.",
    "Stage 5 (#12 (Epic 12: Work items (issue tracking))) runs alongside Stages 3 and 4.",
    "Tig reviews.",
    "Today is 2026-09-30.",
    "Stage 0 is the work already split into #21 (Stage 0.1: Architecture decision records), #18 (Stage 0.2: Repo layout and contributor guide), #23 (Stage 0.3: Test strategy and spec-conformance scaffold), #22 (Stage 0.4: CI for lint, typecheck, and tests), #19 (Stage 0.5: Walking skeleton that deploys), #24 (Stage 0.6: A Mike seat passes CI with no human setup), and #20 (Stage 0.7: Stage dates on #1).",
    "These are Ambition dates, not Committed dates.",
    "SPEC §5 makes the real milestone a human commitment.",
    "#1 (Build GOALIE) today marks every stage Fantasy and Watercolor.",
    "This proposal moves the other stages to Ambition only after Tig accepts.",
)

# "Committed dates" counts as the phrase. "proposed Committed" does not.
_PHRASE = re.compile(r"Committed dates?")
_PROPOSED = re.compile(r"proposed Committed(?: dates?)?")
_NEGATION = re.compile(r"\b(?:not|no|never|without)\b", re.IGNORECASE)
_ISO = re.compile(r"\d{4}-\d{2}-\d{2}")


def committed_date_claims(text: str) -> list[str]:
    """Lines that apply 'Committed date' as a stage date that is already Committed.

    The label 'proposed Committed' is not a claim. A negation on the same line
    is not a claim.
    """
    claims: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not _PHRASE.search(line):
            continue
        remaining = _PROPOSED.sub("", line)
        if not _PHRASE.search(remaining):
            continue
        if _NEGATION.search(remaining):
            continue
        claims.append(line)
    return claims


class StageDates(unittest.TestCase):
    def setUp(self) -> None:
        self.text = DOC.read_text(encoding="utf-8")

    def section(self, heading: str) -> str:
        marker = f"## {heading}\n"
        self.assertIn(marker, self.text)
        rest = self.text.split(marker, 1)[1]
        nxt = rest.find("\n## ")
        if nxt >= 0:
            rest = rest[:nxt]
        return rest

    def test_stage_names(self) -> None:
        missing = [name for name in STAGE_NAMES if name not in self.text]
        self.assertEqual(missing, [])

    def test_iso_dates(self) -> None:
        missing = [day for day in ISO_DATES if day not in self.text]
        self.assertEqual(missing, [])

    def test_date_type_words(self) -> None:
        self.assertIn("Ambition", self.text)
        self.assertIn("Fantasy", self.text)
        self.assertIn("tig/mike#2 (Master: move agent harness to Mike (dashboard → tests → spec → moms))", self.text)

    def test_assumptions(self) -> None:
        missing = [line for line in ASSUMPTIONS if line not in self.text]
        self.assertEqual(missing, [])

    def test_epic_0_stays_fantasy_without_a_calendar_date(self) -> None:
        body = self.section("Epic 0 (#15 (Epic 0: Mike-enable tig/goalie))")
        self.assertIn("Date Type: Fantasy.", body)
        self.assertIn("tig/mike#2 (Master: move agent harness to Mike (dashboard → tests → spec → moms))", body)
        self.assertIn("No calendar date.", body)
        self.assertIsNone(_ISO.search(body))
        self.assertNotIn("Date Type: Ambition.", body)
        self.assertNotIn("Date Type: Committed", body)

    def test_each_later_stage_is_an_ambition_with_a_proposed_milestone(self) -> None:
        for heading, (ambition, milestone) in STAGE_DATES.items():
            body = self.section(heading)
            self.assertIn("Date Type: Ambition.", body, heading)
            self.assertIn(f"Ambition date: {ambition}.", body, heading)
            self.assertIn(f"Promotion Milestone: {milestone}, proposed Committed.", body, heading)
            self.assertIn(f"{milestone} is when this Ambition would become Committed.", body, heading)
            self.assertNotIn("Date Type: Committed", body, heading)

    def test_stage_4_is_one_quarter_and_stage_5_runs_alongside(self) -> None:
        stage_4 = self.section("Stage 4 Excaliwire pilot (#13 (Epic 11: First deployment: Excaliwire pilot))")
        stage_5 = self.section("Stage 5 Work items (#12 (Epic 12: Work items (issue tracking)))")
        self.assertIn("One quarter, matching #1 (Build GOALIE)'s done-when.", stage_4)
        self.assertIn("Alongside Stages 3 and 4, not after them.", stage_5)

    def test_no_stage_date_is_already_committed(self) -> None:
        self.assertEqual(committed_date_claims(self.text), [])
        self.assertNotIn("Date Type: Committed", self.text)

    def test_detector_flags_a_committed_claim(self) -> None:
        sample = "Stage 0 Foundations has a Committed date of 2026-10-16."
        self.assertEqual(
            committed_date_claims(sample),
            ["Stage 0 Foundations has a Committed date of 2026-10-16."],
        )

    def test_detector_allows_proposed_committed_and_negation(self) -> None:
        allowed = "\n".join(
            [
                "These are Ambition dates, not Committed dates.",
                "Promotion Milestone: 2026-10-09, proposed Committed.",
                "The label is a proposed Committed date, not a promise.",
                "A reader must not treat a stage date here as a Committed date.",
            ]
        )
        self.assertEqual(committed_date_claims(allowed), [])


if __name__ == "__main__":
    unittest.main()
