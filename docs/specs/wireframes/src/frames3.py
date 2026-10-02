from frames2 import *

# 08 Record a slip
s=shell(f'''{goal_head(health="YELLOW", date=f'Dec 4 {DT("Committed")}').replace("Launch self-serve factory runs","Reduce canon review time to 10 min").replace("GOAL-12","GOAL-40")}
<div class="modal" style="width:620px;margin-top:12px"><h2>Record a slip</h2>
<div class="grid2"><div class="f"><label>Original committed date {P(1)}</label><div class="in lock">🔒 Dec 4, 2026 · set when committed Sep 30</div></div>
<div class="f"><label>Changed due date</label><div class="in">Dec 18, 2026 <span class="muted">(+14 days)</span></div></div></div>
<div class="f"><label>Reason (required)</label><div class="in ta">Batch reviewer UI slipped; vendor OCR fix lands Nov 20.</div></div>
<div class="row"><span>Health</span><span class="chip">YELLOW</span><span class="chip on">RED</span><span class="muted">· PTG required {P(2)}</span></div>
<div class="card" style="margin-top:8px"><span class="muted">PTG editor (as in frame 06) opens here, pre-filled with the current PTG.</span></div>
<div class="row"><span class="muted">"Demote to Ambition" is not offered. A Committed date can't be demoted. {P(3)}</span><span class="sp"></span><span class="btn pri">Record slip</span></div></div>''', url="goalie.excaliwire.com/goals/GOAL-40/slip")
add(title="Record a slip", src="USERS_MANUAL App. A \"Record a slip\"; SPEC §5, §6.1 (original_committed_date, changed_due_date), rules 5–7",
 screen=s, notes=["The Original Committed Date is locked and shown. Scorecards measure lateness against it.",
 "A slip goes with health and a PTG in the same save, so the record is never half-updated.",
 "There's no way to demote a Committed date. A slip is the only path."],
 tenet="<b>Remove steps:</b> slip, health, and PTG happen in one dialog and one write, instead of three edits with three reasons.",
 q="Should a slip, health change, and PTG save as one Event or one Event per field? Rule 10 says one write at a time per structured field.")

# 09 Promote
s=shell(f'''{goal_head(health="GREEN").replace("GOAL-12","GOAL-31").replace("Launch self-serve factory runs","Retire GitHub Issues for company tickets")}
<div class="modal" style="width:680px;margin-top:12px"><h2>Promote date: Ambition → Committed {P(1)}</h2>
<div class="sub">Promotion Milestone GOAL-33 "Commit GOALIE cutover date" is due Oct 30, in 12 days.</div>
<div class="card warn" style="margin-top:8px"><b>Plan maturity check {P(2)}</b><div class="row" style="margin-top:4px"><span class="chip">Watercolor</span><span class="chip on">Crayon</span><span class="chip">Pencil</span><span class="sp"></span><span class="btn">Open plan</span></div>
<div class="muted">A Committed date needs a Pencil plan. Push back on the plan, not the date.</div></div>
<div class="grid2"><div class="f"><label>Ambition date</label><div class="in lock">Jan 29, 2027</div></div><div class="f"><label>Committed date {P(3)}</label><div class="in">Feb 12, 2027 <span class="muted">(+14 d vs ambition)</span></div></div></div>
<div class="f"><label>Reason</label><div class="in">Work-item import scoped; 2-week buffer for pilot data load.</div></div>
<div class="card"><b>On promote, GOALIE will:</b> record Feb 12 as Original Committed Date · pin plan v7 as committed_plan_version · complete GOAL-33 · unlink it {P(4)}</div>
<div class="row"><span class="sp"></span><span class="btn">Cancel</span><span class="btn dis">Commit Feb 12 (needs Pencil)</span></div>
<hr><div class="muted"><b>Variant: Fantasy → Ambition.</b> Same dialog; instead of the Pencil check it asks for the <i>next</i> Promotion Milestone (Ambition → Committed), pre-filled. {P(5)}</div></div>''', url="goalie.excaliwire.com/goals/GOAL-31/promote")
add(title="Promote a date (commit)", src="USERS_MANUAL App. A \"Promote a date\"; SPEC §5, §6.1 (committed_plan_version), §7.1; Epic 6 #7 (pin on promote)",
 screen=s, notes=["Launched from the goal, from Promotions due, or in review mode.",
 "Hard gate: Committed needs Pencil. The button says why it's disabled and links straight to the plan.",
 "The promoted date can differ from the ambition date. The difference is shown and recorded.",
 "Everything the system does on promote is spelled out before you confirm.",
 "Fantasy → Ambition attaches the next milestone in the same step."],
 tenet="<b>Low cognitive load:</b> one dialog shows the rule, the gap, and the consequence. Nobody needs the manual open.")

