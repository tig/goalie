from frames5 import *

# 21 Custom view
s=shell(f'''<div class="row"><h2>New view</h2><span class="sp"></span><span class="btn">Cancel</span><span class="btn pri">Save view</span></div>
<div class="grid2" style="grid-template-columns:330px 1fr;margin-top:8px"><div class="card"><h4>Definition {P(1)}</h4>
<div class="f"><label>Name</label><div class="in">Factory RED/YELLOW</div></div>
<div class="f"><label>Select goals where</label><div style="line-height:2"><span class="chip on">org unit = Factory</span> <span class="chip on">health ≠ GREEN</span> <span class="chip on">period = 2026</span> <span class="chip">+ level</span> <span class="chip">+ owner</span> <span class="chip">+ type</span> <span class="chip">+ severity</span> <span class="chip">+ priority</span> <span class="chip">+ date type</span></div></div>
<div class="f"><label>Columns {P(2)}</label><div class="muted">☑ Summary ☑ State ☑ Health ☑ Due date ☑ Date type ☑ Promotion milestone ☑ Owner ☑ PTG ☐ Severity ☐ Priority ☐ Parent.summary</div></div>
<div class="f"><label>Sort</label><div class="in">Health (RED→GREEN), then due date</div></div>
<div class="f"><label>Sharing {P(3)}</label><div class="row"><span class="chip on">Organization</span><span class="chip">Only me</span><span class="sp"></span><span>☑ Add to my favorites</span></div></div></div>
<div><div class="muted" style="margin-bottom:4px">Live preview {P(4)}</div>{goal_table([R_MINE[0][:3]+[R_MINE[0][3]], R_MINE[1][:3]+[R_MINE[1][3]]], cols=["Summary","State","Health","Due date"])}
<div class="card warn" style="margin-top:10px">Removing the <b>Date type</b> column is allowed. Dates then show a ⓘ marker so an uncommitted date never reads as a promise. {P(5)}</div></div></div>''', url="goalie.excaliwire.com/views/new")
add(title="Make a view: saved, shareable definition", src="SPEC §8.2 (view = screen + saved definition; filters), §13 items 7 &amp; 28; Epic 7 #8 (saved, shareable views)",
 screen=s, notes=["Filters are the spec's selectors: level, org unit, owner, type, severity, priority, date type, health, period.",
 "The default columns are pre-checked. Fields from linked records (e.g. parent.summary) are allowed.",
 "Shareable by default (transparent), or private. Favoriting writes the user setting.",
 "Live preview, so there's no separate save-then-test step.",
 "Custom views may drop the date-type column. <i>The ⓘ fallback marker is assumed.</i>"],
 tenet="<b>Low friction:</b> start from any view's chips and \"Save as view\", or build here from defaults. There's no query language (ADR 0003).")

# 22 Work items
s=shell(f'''{goal_head()}
<div class="tabs"><span>Comments</span><span>History</span><span class="on">Work items (6) {P(1)}</span></div>
<table class="g"><tr><th>Item</th><th>Owner</th><th>Status</th><th>Due</th><th>Links</th></tr>
<tr><td><span class="id">WI-201</span> Bounded cost estimate before "go"</td><td>{av("Wk",True)} worker-agent</td><td>In progress</td><td>Nov 1</td><td>factory#1602 PR</td></tr>
<tr><td><span class="id">WI-202</span> Upload flow without login wall</td><td>Tig</td><td>Open</td><td>Nov 8</td><td>factory#1540</td></tr>
<tr><td><span class="id">WI-207</span> Imported: "EPLAN export" {P(2)}</td><td>Tig</td><td>Open</td><td>—</td><td>factory#1557</td></tr></table>
<div class="card" style="margin-top:10px"><div class="row"><b>+ File a work item</b> {P(3)}<span class="sp"></span><span class="muted">no agent required</span></div>
<div class="grid4" style="grid-template-columns:2fr 1fr 1fr 1fr"><div class="in">Show cost estimate in app</div><div class="in">Owner: Tig ▾</div><div class="in">Due: Nov 15</div><div class="in ph">Link (PR, issue)</div></div><div class="row" style="margin-top:6px"><span class="sp"></span><span class="btn pri">Add</span></div></div>
<div class="card draft">Evidence for health {P(4)}: 2 of 6 items overdue → feeds drafting-agent's next health Draft.</div>
<div class="card"><span class="btn ghost">Import from GitHub repo…</span> <span class="muted">excaliwire/factory · open issues → work items, linked as Work Product</span></div>''', url="goalie.excaliwire.com/goals/GOAL-12/work-items")
add(title="File and track work items (optional extension)", src="SPEC §6.7; Epic 12 #12 (work items, intake, GitHub import, evidence for health); USERS_MANUAL App. A step 5",
 screen=s, notes=["When the extension is on, work items are the group's list of work under a goal. The tab is hidden when it's off.",
 "Imported GitHub issues keep their link. This is how factory issues (today's backlog) move into GOALIE.",
 "Quick-add with four fields. The record deliberately doesn't copy the goal schema: no sprints, no points.",
 "Overdue and blocked items count as evidence in the agent's health Draft."],
 tenet="<b>Remove steps:</b> a one-line add and a one-click import, and agents pick up items over MCP. GitHub Issues is retired as the stopgap.",
 q="Can a work item exist with no goal (true backlog intake), or must it link to one? #12 says it \"links to a goal\"; Excaliwire's backlog today has many unlinked issues.")

