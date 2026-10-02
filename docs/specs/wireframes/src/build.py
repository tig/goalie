"""Build the GOALIE wireframes: one PNG per frame, plus a walkthrough in Markdown.

Usage (from the repository root):
    python docs/specs/wireframes/src/build.py

Needs Python 3.10+ and Playwright (`pip install playwright`, then
`python -m playwright install chromium`). Set CHROME_PATH to use an installed
Chrome or Chromium instead of Playwright's bundled browser.
Outputs go to docs/specs/wireframes/png/ and
docs/specs/wireframes/walkthrough.md.
"""
from __future__ import annotations

import html
import os
import re
import sys
import tempfile
from pathlib import Path

SRC = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC))

from frames7 import F, frame  # noqa: E402  (frames1..7 each append to F)
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = SRC.parent
PNG = OUT / "png"
WALKTHROUGH = OUT / "walkthrough.md"


def slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48]


CAP={
1:"The GOALIE owner's first run: defaults on, org tree, priority lists, a pre-filled manual. No sign-up or demo.",
2:"My goals is home: RED first, a date type on every date, Drafts waiting, Presence, and live updates.",
3:"Org overview and per-unit views. Below-cut-line goals and goal-type mix are visible at a glance.",
4:"A goal page: every field, a live Draft banner, flat comments, and History and Work items tabs.",
5:"Create a goal on one screen. An Ambition date expands its Promotion Milestone inline.",
6:"Set YELLOW and GOALIE asks for a structured Path to Green plus a reason before saving.",
7:"Two people, one goal. A stale structured save is rejected, current state shown, one-click re-apply.",
8:"Record a slip: the original committed date is locked, with a reason, health, and PTG in one write.",
9:"Promote Ambition to Committed. The Pencil gate, the negotiated date, and the pinned plan version are all shown before you confirm.",
10:"Approve or reject an agent Draft against its base version, with your reason on record.",
11:"The plan is a live, collaborative Markdown Doc with versions and the commit-time pin.",
12:"Goal history: every Event with actor, old and new value, and reason, filterable across the period.",
13:"Close a goal. On time or late is derived from the original committed date.",
14:"Promotions due: milestones in the window, plus missed ones, each with its action on the row.",
15:"Priorities: a ranked list with what each entry starves, an explicit cut line, drag-to-re-rank with a reason, and starvation bars.",
16:"Hygiene: every invariant break and lint stays visible. Agents fix the safe ones.",
17:"Review page plus an agent-drafted pre-read built from the event log.",
18:"Review mode: walk RED and YELLOW line by line, decide in place, capture owned and dated action items.",
19:"Scorecard and GOALIE health: fitness functions against the manual's targets, plus full export.",
20:"Period reset: close out every goal in one pass and re-create continuing work as Carryover or Repeating.",
21:"Make a view: a saved, shareable definition of filters, columns, and sort, with a live preview.",
22:"Work items (optional): the list under a goal, quick-add, GitHub import, and evidence for health.",
23:"The User's Manual lives in GOALIE, is filled from config, and doubles as the agents' rulebook.",
24:"Settings: users change appearance and favorites; only the GOALIE owner sees owner settings.",
25:"Phone width: the same web app for triage. Approve Drafts and comment from a phone browser.",
26:"Agent surface: an agent creates goals and Drafts over MCP, errors name the broken rule, and the Draft shows live in the app.",
}
ASSUME = [
    "Platform per ADR 0010: one server-rendered web app, the same pages at phone width, no native app. The agent surface is MCP (ADR 0004).",
    "Sign-in is federated Entra ID behind oauth2-proxy (ADR 0005), so there's no GOALIE sign-in, sign-up, or password screen. Frame 01's first-run checklist *shape* is assumed. The repo requires the steps, not the screen.",
    "Sample data (GOAL ids, Factory/Product/Operations units, Pat as a second human, agent names) is illustrative. ADR 0005's first deployment has one human actor (Tig).",
    "Specific UI choices marked *assumed* in frame annotations: worst-child health rollup (03), derived Completed vs Completed Late (13), enforced owner and date on action items (18), pre-filled period-reset reasons (20), the ⓘ marker when the date-type column is hidden (21).",
    "Left nav order and the favorites/reviews sections are a design choice. The views themselves are the SPEC §8.2 standard views.",
]
TEN = [
    "**Delight Is Low Friction / remove steps before adding features:** one-screen create (05), inline Promotion Milestone, combined slip+health+PTG (08), bulk period reset (20), no Save on Docs (11), Drafts approved in place (02/04/10).",
    "**Self Service Or Nothing** (proposed tenet, operations#56): no GOALIE accounts, invites, or demo. Defaults first (01). Agents handle the bookkeeping over MCP (26).",
    "**Design For Failure:** stale-write recovery (07), SSE resume by sequence, plain-language rejections that name the rule (26).",
    "**Customers Own Their Data:** one-click full export (19). The history is readable on every record (12).",
]


