# GOALIE: low-fidelity wireframes for key user actions

Draft · based on tig/goalie @ main (SPEC Draft 0.2, USERS_MANUAL v0.1, ADRs 0001–0011, issues #1–#36). Grayscale, low fidelity. Labels use GOALIE's own lexicon.

## Key actions, in order

| # | Action / screen | Surface | Source in repo |
|---|---|---|---|
| 01 | First run: owner sets up the deployment **(assumed)** | Web app · owner | Epic 11 #13 (configure, load org tree, priority lists, manual); Epic 13 #14 (deploy and run first review from docs alone); ADR 0005 (federated sign-in); SPEC §11, §12 |
| 02 | Work between reviews: My goals (home) | Web app · desktop | SPEC §1.2, §8.2 (standard views, default columns/sort); USERS_MANUAL App. A "Work between reviews"; Epic 7 #8 |
| 03 | Org overview and org-unit views | Web app · desktop | SPEC §8.2 (organization overview; one view per org unit), §6.2 (org tree as data), §6.3; Epic 7 #8 |
| 04 | Open a goal and read it | Web app · desktop | SPEC §1.2, §6.1 (fields), §6.6 (comments), §6.9 (Draft); USERS_MANUAL App. A "Work between reviews"; Epic 7 #8 |
| 05 | Create a goal | Web app · desktop | USERS_MANUAL App. A "Create a goal"; SPEC §5 promotion rule, §6.1; Epic 7 #8 ("goal editing shows the rules as you go"); Epic 8 #9 (draft Promotion Milestone) |
| 06 | Report trouble: set YELLOW and write the PTG | Web app · desktop | USERS_MANUAL App. A "Report trouble"; SPEC §6.1 health + path_to_green; rule 8; Epic 7 #8 |
| 07 | Two people, one goal: stale write rejected | Web app · desktop | SPEC §1.2 (two actors, one goal), §6 (versions; stale write rejected, current state returned), rule 10–11; ADR 0003, 0008 |
| 08 | Record a slip | Web app · desktop | USERS_MANUAL App. A "Record a slip"; SPEC §5, §6.1 (original_committed_date, changed_due_date), rules 5–7 |
| 09 | Promote a date (commit) | Web app · desktop | USERS_MANUAL App. A "Promote a date"; SPEC §5, §6.1 (committed_plan_version), §7.1; Epic 6 #7 (pin on promote) |
| 10 | Approve or reject an agent Draft | Web app · desktop | USERS_MANUAL App. A "Approve or reject a Draft"; SPEC §6.9, §10, rule 12; Epic 8 #9 |
| 11 | Write the linked plan (collaborative Doc) | Web app · desktop | SPEC §6.5 (Doc is a page; concurrent edit; versions), §1.2; Epic 6 #7; ADR 0008 (Yjs CRDT) |
| 12 | Read a goal's history | Web app · desktop | SPEC §6.6 (Events readable on the record; follow a goal across the period), §8.1 (status-theater flag); USERS_MANUAL App. A step 6; issue #31 |
| 13 | Close a goal | Web app · desktop | USERS_MANUAL App. A "Close a goal"; SPEC §7.2 (state lifecycle, closing rule), §8.1 (Deleted stays findable) |
| 14 | Promotions due | Web app · desktop | SPEC §8.2 (Promotions due, default 2 weeks), §5; USERS_MANUAL §6 step 5; Epic 8 #9 (reminders) |
| 15 | Priorities: ranked list, cut line, re-rank | Web app · desktop | SPEC §6.3 (ranked, unique ranks, cut line, lints), §3.13, §8.3 starvation; USERS_MANUAL App. A "Re-rank priorities"; Epic 10 #11 |
| 16 | Hygiene view | Web app · desktop | SPEC §8.1 (invalid records stay visible; lints flagged not blocked), §8.3 hygiene; USERS_MANUAL §4; Epic 8 #9 (hygiene agent) |
| 17 | Prepare a review: review page and agent pre-read | Web app · desktop | Epic 10 #11 (review calendar, review pages, pre-reads); USERS_MANUAL §5, §7, App. B; SPEC §9, §10 (review prep) |
| 18 | Run the review: walk the view line by line | Web app · desktop | Epic 10 #11 (review mode, decisions and action items as Events); USERS_MANUAL §6; SPEC §9; Epic 7 #8 done-when (run default review end to end in the app) |
| 19 | Scorecard and GOALIE health (fitness functions) | Web app · desktop | Epic 9 #10 (rollups, scorecard, GOALIE health page); SPEC §8.3; USERS_MANUAL §7–8 |
| 20 | Period reset | Web app · desktop | SPEC §7.3, §3.12; USERS_MANUAL App. A "Period reset", §5 (year end) |
| 21 | Make a view: saved, shareable definition | Web app · desktop | SPEC §8.2 (view = screen + saved definition; filters), §13 items 7 & 28; Epic 7 #8 (saved, shareable views) |
| 22 | File and track work items (optional extension) | Web app · desktop | SPEC §6.7; Epic 12 #12 (work items, intake, GitHub import, evidence for health); USERS_MANUAL App. A step 5 |
| 23 | Read and maintain the User's Manual | Web app · desktop | SPEC §11 (hosted, versioned, linked from views and goal creation; agents' instructions); Epic 6 #7 (filled from config; changelog drafted); USERS_MANUAL.md |
| 24 | Settings: my settings and owner settings | Web app · desktop | SPEC §12 (owner vs user settings); ADR 0011; Epic 7 #8 (user settings); Epic 13 #14 (all settings without touching code) |
| 25 | Phone width: My goals, approve a Draft, comment | Mobile web (phone browser) | ADR 0010 (one web app; same pages usable at phone width; no native app); SPEC §1 (web and mobile); Epic 7 #8 (accessible, phone-sized) |
| 26 | Agent surface: an agent works GOALIE over MCP | Agent · MCP (CLI/chat) | Epic 5 #6 (MCP tools for each App. A how-to; Drafts; comments; errors name the rule; manual as resource); ADR 0004, 0005, 0007; SPEC §1.1, §10, §13 items 8, 21–22 |

