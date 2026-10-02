from kit import *

F=[]
def add(**k): F.append(k)

def goal_table(rows, cols=None, pins=None):
    cols = cols or ["Summary","State","Health","Due date","Promotion milestone","Owner","PTG"]
    th="".join(f"<th>{c}</th>" for c in cols)
    tr="".join("<tr>"+"".join(f"<td>{c}</td>" for c in r)+"</tr>" for r in rows)
    return f'<table class="g"><tr>{th}</tr>{tr}</table>'

R_MINE=[
 [f'<span class="id">GOAL-12</span> Launch self-serve factory runs {av("Pa")} {av("Hy",True)}', "In Progress", H("RED"), f'Mar 31 {DT("Ambition")}', 'GOAL-19 · Nov 15 <span class="muted">(missed)</span>', "Tig", "<u>3 steps</u>"],
 [f'<span class="id">GOAL-40</span> Reduce canon review time to 10 min', "In Progress", H("YELLOW"), f'Dec 18 {DT("Committed")}<br><span class="muted">was Dec 4</span>', "—", "Tig", "<u>2 steps</u>"],
 [f'<span class="id">GOAL-31</span> Retire GitHub Issues for company tickets', "In Progress", H("GREEN"), f'Jan 29 {DT("Ambition")}', "GOAL-33 · Oct 30", "Tig", "—"],
 [f'<span class="id">GOAL-23</span> Ship EPLAN export pack', "Backlog", "—", f'Jun 30 {DT("Fantasy")}', "GOAL-24 · Dec 15", "Tig", "—"],
]

# 01 first run
s=shell(f'''<h2>Set up GOALIE for Excaliwire {P(1)}</h2><div class="sub">You're the GOALIE owner. Signed in with your Excaliwire Microsoft account; no GOALIE password exists.</div>
<div class="grid2" style="margin-top:12px"><div>
<div class="card"><h4>☑ Defaults applied {P(2)}</h4><div class="muted">Levels Company / Program or Function / Team / Individual · sev1–sev3 · calendar quarters · yearly period · Promotions-due window 2 weeks · live updates 1 s</div><div style="margin-top:6px"><span class="btn ghost">Change in Owner settings</span></div></div>
<div class="card warn"><h4>☐ Org tree {P(3)}</h4>
<div style="font-size:12px;line-height:1.7">Excaliwire <span class="chip">Company</span> owner Tig<br>&nbsp;&nbsp;├ Factory <span class="chip">Program</span> owner Tig<br>&nbsp;&nbsp;├ Product <span class="chip">Program</span> owner Tig<br>&nbsp;&nbsp;└ Operations <span class="chip">Function</span> owner Tig<br>&nbsp;&nbsp;<span class="btn ghost">+ Add org unit</span></div>
<div class="row" style="margin-top:6px"><span class="card draft" style="margin:0;padding:4px 8px">Draft by setup-agent: tree from Entra groups</span><span class="btn">Approve</span></div></div>
</div><div>
<div class="card"><h4>☐ Priority lists {P(4)}</h4><div class="muted">Company list, then each Program/Function. Ranked, no ties.</div><span class="btn">Start Company list</span></div>
<div class="card"><h4>☑ User's Manual {P(5)}</h4><div class="muted">Copied from template v0.1 and filled from your settings. 9 ‹…› blanks left.</div><span class="btn">Open manual</span></div>
<div class="card"><h4>☐ First goals</h4><div class="muted">Import the open company tickets from excaliwire/factory? {P(6)}</div><span class="btn">Import from GitHub</span> <span class="btn ghost">Create a goal</span></div>
<div class="card"><h4>☐ First review</h4><div class="muted">Pick a cadence; GOALIE creates the review page.</div></div>
</div></div>''', active=None, url="goalie.excaliwire.com/setup")
add(title="First run: owner sets up the deployment", src="Epic 11 #13 (configure, load org tree, priority lists, manual); Epic 13 #14 (deploy and run first review from docs alone); ADR 0005 (federated sign-in); SPEC §11, §12",
 screen=s, assumed=True, tag="Web app · owner",
 notes=["Shape of this screen is assumed; the repo requires the steps, not a checklist. Sign-in is Entra via oauth2-proxy, so GOALIE has no sign-in or sign-up page at all.",
        "Every SPEC §12 owner setting starts at its default. Nothing must be configured before first use.",
        "Org tree is data with one human owner per unit (SPEC §6.2). An agent may Draft it; the owner approves.",
        "Priority lists per SPEC §6.3. Links to frame 15.",
        "Manual pre-filled from configuration (#7). Remaining blanks stay visible as a checklist item.",
        "Import from GitHub Issues is in Epic 12 #12 scope; offered here because Excaliwire's backlog lives in factory issues today."],
 tenet="<b>Self-serve, remove steps:</b> no account creation, no invite emails (identities come from Entra), no demo. Defaults first, change later. The deployment is usable the moment the org tree exists.",
 q="Is an agent allowed to Draft the org tree from Entra groups, or does a human always enter it in the app? The spec is silent.")

