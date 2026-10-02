from frames3 import *

# 14 Promotions due
s=shell(f'''<div class="row"><h2>Promotions due {P(1)}</h2><span class="chip">window: next 2 weeks</span><span class="chip">+ missed since last review</span><span class="sp"></span><span class="btn ghost">☆ Favorite</span></div>
{goal_table([
 [f'<span class="id">GOAL-33</span> Commit GOALIE cutover date', f'<span class="id">GOAL-31</span> Retire GitHub Issues', f'{DT("Ambition")} → Committed', 'Oct 30 · in 12 d', f'Crayon <span class="lint">needs Pencil</span>', f'<span class="btn">Promote…</span> {P(2)}'],
 [f'<span class="id">GOAL-52</span> Pick pricing model by date', f'<span class="id">GOAL-50</span> Publish pricing', f'{DT("Fantasy")} → Ambition', 'Oct 9 · in 7 d', 'Watercolor', '<span class="btn">Promote…</span>'],
 [f'<span class="id">GOAL-19</span> Commit self-serve launch date', f'<span class="id">GOAL-12</span> Launch self-serve runs', f'{DT("Ambition")} → Committed', f'Nov 15 · <b>missed</b> {H("RED")}', 'Crayon', f'<span class="btn">Open PTG</span> {P(3)}'],
], cols=["Promotion Milestone","Parent goal","Promotion","Milestone date","Plan maturity","Action"])}
<div class="card draft" style="margin-top:10px">drafting-agent reminded Tig about GOAL-33 on Oct 18 (comment on GOAL-31) {P(4)}</div>''', active="promo", url="goalie.excaliwire.com/views/promotions-due")
add(title="Promotions due", src="SPEC §8.2 (Promotions due, default 2 weeks), §5; USERS_MANUAL §6 step 5; Epic 8 #9 (reminders)",
 screen=s, notes=["A standard view of Promotion Milestones due within the window. Used daily and as review step 5.",
 "Promote right from the row (frame 09). Plan maturity shows up front so a blocked promotion is visible early.",
 "Missed milestones stay listed as RED, and their parent goal goes RED by trigger.",
 "Agent reminders are comments, so they're on the record. No separate notification system."],
 tenet="<b>Low friction:</b> each row is a decision with its action next to it, and every row needs one.")

# 15 Priorities
def prow(rank,title,goals,starve,pin=""):
    return f'<div class="card" style="padding:7px 10px;margin-bottom:6px"><div class="row"><b style="font-size:16px;width:24px">{rank}</b>⋮⋮ <b>{title}</b>{pin}<span class="sp"></span><span class="muted">{goals}</span></div><div class="muted" style="margin-left:34px">Starves: {starve}</div></div>'