# 10 Draft approve
s=shell(f'''{goal_head(health="YELLOW", date=f'Dec 18 {DT("Committed")}').replace("GOAL-12","GOAL-40").replace("Launch self-serve factory runs","Reduce canon review time to 10 min")}
<div class="card draft" style="margin-top:10px"><div class="row"><h4>Draft by {av("Dr",True)} drafting-agent · operator Tig · based on v9 {P(1)}</h4><span class="sp"></span><span class="muted">created 08:12 MT</span></div>
<table class="g"><tr><th>Field</th><th>Current (v9)</th><th>Proposed</th></tr>
<tr><td>Health</td><td>{H("YELLOW")}</td><td>{H("RED")}</td></tr>
<tr><td>PTG step 2</td><td>Measure 20 jobs · Nov 20</td><td>Measure 20 jobs · <b>Dec 2</b></td></tr></table>
<div style="margin-top:6px"><b>Agent's reason {P(2)}:</b> PR factory#1602 (batch UI) still open, 3 review rounds; median review time last 10 jobs is 23 min (dashboard link).</div>
<div class="f" style="margin-top:8px"><label>Your reason (required) {P(3)}</label><div class="in">Agree: the trigger fired.</div></div>
<div class="row"><span class="btn">Reject</span><span class="btn">Edit, then approve</span><span class="sp"></span><span class="btn pri">Approve</span></div></div>
<div class="card warn"><b>If GOAL-40 changed after v9</b> {P(4)}: "Approval rejected: this Draft was written against v9; the goal is now v10." Shows v10. You decide again from that state.</div>''', url="goalie.excaliwire.com/goals/GOAL-40#draft-88")
add(title="Approve or reject an agent Draft", src="USERS_MANUAL App. A \"Approve or reject a Draft\"; SPEC §6.9, §10, rule 12; Epic 8 #9",
 screen=s, notes=["The Draft shows the agent, its human operator, and the base version. It's visible to everyone the moment it's created.",
 "The agent's evidence is links to Work Product and metrics, not just text.",
 "Approve and reject are both Events with your name and reason.",
 "Approval is a write against base_version. If the goal has moved on, it's rejected and you see the current state."],
 tenet="<b>Low friction:</b> approve in place from the goal or from My goals. \"Edit, then approve\" avoids the reject-and-redraft loop.",
 q="Is \"Edit, then approve\" allowed (does it become a human write rather than an approval)? The spec only names approve or reject.")

# 11 Plan doc
s=shell(f'''<div class="muted" style="font-size:11px">Docs › Plan · linked to <u>GOAL-31</u> · Plan maturity <span class="chip on">Crayon</span> {P(1)}</div>
<div class="row"><h2>Retire GitHub Issues: plan (5Ps)</h2><span class="sp"></span>{av("TK")}{av("Pa")}{av("Dr",True)} <span class="muted">editing now {P(2)}</span><span class="btn">History</span></div>
<div class="grid2" style="grid-template-columns:1fr 220px;margin-top:8px"><div class="md"># Purpose
One place for goals and the work under them.

# Principles
- Self-serve import; no re-typing<span class="caret"><em>Tig</em></span>
- GitHub stays Work Product, not the tracker

# Priorities
1. Import open factory tickets
2. Agents pick up work items over MCP<span class="caret"><em>Pat</em></span>

# People
Tig (owner), drafting-agent

# Plan
| Step | Owner | Date |
|---|---|---|
| Import dry run | Tig | Nov 6 |</div>
<div><div class="card"><h4>Versions {P(3)}</h4><div style="font-size:11.5px;line-height:1.7">v12 · now (live)<br>v11 · Tig · Oct 1<br>v7 · <b>📌 pinned at commit</b><br>v1 · from 5Ps template</div></div>
<div class="card"><h4>Maturity</h4><div class="muted">Watercolor → Crayon → <b>Pencil</b><br>Needed to commit GOAL-31.</div> {P(4)}</div></div></div>''', url="goalie.excaliwire.com/docs/plan-31", presence=f' {av("Pa")}{av("Dr",True)}')
add(title="Write the linked plan (collaborative Doc)", src="SPEC §6.5 (Doc is a page; concurrent edit; versions), §1.2; Epic 6 #7; ADR 0008 (Yjs CRDT)",
 screen=s, notes=["The plan is a hosted Markdown Doc linked to its goal, and its maturity is set here.",
 "Several actors can type at once with live carets. Nothing is lost. No Save button: each accepted update is a version Event.",
 "Version history. The version pinned at commit can always be opened as it stood.",
 "Plan maturity is the gate for committing (frame 09)."],
 tenet="<b>Remove steps:</b> no save, no check-out, no \"someone else is editing\" lock. Starting from the 5Ps template saves the blank-page step.",
 q="Is plan_maturity set by the owner on the goal, or on the Doc? SPEC puts it on the goal; the editor needs to show it in both places.")