## Excaliwire tenets applied

- **Delight Is Low Friction / remove steps before adding features:** one-screen create (05), inline Promotion Milestone, combined slip+health+PTG (08), bulk period reset (20), no Save on Docs (11), Drafts approved in place (02/04/10).
- **Self Service Or Nothing** (proposed tenet, operations#56): no GOALIE accounts, invites, or demo. Defaults first (01). Agents handle the bookkeeping over MCP (26).
- **Design For Failure:** stale-write recovery (07), SSE resume by sequence, plain-language rejections that name the rule (26).
- **Customers Own Their Data:** one-click full export (19). The history is readable on every record (12).

## Assumptions

- Platform per ADR 0010: one server-rendered web app, the same pages at phone width, no native app. The agent surface is MCP (ADR 0004).
- Sign-in is federated Entra ID behind oauth2-proxy (ADR 0005), so there's no GOALIE sign-in, sign-up, or password screen. Frame 01's first-run checklist *shape* is assumed. The repo requires the steps, not the screen.
- Sample data (GOAL ids, Factory/Product/Operations units, Pat as a second human, agent names) is illustrative. ADR 0005's first deployment has one human actor (Tig).
- Specific UI choices marked *assumed* in frame annotations: worst-child health rollup (03), derived Completed vs Completed Late (13), enforced owner and date on action items (18), pre-filled period-reset reasons (20), the ⓘ marker when the date-type column is hidden (21).
- Left nav order and the favorites/reviews sections are a design choice. The views themselves are the SPEC §8.2 standard views.

## Open product questions

1. **01 First run: owner sets up the deployment:** Is an agent allowed to Draft the org tree from Entra groups, or does a human always enter it in the app? The spec is silent.
2. **03 Org overview and org-unit views:** How should health roll up across the tree (worst child, owner-set, or none)? SPEC §8.3 rollups don't define a unit-level health.
3. **05 Create a goal:** Should the UI pre-fill the milestone itself, or always leave it to the drafting agent's Draft per #9? Pre-filling removes an approval step.
4. **06 Report trouble: set YELLOW and write the PTG:** SPEC §8.1 says a violating save is either rejected *or* opens a Draft for the owner. For human edits in the UI, is it always reject-inline?
5. **08 Record a slip:** Should a slip, health change, and PTG save as one Event or one Event per field? Rule 10 says one write at a time per structured field.
6. **10 Approve or reject an agent Draft:** Is "Edit, then approve" allowed (does it become a human write rather than an approval)? The spec only names approve or reject.
7. **11 Write the linked plan (collaborative Doc):** Is plan_maturity set by the owner on the goal, or on the Doc? SPEC puts it on the goal; the editor needs to show it in both places.
8. **13 Close a goal:** Should GOALIE derive Completed vs Completed Late automatically, or let the owner pick and lint the mismatch?
9. **15 Priorities: ranked list, cut line, re-rank:** Is re-ranking outside a scheduled review blocked, warned, or allowed? It's a norm, so it probably shouldn't be blocked.
10. **17 Prepare a review: review page and agent pre-read:** Who receives the pre-read and how (in-app only, or email via the M365 tenant)? The spec says pre-reads "go out" but names no channel.
11. **18 Run the review: walk the view line by line:** Is an action item a work item, a goal, or a new record? The spec and #11 call action items Events but define no entity; this affects the data model.
12. **20 Period reset:** Do pre-filled reasons satisfy "a written reason", or must each be typed by a human to avoid reason theater?
13. **22 File and track work items (optional extension):** Can a work item exist with no goal (true backlog intake), or must it link to one? #12 says it "links to a goal"; Excaliwire's backlog today has many unlinked issues.
14. **25 Phone width: My goals, approve a Draft, comment:** What's the mobile scope: triage only (approve, comment, health), or full parity including priority re-rank and plan editing?
15. **26 Agent surface: an agent works GOALIE over MCP:** Which agent actors does Excaliwire register first (drafting, hygiene, review, manual), and who is each one's operator? USERS_MANUAL §3 leaves ‹list agents and operators› blank.

**01 · First run: owner sets up the deployment**: The GOALIE owner's first run: defaults on, org tree, priority lists, a pre-filled manual. No sign-up or demo.

![01 · First run: owner sets up the deployment](png/01-first-run-owner-sets-up-the-deployment.png)

**02 · Work between reviews: My goals (home)**: My goals is home: RED first, a date type on every date, Drafts waiting, Presence, and live updates.

![02 · Work between reviews: My goals (home)](png/02-work-between-reviews-my-goals-home.png)

**03 · Org overview and org-unit views**: Org overview and per-unit views. Below-cut-line goals and goal-type mix are visible at a glance.

![03 · Org overview and org-unit views](png/03-org-overview-and-org-unit-views.png)

**04 · Open a goal and read it**: A goal page: every field, a live Draft banner, flat comments, and History and Work items tabs.

![04 · Open a goal and read it](png/04-open-a-goal-and-read-it.png)

**05 · Create a goal**: Create a goal on one screen. An Ambition date expands its Promotion Milestone inline.

![05 · Create a goal](png/05-create-a-goal.png)

**06 · Report trouble: set YELLOW and write the PTG**: Set YELLOW and GOALIE asks for a structured Path to Green plus a reason before saving.

![06 · Report trouble: set YELLOW and write the PTG](png/06-report-trouble-set-yellow-and-write-the-ptg.png)

**07 · Two people, one goal: stale write rejected**: Two people, one goal. A stale structured save is rejected, current state shown, one-click re-apply.

![07 · Two people, one goal: stale write rejected](png/07-two-people-one-goal-stale-write-rejected.png)

**08 · Record a slip**: Record a slip: the original committed date is locked, with a reason, health, and PTG in one write.

![08 · Record a slip](png/08-record-a-slip.png)

**09 · Promote a date (commit)**: Promote Ambition to Committed. The Pencil gate, the negotiated date, and the pinned plan version are all shown before you confirm.

![09 · Promote a date (commit)](png/09-promote-a-date-commit.png)

**10 · Approve or reject an agent Draft**: Approve or reject an agent Draft against its base version, with your reason on record.

![10 · Approve or reject an agent Draft](png/10-approve-or-reject-an-agent-draft.png)

**11 · Write the linked plan (collaborative Doc)**: The plan is a live, collaborative Markdown Doc with versions and the commit-time pin.

![11 · Write the linked plan (collaborative Doc)](png/11-write-the-linked-plan-collaborative-doc.png)

**12 · Read a goal's history**: Goal history: every Event with actor, old and new value, and reason, filterable across the period.

![12 · Read a goal's history](png/12-read-a-goal-s-history.png)

**13 · Close a goal**: Close a goal. On time or late is derived from the original committed date.

![13 · Close a goal](png/13-close-a-goal.png)

**14 · Promotions due**: Promotions due: milestones in the window, plus missed ones, each with its action on the row.

![14 · Promotions due](png/14-promotions-due.png)

**15 · Priorities: ranked list, cut line, re-rank**: Priorities: a ranked list with what each entry starves, an explicit cut line, drag-to-re-rank with a reason, and starvation bars.

![15 · Priorities: ranked list, cut line, re-rank](png/15-priorities-ranked-list-cut-line-re-rank.png)

**16 · Hygiene view**: Hygiene: every invariant break and lint stays visible. Agents fix the safe ones.

![16 · Hygiene view](png/16-hygiene-view.png)

**17 · Prepare a review: review page and agent pre-read**: Review page plus an agent-drafted pre-read built from the event log.

![17 · Prepare a review: review page and agent pre-read](png/17-prepare-a-review-review-page-and-agent-pre-read.png)

**18 · Run the review: walk the view line by line**: Review mode: walk RED and YELLOW line by line, decide in place, capture owned and dated action items.

![18 · Run the review: walk the view line by line](png/18-run-the-review-walk-the-view-line-by-line.png)

**19 · Scorecard and GOALIE health (fitness functions)**: Scorecard and GOALIE health: fitness functions against the manual's targets, plus full export.

![19 · Scorecard and GOALIE health (fitness functions)](png/19-scorecard-and-goalie-health-fitness-functions.png)

**20 · Period reset**: Period reset: close out every goal in one pass and re-create continuing work as Carryover or Repeating.

![20 · Period reset](png/20-period-reset.png)

**21 · Make a view: saved, shareable definition**: Make a view: a saved, shareable definition of filters, columns, and sort, with a live preview.

![21 · Make a view: saved, shareable definition](png/21-make-a-view-saved-shareable-definition.png)

**22 · File and track work items (optional extension)**: Work items (optional): the list under a goal, quick-add, GitHub import, and evidence for health.

![22 · File and track work items (optional extension)](png/22-file-and-track-work-items-optional-extension.png)

**23 · Read and maintain the User's Manual**: The User's Manual lives in GOALIE, is filled from config, and doubles as the agents' rulebook.

![23 · Read and maintain the User's Manual](png/23-read-and-maintain-the-user-s-manual.png)

**24 · Settings: my settings and owner settings**: Settings: users change appearance and favorites; only the GOALIE owner sees owner settings.

![24 · Settings: my settings and owner settings](png/24-settings-my-settings-and-owner-settings.png)

**25 · Phone width: My goals, approve a Draft, comment**: Phone width: the same web app for triage. Approve Drafts and comment from a phone browser.

![25 · Phone width: My goals, approve a Draft, comment](png/25-phone-width-my-goals-approve-a-draft-comment.png)

**26 · Agent surface: an agent works GOALIE over MCP**: Agent surface: an agent creates goals and Drafts over MCP, errors name the broken rule, and the Draft shows live in the app.

![26 · Agent surface: an agent works GOALIE over MCP](png/26-agent-surface-an-agent-works-goalie-over-mcp.png)