s=shell(f'''<div class="row"><h2>Priorities · Factory · 2026</h2><span class="muted">owner Tig</span><span class="sp"></span><span class="chip">Company</span><span class="chip on">Factory</span><span class="chip">Product</span></div>
<div class="grid2" style="grid-template-columns:1.25fr 1fr;margin-top:10px"><div>
{prow(1,"Self-serve end to end","4 goals · 61% of linked work",f"human review queue tooling {P(1)}")}
{prow(2,"Canon quality bar","3 goals · 27%","new vehicle makes")}
{prow(3,"Unit cost per job","1 goal · 9%","industrial formats")}
<div class="cut"><span>CUT LINE: below is knowingly starved {P(2)}</span></div>
{prow(4,"Industrial (EPLAN, PLC)","1 goal · 3%","—")}
{prow(5,"KiCad export",f'0 goals <span class="lint">no goals for a full cycle</span>',"—")}
</div><div>
<div class="card warn"><h4>Re-rank (in a review) {P(3)}</h4><div class="muted">Drag "Unit cost per job" above "Canon quality bar"</div><div class="f" style="margin-top:6px"><label>Reason (required)</label><div class="in">Pricing needs unit cost before Q1.</div></div><div class="row"><span class="muted">Ranks stay unique; there are no ties. {P(4)}</span><span class="sp"></span><span class="btn pri">Save rank</span></div></div>
<div class="card"><h4>Starvation check</h4><div style="font-size:11.5px">Rank 1 <div class="bar"><b style="width:61%"></b></div>Rank 2 <div class="bar"><b style="width:27%"></b></div>Rank 3 <div class="bar"><b style="width:9%"></b></div>Below cut <div class="bar"><b style="width:3%"></b></div></div><div class="muted">Concentrated at the top. No peanut butter. {P(5)}</div></div>
<div class="card"><span class="btn ghost">Retire entry…</span> <span class="btn ghost">+ Add priority</span></div></div></div>''', active="prio", url="goalie.excaliwire.com/views/priorities/factory")
add(title="Priorities: ranked list, cut line, re-rank", src="SPEC §6.3 (ranked, unique ranks, cut line, lints), §3.13, §8.3 starvation; USERS_MANUAL App. A \"Re-rank priorities\"; Epic 10 #11",
 screen=s, notes=["Each entry says what it starves, with its mapped goals and share of linked work.",
 "The cut line is explicit. More than 4 entries above it raises a lint.",
 "Re-ranking is drag plus a required reason. By norm it happens in a review, so outside one it shows a soft warning.",
 "No ties, by construction: dragging only reorders.",
 "Starvation bars come from linked goals and work items (SPEC §8.3)."],
 tenet="<b>Low friction:</b> reorder by dragging instead of typing rank numbers. The starvation report sits beside the list, so you don't open a separate report.",
 q="Is re-ranking outside a scheduled review blocked, warned, or allowed? It's a norm, so it probably shouldn't be blocked.")

# 16 Hygiene
s=shell(f'''<div class="row"><h2>Hygiene · 5 open {P(1)}</h2><span class="chip on">All</span><span class="chip">Invariant breaks</span><span class="chip">Lints</span><span class="chip">Mine</span><span class="sp"></span></div>
<table class="g" style="margin-top:8px"><tr><th>Record</th><th>Problem</th><th>Kind</th><th>Open since</th><th>Fix</th></tr>
<tr><td><span class="id">GOAL-55</span> Q4 web refresh</td><td>Ambition date with no Promotion Milestone (created via API)</td><td><b>Invariant</b> {P(2)}</td><td>2 d</td><td><span class="chip">Draft waiting</span> <span class="btn">Review</span></td></tr>
<tr><td><span class="id">GOAL-40</span> Reduce canon review time</td><td>PTG missing RED trigger</td><td>Lint</td><td>1 review cycle <span class="lint">overdue</span></td><td><span class="btn">Open</span></td></tr>
<tr><td><span class="id">GOAL-61</span> Marketing improvements</td><td>Summary has no verb</td><td>Lint {P(3)}</td><td>5 d</td><td><span class="btn">Open</span></td></tr>
<tr><td><span class="id">GOAL-12</span> Launch self-serve runs</td><td>Health unchanged 21 days while RED</td><td>Stale health</td><td>6 d</td><td><span class="btn">Open</span></td></tr>
<tr><td>PRI-5 KiCad export</td><td>No goals mapped for a full cycle</td><td>Lint</td><td>30 d</td><td><span class="btn">Retire…</span></td></tr></table>
<div class="card draft" style="margin-top:10px">hygiene-agent fixed 3 safe items this week (e.g. normalized a work-product URL). Each fix is an Event. {P(4)}</div>''', active="hyg", url="goalie.excaliwire.com/views/hygiene")
add(title="Hygiene view", src="SPEC §8.1 (invalid records stay visible; lints flagged not blocked), §8.3 hygiene; USERS_MANUAL §4; Epic 8 #9 (hygiene agent)",
 screen=s, notes=["Every rule break and lint, never hidden. Each row is a link to fix it.",
 "Invariant breaks can only come in through paths that bypass validation, such as imports. Each gets a Draft fix for the owner.",
 "Lints are norms. They're flagged here and never block a save.",
 "Safe fixes are applied by the agent and recorded as Events, so a person has nothing to do."],
 tenet="<b>Remove steps:</b> the agent fixes what's safe, so the human queue holds only real judgment calls.")
