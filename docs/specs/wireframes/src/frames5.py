from frames4 import *

# 17 Review page + pre-read
s=shell(f'''<div class="row"><h2>Programs review (bi-weekly) · Oct 20</h2><span class="sp"></span><span class="btn pri">▶ Start review {P(1)}</span></div>
<div class="grid2" style="grid-template-columns:260px 1fr;margin-top:10px">
<div class="card"><h4>Review page {P(2)}</h4><div class="kv" style="grid-template-columns:80px 1fr"><div>Owner</div><div>Tig</div><div>Cadence</div><div>Bi-weekly, Tue</div><div>Participants</div><div>Owners of goals in scope</div><div>View</div><div><u>Factory + Product, not GREEN</u></div><div>Agenda</div><div>Default (§6)</div><div>Outputs</div><div>Action items, re-ranks, promotions, PTGs sent back</div></div><span class="btn ghost" style="margin-top:6px">Edit page</span></div>
<div class="card draft"><div class="row"><h4>Pre-read · drafted by review-agent (op. Tig) · Oct 19 18:00 {P(3)}</h4></div>
<div class="grid2"><div><b>RED / YELLOW (2)</b><br>{H("RED")} GOAL-12 Launch self-serve runs: milestone missed<br>{H("YELLOW")} GOAL-40 Review time: PTG step 2 slipping</div>
<div><b>Slips (1)</b><br>GOAL-40 Dec 4 → Dec 18 (+14 d)</div>
<div><b>Promotions</b><br>Due: GOAL-33 (Oct 30) · Missed since last: GOAL-19</div>
<div><b>Status theater (1)</b> {P(4)}<br>GOAL-12 GREEN → RED in one step</div>
<div style="grid-column:span 2"><b>Starvation</b><br>Factory: 61% at rank 1 · KiCad export (rank 5) has no goals → retire?</div></div>
<div class="row" style="margin-top:6px"><span class="muted">Built from the event log. Every line links to its record.</span><span class="sp"></span><span class="btn">Approve &amp; send pre-read</span></div></div></div>''', active="rev", url="goalie.excaliwire.com/reviews/programs/2026-10-20")
add(title="Prepare a review: review page and agent pre-read", src="Epic 10 #11 (review calendar, review pages, pre-reads); USERS_MANUAL §5, §7, App. B; SPEC §9, §10 (review prep)",
 screen=s, notes=["Each review has a page and a calendar slot. Start review opens review mode (frame 18).",
 "The review page follows the App. B template, and local agenda changes are recorded on it.",
 "The agent drafts the pre-read: RED/YELLOW, slips, promotions due and missed, status theater, starvation. A human approves it.",
 "Status theater gets its own line, since it's the most important diagnostic of the quarter."],
 tenet="<b>Remove steps:</b> nobody assembles a status deck. The pre-read is generated from the log, and the review owner only approves it.",
 q="Who receives the pre-read and how (in-app only, or email via the M365 tenant)? The spec says pre-reads \"go out\" but names no channel.")

# 18 Review mode
s=shell(f'''<div class="row"><h2>▶ Programs review · live</h2><span class="chip">2 of 4</span><span class="sp"></span>{av("TK")}{av("Pa")} <span class="muted">in review {P(1)}</span><span class="btn">End review</span></div>
<div class="grid2" style="grid-template-columns:200px 1fr;margin-top:8px">
<div class="card" style="font-size:11.5px;line-height:1.9">{H("RED")} GOAL-12 ✓<br><b>▸ {H("YELLOW")} GOAL-40</b><br>{H("GREEN")} GOAL-47 <span class="muted">skip</span><br>Promotions due (1)<br>Priorities check<br><span class="muted">GREEN skipped unless raised {P(2)}</span></div>
<div><div class="card"><div class="row"><span class="id">GOAL-40</span><b>Reduce canon review time to 10 min</b><span class="sp"></span>{H("YELLOW")}</div>
<div class="kv" style="margin-top:6px"><div>Owner</div><div>Tig</div><div>Date</div><div>Dec 18 {DT("Committed")} <span class="muted">(orig. Dec 4)</span></div><div>PTG</div><div>2 steps · criteria ✓ · RED trigger <b>missing</b></div><div>Plan</div><div>Pencil (pinned v4)</div></div>
<div class="row" style="margin-top:8px"><span class="chip">By when?</span><span class="chip">Committed, ambition, or fantasy?</span><span class="chip">Watercolor, crayon, or pencil?</span> {P(3)}</div></div>
<div class="card"><h4>Decisions {P(4)}</h4><div class="row"><span class="btn">Send PTG back</span><span class="btn">Promote…</span><span class="btn">Set health…</span><span class="btn">Re-rank…</span></div>
<div class="muted" style="margin-top:4px">✓ PTG sent back to Tig: "add RED trigger" (Event #18,233)</div></div>
<div class="card warn"><h4>Action item {P(5)}</h4><div class="grid3"><div class="in">Add RED trigger to PTG</div><div class="in">Owner: Tig</div><div class="in err">Date required</div></div></div>
<div class="row"><span class="btn">◀ Prev</span><span class="sp"></span><span class="btn pri">Next: GOAL-47 ▶</span></div></div></div>''', active="rev", url="goalie.excaliwire.com/reviews/programs/2026-10-20/live", presence=f' {av("Pa")}')
add(title="Run the review: walk the view line by line", src="Epic 10 #11 (review mode, decisions and action items as Events); USERS_MANUAL §6; SPEC §9; Epic 7 #8 done-when (run default review end to end in the app)",
 screen=s, notes=["Shared live session. Everyone in the review sees the same cursor and the same changes within 1 s.",
 "Order follows the default format: RED and YELLOW first, GREEN skipped unless raised, then promotions due, then priorities.",
 "The habitual questions sit on screen as prompts, not as fields.",
 "Decisions are taken in place and each is an Event. The review leaves its trail on the goals.",
 "An action item can't be saved without an owner and a date (or a date for a date). <i>Enforcing this is assumed; the repo calls it a norm.</i>"],
 tenet="<b>Low friction:</b> the review is the tool, not a meeting about the tool. No minutes, because every outcome is already an Event.",
 q="Is an action item a work item, a goal, or a new record? The spec and #11 call action items Events but define no entity; this affects the data model.")

