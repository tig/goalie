from frames1 import *

def goal_head(extra="", health="RED", date=f'Mar 31 {DT("Ambition")}'):
    return f'''<div class="muted" style="font-size:11px">Factory › <span class="id">GOAL-12</span> · v14</div>
<div class="row"><h2>Launch self-serve factory runs</h2>{H(health)}<span class="sp"></span>{av("Pa")}{av("Hy",True)}{extra}</div>
<div class="sub">Owner Tig · Program or Function · Milestone (Launch) · sev1 · PRI-1 · due {date}</div>'''

GOAL_KV=f'''<div class="kv">
<div>State</div><div>In Progress</div>
<div>Health</div><div>{H("RED")} <span class="muted">set by trigger: GOAL-19 missed</span></div>
<div>Due date</div><div>Mar 31, 2027 {DT("Ambition")}</div>
<div>Promotion milestone</div><div><u>GOAL-19</u> Commit self-serve launch date · Nov 15 {DT("Committed")} {H("RED")}</div>
<div>Plan</div><div><u>Self-serve factory runs (5Ps)</u> · Crayon</div>
<div>Work product</div><div><u>excaliwire/factory</u> · <u>milestone: self-serve</u></div>
<div>Severity</div><div>sev1</div>
<div>Priority</div><div>Factory #1 Self-serve end to end</div>
<div>Parent</div><div><u>GOAL-7</u> Double waitlist conversions</div>
<div>Origination</div><div>New</div>
<div>Visibility</div><div>Organization-wide</div></div>'''

# 04 Goal page
s=shell(f'''{goal_head()}
<div class="card draft" style="margin-top:10px"><div class="row"><b>Draft</b> by {av("Dr",True)} drafting-agent (op. Tig) {P(1)}<span class="sp"></span><span class="btn">Review Draft</span></div><div class="muted">PTG: 3 steps, return-to-GREEN criteria, from 2 linked PRs. Not in effect until you approve.</div></div>
<div class="grid2" style="grid-template-columns:1.1fr 1fr">
<div class="card"><div class="row"><h4>Fields {P(2)}</h4><span class="sp"></span><span class="btn">Edit</span></div>{GOAL_KV}</div>
<div><div class="card"><h4>Description {P(3)}</h4><div class="muted">Key results: a customer uploads, sees a bounded cost, gets canon + app with no human. Metrics: runs/week without human touch, reviewed weekly…</div><span class="lint">lint: (d) who shares responsibility is missing</span></div>
<div class="card"><div class="tabs" style="margin-top:0"><span class="on">Comments (3)</span><span>History (41)</span><span>Work items (6)</span></div>
<div class="ev"><span class="who">Tig</span> · 2h · <span>Vendor quote came back; see plan §3.</span></div>
<div class="ev"><span class="who">hygiene-agent</span> · 1d · <span>GOAL-19 passed Nov 15 unmet → RED.</span></div>
<div class="in ph">Add a comment… {P(4)}</div></div></div></div>''', presence=f' {av("Pa")}{av("Hy",True)}', url="goalie.excaliwire.com/goals/GOAL-12")
add(title="Open a goal and read it", src="SPEC §1.2, §6.1 (fields), §6.6 (comments), §6.9 (Draft); USERS_MANUAL App. A \"Work between reviews\"; Epic 7 #8",
 screen=s, notes=["A pending Draft shows live on the goal, clearly marked as not in effect.",
 "All SPEC §6.1 fields. A trigger-set value says why. Plan and Work Product are one click.",
 "Description is collaborative Markdown. Lints show inline and never block.",
 "Comments are flat: there's no Reply button in v1, by rule. A comment is an Event."],
 tenet="<b>Low friction:</b> no separate read and edit pages. Edit opens in place (frame 06), and the reason a value changed sits next to the value.")