# 12 History
s=shell(f'''{goal_head()}
<div class="tabs"><span>Comments</span><span class="on">History (41)</span><span>Work items</span></div>
<div class="row" style="margin-bottom:8px"><span class="chip on">All</span><span class="chip">Dates</span><span class="chip">Health</span><span class="chip">Drafts</span><span class="chip">Comments</span><span class="chip">Agents only</span><span class="sp"></span><span class="chip">Period 2026 ▾</span> {P(1)}</div>
<div class="ev"><span class="who">hygiene-agent</span> <span class="muted">(agent · op. Tig) · Nov 16 00:00 · #18,190</span><br>Health GREEN → <b>RED</b> · <span class="reason">"GOAL-19 committed date Nov 15 passed unmet"</span> <span class="lint">status theater flagged</span> {P(2)}</div>
<div class="ev"><span class="who">Tig</span> <span class="muted">· Oct 30 · #17,544</span><br>Comment: "Vendor quote came back."</div>
<div class="ev"><span class="who">Tig</span> <span class="muted">· Oct 2 · #16,902</span><br>Approved Draft #71 (drafting-agent) · <span class="reason">"milestone date fine"</span> {P(3)}</div>
<div class="ev"><span class="who">drafting-agent</span> <span class="muted">· Oct 2 · #16,880</span><br>Draft #71: create Promotion Milestone GOAL-19</div>
<div class="ev"><span class="who">Tig</span> <span class="muted">· Oct 2 · #16,877</span><br>Created · date type <b>Ambition</b> · due Mar 31 · <span class="reason">"initial"</span></div>
<div class="muted" style="margin-top:6px">Old → new value and the reason on every row. Deleted goals keep their history. {P(4)}</div>''', url="goalie.excaliwire.com/goals/GOAL-12/history")
add(title="Read a goal's history", src="SPEC §6.6 (Events readable on the record; follow a goal across the period), §8.1 (status-theater flag); USERS_MANUAL App. A step 6; issue #31",
 screen=s, notes=["Filter by kind, by agent, or by period. Follow one goal across the whole plan period.",
 "Trigger-driven changes and status-theater flags show in the same trail.",
 "Draft creation and approval are separate Events with separate actors.",
 "History is on the record itself. Export isn't the only way to audit it."],
 tenet="<b>Get and use data:</b> the trail is the organization's memory. It's one tab away, and never a separate audit tool.")

# 13 Close goal
s=shell(f'''{goal_head(health="GREEN").replace("GOAL-12","GOAL-47").replace("Launch self-serve factory runs","Pass quality bar on instrument cluster")}
<div class="modal" style="width:640px;margin-top:12px"><h2>Close goal</h2>
<div class="row" style="margin:6px 0"><span class="chip on">Completed</span><span class="chip">Completed Late</span><span class="chip">Did Not Meet</span><span class="chip">Deleted</span> {P(1)}</div>
<div class="kv"><div>Original committed</div><div>Nov 30 · 🔒</div><div>Closing on</div><div>Nov 24 → <b>on time</b> (computed) {P(2)}</div></div>
<div class="f" style="margin-top:8px"><label>Reason</label><div class="in">Quality bar met on 3 consecutive runs; see dashboard.</div></div>
<div class="card warn"><b>If the date is still Ambition</b> {P(3)}: "Promote to Committed and complete in one step?" It's counted as <i>completed without a prior commitment</i>.</div>
<div class="row"><span class="sp"></span><span class="btn">Cancel</span><span class="btn pri">Close as Completed</span></div></div>''', url="goalie.excaliwire.com/goals/GOAL-47/close")
add(title="Close a goal", src="USERS_MANUAL App. A \"Close a goal\"; SPEC §7.2 (state lifecycle, closing rule), §8.1 (Deleted stays findable)",
 screen=s, notes=["Four closing states, each with a reason. Deleted goals stay findable along with their history.",
 "On time or late is computed against the original committed date, so the user doesn't choose it. <i>Assumed: the UI derives Completed vs Completed Late.</i>",
 "The closing rule's one-step promote-and-complete."],
 tenet="<b>Remove steps:</b> lateness is derived, not picked, so there's one less choice to get wrong.",
 q="Should GOALIE derive Completed vs Completed Late automatically, or let the owner pick and lint the mismatch?")