# 19 Scorecard / health
s=shell(f'''<div class="row"><h2>Scorecard &amp; GOALIE health · 2026</h2><span class="chip on">Org: Excaliwire</span><span class="chip">Q3</span><span class="chip on">Q4</span><span class="sp"></span><span class="btn ghost">Export (CSV/JSON)</span> {P(4)}</div>
<div class="grid4" style="margin-top:10px">
<div class="card"><div class="muted">Committed met on time {P(1)}</div><div style="font-size:22px;font-weight:800">71%</div><div class="muted">target ‹80%› · vs original dates</div></div>
<div class="card"><div class="muted">Slips this quarter</div><div style="font-size:22px;font-weight:800">4 · avg 11 d</div><div class="muted">trend ↓</div></div>
<div class="card"><div class="muted">Promotion milestones met</div><div style="font-size:22px;font-weight:800">6 / 8</div></div>
<div class="card"><div class="muted">Status theater</div><div style="font-size:22px;font-weight:800">1</div><div class="muted">target 0 · each investigated</div></div></div>
<div class="grid2"><div class="card"><h4>Date-type mix over time {P(2)}</h4><div style="height:110px;border:1px solid #ccc;background:linear-gradient(to top,#555 0 30%,#aaa 30% 65%,#e3e3e3 65%);"></div><div class="muted">Committed / Ambition / Fantasy share by week</div></div>
<div class="card"><h4>Period-end scorecard {P(3)}</h4><table class="g"><tr><th>Unit</th><th>On time</th><th>Late</th><th>Not met</th><th>No prior commit</th></tr><tr><td>Factory</td><td>3</td><td>1</td><td>1</td><td>0</td></tr><tr><td>Product</td><td>2</td><td>0</td><td>0</td><td>1</td></tr><tr><td>Operations</td><td>2</td><td>1</td><td>0</td><td>0</td></tr></table></div></div>''', active="score", url="goalie.excaliwire.com/views/scorecard")
add(title="Scorecard and GOALIE health (fitness functions)", src="Epic 9 #10 (rollups, scorecard, GOALIE health page); SPEC §8.3; USERS_MANUAL §7–8",
 screen=s, notes=["Fitness-function tiles with their USERS_MANUAL §8 targets. The GOALIE owner inspects them each quarter.",
 "Trends over time, all derived from the event log, never typed in.",
 "Period-end scorecard by unit, measured against original committed dates.",
 "Full export: the organization owns its memory (SPEC §13 item 11)."],
 tenet="<b>Customers own their data; get and use data:</b> the numbers come straight from the log, and export is one click.")

# 20 Period reset
s=shell(f'''<div class="row"><h2>Period reset: 2026 → 2027 {P(1)}</h2><span class="muted">GOALIE owner · 9 open goals</span><span class="sp"></span><span class="chip">Step 1 of 2</span></div>
<table class="g" style="margin-top:10px"><tr><th>Goal</th><th>Health</th><th>Close as</th><th>Continue in 2027?</th><th>New date type</th></tr>
<tr><td>GOAL-12 Launch self-serve runs</td><td>{H("RED")}</td><td>Did Not Meet ▾</td><td><span class="chip on">Carryover</span> {P(2)}</td><td>{DT("Ambition")} + milestone</td></tr>
<tr><td>GOAL-40 Reduce canon review time</td><td>{H("YELLOW")}</td><td>Completed Late ▾</td><td>—</td><td>—</td></tr>
<tr><td>GOAL-60 Weekly canon quality report</td><td>{H("GREEN")}</td><td>Completed ▾</td><td><span class="chip on">Repeating</span></td><td>{DT("Committed")}</td></tr>
<tr><td>GOAL-23 Ship EPLAN export pack</td><td>Backlog</td><td>Deleted ▾</td><td><span class="chip">Carryover</span></td><td>{DT("Fantasy")} + milestone</td></tr></table>
<div class="f" style="margin-top:8px"><label>Reason per close (pre-filled from health; edit any) {P(3)}</label><div class="in">GOAL-12: "milestone missed Nov 15; carried over with honest Ambition date"</div></div>
<div class="row"><span class="muted">Step 2: set up the 2027 priority lists (copy 2026 list as a draft to re-rank). {P(4)}</span><span class="sp"></span><span class="btn pri">Close 9 goals &amp; create 2 new</span></div>''', active=None, url="goalie.excaliwire.com/admin/period-reset")
add(title="Period reset", src="SPEC §7.3, §3.12; USERS_MANUAL App. A \"Period reset\", §5 (year end)",
 screen=s, notes=["One bulk screen for the year-end close-out, owned by the GOALIE owner.",
 "Continuing work becomes a new goal marked Carryover or Repeating. Nothing carries forward silently.",
 "Each close still has its own reason. Pre-filling one from the goal's state saves typing but stays editable. <i>The pre-fill is assumed.</i>",
 "New priority lists start from last period's as a draft to re-rank."],
 tenet="<b>Remove steps:</b> one bulk pass instead of 9 separate close dialogs, without dropping the one-reason-per-change rule.",
 q="Do pre-filled reasons satisfy \"a written reason\", or must each be typed by a human to avoid reason theater?")