# 05 Create goal
s=shell(f'''<div class="modal" style="width:720px">
<div class="row"><h2>New goal</h2><span class="sp"></span><span class="muted">Org unit: Factory (from the view you were in) {P(1)}</span></div>
<div class="f"><label>Summary (short, with a verb)</label><div class="in">Launch self-serve factory runs</div></div>
<div class="grid4"><div class="f"><label>Owner (human)</label><div class="in">Tig ▾</div></div><div class="f"><label>Type</label><div class="in">Milestone (Launch) ▾</div></div><div class="f"><label>Severity</label><div class="in">sev1 ▾</div></div><div class="f"><label>Priority</label><div class="in">Factory #1 ▾</div></div></div>
<div class="grid3"><div class="f"><label>Due date</label><div class="in">Mar 31, 2027</div></div><div class="f"><label>Date type {P(2)}</label><div class="row"><span class="chip">Committed</span><span class="chip on">Ambition</span><span class="chip">Fantasy</span></div></div><div class="f"><label>State</label><div class="in">In Progress ▾</div></div></div>
<div class="card draft"><div class="row"><b>Promotion Milestone required for an Ambition date</b> {P(3)}<span class="sp"></span><span class="muted">pre-filled</span></div>
<div class="grid3"><div class="f"><label>Summary</label><div class="in">Commit self-serve launch date</div></div><div class="f"><label>Committed date</label><div class="in">Nov 15, 2026</div></div><div class="f"><label>Owner</label><div class="in">Tig</div></div></div></div>
<div class="grid2"><div class="f"><label>Plan (optional now)</label><div class="in ph">Start from 5Ps template · or paste a link {P(4)}</div></div><div class="f"><label>Description</label><div class="in ph">Key results · metrics · why it matters · who shares it</div></div></div>
<div class="row"><span class="muted">Committed would require a Pencil plan; this stays editable later. {P(5)}</span><span class="sp"></span><span class="btn">Cancel</span><span class="btn pri">Create GOAL-12</span></div></div>''', url="goalie.excaliwire.com/goals/new")
add(title="Create a goal", src="USERS_MANUAL App. A \"Create a goal\"; SPEC §5 promotion rule, §6.1; Epic 7 #8 (\"goal editing shows the rules as you go\"); Epic 8 #9 (draft Promotion Milestone)",
 screen=s, notes=["One form, not a wizard. Org unit and owner default from context (the current view, you).",
 "Date type is a required, honest choice. There's no default, so nobody commits a date by accident.",
 "Choosing Ambition or Fantasy expands the Promotion Milestone in place, pre-filled. Saving creates both goals in one transaction. Choosing Committed instead asks for a Pencil plan.",
 "The 5Ps template is one click (#7). External links are allowed.",
 "Rules are checked as you type, and the server re-checks on commit. Create stays disabled while a hard rule is unmet."],
 tenet="<b>Remove steps before adding features:</b> the manual's 6 steps fit on one screen. The milestone is filled inline, not by a Draft round trip afterwards (the agent Draft in #9 stays the fallback for API-created goals).",
 q="Should the UI pre-fill the milestone itself, or always leave it to the drafting agent's Draft per #9? Pre-filling removes an approval step.")