# 02 My goals
s=shell(f'''<div class="row"><h2>My goals {P(1)}</h2><span class="chip">Period: 2026</span><span class="chip">View def: owner = me · sort Health</span><span class="sp"></span><span class="btn ghost">☆ Favorite</span><span class="btn pri">+ New goal</span></div>
<div class="sub" style="margin:4px 0 10px">Default sort RED → YELLOW → GREEN {P(2)} · date type shown next to every date {P(3)}</div>
{goal_table(R_MINE)}
<div class="row" style="margin-top:10px"><div class="card draft" style="flex:1;margin:0"><b>2 Drafts wait for you</b> {P(4)} · drafting-agent proposed a PTG on GOAL-40 · a Promotion Milestone on GOAL-23</div></div>
<div class="row" style="margin-top:8px;font-size:11px" class="muted"><span>Presence {P(5)}: {av("Pa")} Pat viewing GOAL-12 · {av("Hy",True)} hygiene-agent (op. Tig) reading GOAL-12</span><span class="sp"></span><span class="muted">Updated 0.4 s ago · seq 18,204 {P(6)}</span></div>''',
 presence=f' {av("Pa")}{av("Hy",True)}')
add(title="Work between reviews: My goals (home)", src="SPEC §1.2, §8.2 (standard views, default columns/sort); USERS_MANUAL App. A \"Work between reviews\"; Epic 7 #8",
 screen=s, notes=["Home surface. A view is a screen plus a saved definition (owner, columns, sort), never a DB view.",
 "Default sort RED → YELLOW → GREEN. Rows are clickable; Plan and Work Product are one click away from the goal.",
 "Date type badge on every date: solid = Committed, gray = Ambition, dashed = Fantasy. A changed date shows the original under it.",
 "Pending Drafts addressed to me surface here, so approving them doesn't need its own inbox.",
 "Presence: humans as round avatars, agents as square dashed ones labeled with their operator. Presence is not an Event.",
 "Live: committed changes land within 1 s via SSE. On reconnect the client resumes from the last sequence; no refresh button."],
 tenet="<b>Low friction:</b> one screen holds everything a goal owner needs between reviews: their goals, what's wrong, and what's waiting on them. No separate notification inbox, no refresh.")

# 03 Org overview / org unit
tree=f'''<div style="font-size:12px;line-height:1.8"><b>Excaliwire</b> {H("YELLOW")} 9 goals<br>&nbsp;├ <b>Factory</b> {H("RED")} 4 · <span class="muted">Tig</span><br>&nbsp;├ <b>Product</b> {H("GREEN")} 3 · <span class="muted">Tig</span><br>&nbsp;└ <b>Operations</b> {H("YELLOW")} 2 · <span class="muted">Tig</span></div>'''
s=shell(f'''<div class="row"><h2>Org overview {P(1)}</h2><span class="chip on">Company</span><span class="chip">Program or Function</span><span class="chip">Team</span><span class="sp"></span><span class="chip">Period 2026</span></div>
<div class="grid2" style="grid-template-columns:230px 1fr;margin-top:10px"><div class="card">{tree}<div class="muted" style="margin-top:6px">Rollup = worst child health {P(2)}</div></div>
<div><div class="row"><b>Factory</b> <span class="muted">Program · owner Tig · priority list: 3 above the cut line</span><span class="sp"></span><span class="btn ghost">Open Factory view</span></div>
{goal_table([
 [f'<span class="id">GOAL-12</span> Launch self-serve factory runs', H("RED"), f'Mar 31 {DT("Ambition")}', "GOAL-19 Nov 15", "PRI-1 Self-serve end to end"],
 [f'<span class="id">GOAL-40</span> Reduce canon review time to 10 min', H("YELLOW"), f'Dec 18 {DT("Committed")}', "—", "PRI-1"],
 [f'<span class="id">GOAL-47</span> Pass quality bar on instrument cluster', H("GREEN"), f'Nov 30 {DT("Committed")}', "—", "PRI-2 Canon quality"],
 [f'<span class="id">GOAL-23</span> Ship EPLAN export pack', "Backlog", f'Jun 30 {DT("Fantasy")}', "GOAL-24 Dec 15", f'PRI-5 <span class="lint">below cut</span> {P(3)}'],
], cols=["Summary","Health","Due date","Promotion milestone","Priority"])}
<div class="row" style="margin-top:8px"><span class="chip">Goal-type mix: 2 Launch · 1 Metric (Ops) · 1 Commit</span> {P(4)}<span class="chip">Date types: 2 C · 1 A · 1 F</span></div></div></div>''', active="org", url="goalie.excaliwire.com/views/org")
add(title="Org overview and org-unit views", src="SPEC §8.2 (organization overview; one view per org unit), §6.2 (org tree as data), §6.3; Epic 7 #8",
 screen=s, notes=["Org overview: the tree is data. Clicking a unit opens that unit's own view (also in the left nav).",
 "Rollup shows the worst child health so a RED never hides behind a GREEN parent. <i>Rollup rule is assumed.</i>",
 "Goals under a priority below the cut line are marked, so the starvation is visibly deliberate.",
 "Mix chips let reviewers check whether a unit has the right mix of goal types (SPEC §6.1 type)."],
 tenet="<b>Low cognitive load:</b> one view, filter chips instead of a report builder. Rollup computed, never typed in.",
 q="How should health roll up across the tree (worst child, owner-set, or none)? SPEC §8.3 rollups don't define a unit-level health.")