def walkthrough_md(meta: list[dict]) -> str:
    """The walkthrough: cover, tenets, assumptions, questions, then each frame with its caption."""
    out = [
        "# GOALIE: low-fidelity wireframes for key user actions",
        "",
        "Draft · based on tig/goalie @ main (SPEC Draft 0.2, USERS_MANUAL v0.1, ADRs 0001–0011, issues #1–#36). Grayscale, low fidelity. Labels use GOALIE's own lexicon.",
        "",
        "## Key actions, in order",
        "",
        "| # | Action / screen | Surface | Source in repo |",
        "|---|---|---|---|",
    ]
    for m in meta:
        title = m["title"] + (" **(assumed)**" if m["assumed"] else "")
        out.append(f"| {m['n']:02d} | {title} | {m['tag']} | {html.unescape(m['src'])} |")
    out += ["", "## Excaliwire tenets applied", ""] + [f"- {t}" for t in TEN]
    out += ["", "## Assumptions", ""] + [f"- {a}" for a in ASSUME]
    out += ["", "## Open product questions", ""]
    qs = [m for m in meta if m.get("q")]
    for k, m in enumerate(qs, 1):
        q = re.sub(r"</?i>", "*", m["q"])
        out.append(f"{k}. **{m['n']:02d} {m['title']}:** {html.unescape(q)}")
    for m in meta:
        out += ["", f"**{m['n']:02d} · {m['title']}**: {CAP[m['n']]}", "",
                f"![{m['n']:02d} · {m['title']}](png/{m['name']}.png)"]
    return "\n".join(out) + "\n"


def main() -> None:
    PNG.mkdir(parents=True, exist_ok=True)
    for old in PNG.glob("*.png"):
        old.unlink()
    meta = []
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        for i, f in enumerate(F, 1):
            page = frame(i, f["title"], f["src"], f["screen"], f["notes"], f.get("tenet"), f.get("q"),
                         f.get("tag", "Web app · desktop"), f.get("assumed", False))
            name = f"{i:02d}-{slug(f['title'])}"
            (tmpdir / f"{name}.html").write_text(page, encoding="utf-8")
            meta.append(dict(n=i, name=name, title=f["title"], src=f["src"], q=f.get("q"),
                             assumed=f.get("assumed", False), tag=f.get("tag", "Web app · desktop")))
        launch = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
        with sync_playwright() as p:
            browser = p.chromium.launch(**launch)
            pg = browser.new_page(viewport={"width": 1280, "height": 800})
            for m in meta:
                pg.goto((tmpdir / f"{m['name']}.html").as_uri())
                pg.locator(".frame").screenshot(path=str(PNG / f"{m['name']}.png"))
            browser.close()
    WALKTHROUGH.write_text(walkthrough_md(meta), encoding="utf-8")
    print(f"{len(meta)} frames -> {PNG}; walkthrough -> {WALKTHROUGH}")


if __name__ == "__main__":
    main()