# 06 Report trouble
s=shell(f'''{goal_head(health="GREEN", date=f'Dec 4 {DT("Committed")}').replace("Launch self-serve factory runs","Reduce canon review time to 10 min").replace("GOAL-12","GOAL-40")}
<div class="card warn" style="margin-top:10px"><div class="row"><h4>Health</h4><span class="chip">GREEN</span><span class="chip on">YELLOW</span><span class="chip">RED</span> {P(1)}</div>
<b>Path to Green (required for YELLOW)</b> {P(2)}
<table class="g" style="margin:6px 0"><tr><th>#</th><th>Step</th><th>Owner (human)</th><th>Date</th></tr>
<tr><td>1</td><td>Batch reviewer UI ships behind flag</td><td>Tig</td><td>Nov 6</td></tr>
<tr><td>2</td><td>Measure 20 jobs, publish median</td><td>Tig</td><td>Nov 20</td></tr>
<tr><td></td><td class="muted">+ Add step</td><td></td><td></td></tr></table>
<div class="grid2"><div class="f"><label>Criteria for returning to GREEN (testable)</label><div class="in">Median review time ≤ 10 min over 20 consecutive jobs</div></div>
<div class="f"><label>Trigger that turns it RED {P(3)}</label><div class="in err">Required for YELLOW</div></div></div>
<div class="f"><label>Reason for the change {P(4)}</label><div class="in">Batch UI slipped 2 weeks; still a credible path to Dec 4.</div></div>
<div class="row"><span class="muted">Saving as v9 (you read v9) {P(5)}</span><span class="sp"></span><span class="btn">Cancel</span><span class="btn dis">Save</span></div></div>''', url="goalie.excaliwire.com/goals/GOAL-40/edit")
add(title="Report trouble: set YELLOW and write the PTG", src="USERS_MANUAL App. A \"Report trouble\"; SPEC §6.1 health + path_to_green; rule 8; Epic 7 #8",
 screen=s, notes=["Health is edited in place on the goal page.",
 "Choosing YELLOW or RED opens the structured PTG: steps with a human owner and a date each, plus criteria.",
 "The UI won't save until each required part is there. For YELLOW that includes the trigger to RED.",
 "Every state or date change needs a written reason, and it's stored on the Event.",
 "The save names the version it read, so a stale save is rejected (frame 07)."],
 tenet="<b>Make the right behavior the default:</b> a structured PTG instead of free text means review readers never chase missing owners or dates.",
 q="SPEC §8.1 says a violating save is either rejected <i>or</i> opens a Draft for the owner. For human edits in the UI, is it always reject-inline?")

# 07 Stale write
s=shell(f'''<div class="dim" style="padding:20px">
<div class="modal" style="width:640px"><h2>This goal changed while you were editing {P(1)}</h2>
<div class="sub">You read v9. Pat saved v10 four seconds ago. Your change was not saved.</div>
<table class="g" style="margin:10px 0"><tr><th>Field</th><th>v9 (what you read)</th><th>v10 (current)</th><th>Your edit</th></tr>
<tr><td>Health</td><td>{H("GREEN")}</td><td>{H("RED")}</td><td>{H("YELLOW")}</td></tr>
<tr><td>Changed due date</td><td>—</td><td>Dec 18 · "vendor slip"</td><td>—</td></tr>
<tr><td>PTG</td><td>—</td><td>Pat's 2 steps</td><td>Your 2 steps</td></tr></table>
<div class="card"><b>Description edits were merged</b>: Markdown never conflicts {P(2)}</div>
<div class="row"><span class="btn">Discard mine</span><span class="sp"></span><span class="btn pri">Re-apply my edit on v10 {P(3)}</span></div>
<div class="muted" style="margin-top:8px">Re-apply re-opens the editor on v10 with your values pre-filled; you confirm and give the reason again. {P(4)}</div></div></div>''', url="goalie.excaliwire.com/goals/GOAL-40/edit")
add(title="Two people, one goal: stale write rejected", src="SPEC §1.2 (two actors, one goal), §6 (versions; stale write rejected, current state returned), rule 10–11; ADR 0003, 0008",
 screen=s, notes=["Structured fields are never auto-merged. A stale save is rejected and the current state comes back.",
 "Markdown (description, plan) is a Yjs CRDT, so neither person's text is lost.",
 "One click to carry your intent onto the current version. It's still a new write, with one actor and one reason.",
 "No work disappears without an Event: the rejected attempt isn't saved, but your draft values are kept in the editor."],
 tenet="<b>Design for failure:</b> say plainly what happened and why, and make recovery one click. A conflict the user can't understand is a defect.")