# 23 User's Manual
s=shell(f'''<div class="row"><h2>Excaliwire GOALIE User's Manual · v0.3</h2><span class="sp"></span><span class="muted">owner Tig</span><span class="btn">Edit</span></div>
<div class="grid2" style="grid-template-columns:200px 1fr;margin-top:8px"><div class="card" style="font-size:11.5px;line-height:1.9"><b>Contents</b><br>1 Purpose<br>2 Words we use<br>3 Who does what<br><b>4 Rules</b><br>5 Cadence<br>6 How a review runs<br>7 Outputs<br>8 Health<br>A How-tos<br>B Review pages<br>C Examples<br>Changelog</div>
<div><div class="md"><b>4. Rules</b>
Hard rules. GOALIE enforces these; you can't turn them off.
1. Every goal has exactly one human owner.
2. Every goal has a date and a date type.
…
<b>Defaults for Excaliwire</b> {P(1)}
- Plan period: calendar year          ← from Owner settings
- Promotions due window: 2 weeks      ← from Owner settings
- ‹who may correct an Original Committed Date›  ⚠ blank</div>
<div class="card draft" style="margin-top:8px"><b>Draft changelog entry</b> by manual-agent {P(2)}: "Promotions-due window 2 → 3 weeks (owner setting changed Oct 2)". <span class="btn">Approve</span></div>
<div class="muted">Linked from every default view (footer ⓘ) and from New goal. {P(3)} Agents load this same Doc over MCP as their instructions. {P(4)}</div></div></div>''', active="man", url="goalie.excaliwire.com/docs/users-manual")
add(title="Read and maintain the User's Manual", src="SPEC §11 (hosted, versioned, linked from views and goal creation; agents' instructions); Epic 6 #7 (filled from config; changelog drafted); USERS_MANUAL.md",
 screen=s, notes=["Configured values are filled in from owner settings, and unfilled ‹…› blanks are flagged.",
 "When configuration changes, an agent drafts the changelog entry and the owner approves it.",
 "Reachable from every default view and from goal creation.",
 "The manual is the agents' rulebook too (an MCP resource). There's no second copy to drift."],
 tenet="<b>Low cognitive load:</b> the manual is short and one click from where you work. Config and manual can't drift because one writes the other.")

# 24 Settings
s=shell(f'''<h2>Settings</h2>
<div class="grid2" style="margin-top:8px"><div class="card"><h4>My settings {P(1)}</h4>
<div class="f"><label>Appearance</label><div class="row"><span class="chip on">Light (default)</span><span class="chip">Dark</span></div></div>
<div class="f"><label>Favorite views</label><div style="line-height:2">★ Factory RED/YELLOW ✕<br>☆ Promotions due<br>☆ Priorities · Company</div></div>
<div class="muted">Only you can change these.</div></div>
<div class="card warn"><h4>Owner settings: GOALIE owner only {P(2)}</h4>
<div class="kv" style="grid-template-columns:200px 1fr"><div>Org levels</div><div>Company / Program or Function / Team / Individual</div><div>Goal types</div><div>5 default types</div><div>Severity scale</div><div>sev1–sev3</div><div>Priority lists</div><div>Company, Program, Function · cut line on · flag &gt; 4</div><div>Fiscal calendar</div><div>Calendar quarters · yearly period</div><div>Reviews &amp; cadence</div><div>3 reviews (edit)</div><div>Promotions-due window</div><div>2 weeks</div><div>Visibility policy</div><div>Organization-wide · logged exceptions</div><div>Correct Original Committed Date</div><div>GOALIE owner only, with reason</div><div>Lints enabled</div><div>All</div><div>Live-update time</div><div>1 s</div></div>
<div class="muted" style="margin-top:6px">Invariants are not settings and are not listed. {P(3)} Each change is an Event and drafts a manual changelog entry. {P(4)}</div></div></div>''', active="set", url="goalie.excaliwire.com/settings")
add(title="Settings: my settings and owner settings", src="SPEC §12 (owner vs user settings); ADR 0011; Epic 7 #8 (user settings); Epic 13 #14 (all settings without touching code)",
 screen=s, notes=["User settings are just appearance and favorite views. Each user sees only their own.",
 "The owner panel only renders for the GOALIE owner. Everyone else doesn't see it at all.",
 "Invariants never show up as toggles. Turning one off would mean it isn't GOALIE.",
 "Owner changes are logged and flow into the manual's changelog (frame 23)."],
 tenet="<b>Low cognitive load:</b> two settings for users. Everything else is a sensible default owned by one person.")
