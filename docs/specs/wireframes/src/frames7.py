from frames6 import *

def phone(inner): return f'<div class="phone"><div class="scr">{inner}</div></div>'
ph_top='<div class="top" style="padding:6px 8px"><span>☰</span><span class="logo">GOALIE</span><span class="sp"></span><span class="av">TK</span></div>'
p1=ph_top+f'''<div style="padding:8px"><div class="row"><b>My goals</b><span class="sp"></span><span class="btn pri">+</span></div>
<div class="card draft" style="padding:6px;font-size:11px">2 Drafts wait for you {P(1)}</div>
<div class="card" style="padding:7px"><div class="row">{H("RED")}<span class="id">GOAL-12</span></div><b>Launch self-serve factory runs</b><div class="muted">Mar 31 {DT("Ambition")} · milestone missed</div></div>
<div class="card" style="padding:7px"><div class="row">{H("YELLOW")}<span class="id">GOAL-40</span></div><b>Reduce canon review time</b><div class="muted">Dec 18 {DT("Committed")} · was Dec 4</div></div>
<div class="card" style="padding:7px"><div class="row">{H("GREEN")}<span class="id">GOAL-31</span></div><b>Retire GitHub Issues</b><div class="muted">Jan 29 {DT("Ambition")}</div></div>
<div class="muted" style="font-size:10px">Table collapses to cards; same saved view {P(2)}</div></div>'''
p2=ph_top+f'''<div style="padding:8px"><span class="id">GOAL-40</span> {H("YELLOW")}<br><b>Reduce canon review time to 10 min</b>
<div class="card draft" style="padding:6px;margin-top:6px;font-size:11px"><b>Draft</b> · drafting-agent<br>Health → RED · step 2 → Dec 2<div class="in" style="margin:4px 0;font-size:11px">Reason…</div><div class="row"><span class="btn">Reject</span><span class="sp"></span><span class="btn pri">Approve</span></div> {P(3)}</div>
<div class="kv" style="grid-template-columns:70px 1fr;font-size:11px"><div>Date</div><div>Dec 18 {DT("Committed")}</div><div>Owner</div><div>Tig</div><div>PTG</div><div>2 steps ›</div><div>Plan</div><div>Pencil ›</div></div>
<div class="in ph" style="margin-top:8px;font-size:11px">Add a comment… {P(4)}</div></div>'''
s=f'<div style="display:flex;gap:40px;justify-content:center;padding:24px;background:#f2f2f2">{phone(p1)}{phone(p2)}</div>'
add(title="Phone width: My goals, approve a Draft, comment", src="ADR 0010 (one web app; same pages usable at phone width; no native app); SPEC §1 (web and mobile); Epic 7 #8 (accessible, phone-sized)",
 screen=s, tag="Mobile web (phone browser)", notes=["The phone is for triage: Drafts waiting, RED and YELLOW first.",
 "The same server-rendered saved view, laid out as cards. No second codebase.",
 "Approve or reject a Draft with a reason in one thumb flow.",
 "Comment and quick field edits work. Long plan editing works but is secondary."],
 tenet="<b>Low friction:</b> no app install and no separate login. It's the same URL in any phone browser.",
 q="What's the mobile scope: triage only (approve, comment, health), or full parity including priority re-rank and plan editing?")

# 26 MCP agent surface
term=f'''<b>Claude Code</b> · connected MCP: goalie (Streamable HTTP · actor: drafting-agent, op. Tig) {P(1)}

<span class="t">› Track GOALIE's Stage 2 as a goal under Factory, ambition Feb 27.</span>

● goalie.create_goal(summary="Ship GOALIE Stage 2", org_unit="factory",
     owner="tig", type="Milestone (Launch)", due_date="2027-02-27",
     date_type="Ambition", base_version=null)
  <b>✗ rejected</b>: invariant <b>promotion-milestone-required</b> (SPEC §5): an Ambition date needs
    a Promotion Milestone with a Committed date. {P(2)}

● goalie.create_goal(… , promotion_milestone={{summary:"Commit Stage 2 date",
     due_date:"2026-11-20", date_type:"Committed", owner:"tig"}})
  ✓ GOAL-70 created (v1) · GOAL-71 milestone (v1) · events #18,301–#18,302

<span class="t">› Our PR #44 slipped. Update health.</span>

● goalie.read_resource("goalie://manual")   <span class="t"># loads rules from the User's Manual</span> {P(3)}
● goalie.create_draft(entity="GOAL-70", base_version=1,
     change={{health:"YELLOW", path_to_green:{{steps:[…], criteria:"…", red_trigger:"…"}}}},
     reason="PR #44 open 9 days; 2 failing checks")
  ✓ Draft #91 created · visible on GOAL-70 · <b>not in effect until Tig approves</b> {P(4)}

● goalie.subscribe(after_sequence=18302)  <span class="t"># same SSE stream the views use</span> {P(5)}
  … #18,319 Tig approved Draft #91 · "agreed"'''
s=f'''<div class="chrome"><i></i><i></i><i></i><div class="url">terminal · agent session</div></div><div class="term">{term}</div>
<div style="padding:10px 14px;background:#fafafa;border-top:1px solid #bbb"><div class="row"><b>Same moment in the app:</b><span class="sp"></span></div>
<div class="card draft" style="margin:6px 0 0">GOAL-70 · <b>Draft</b> by {av("Dr",True)} drafting-agent (op. Tig): health → YELLOW, PTG 3 steps · <span class="btn">Review Draft</span> {P(6)}</div></div>'''
add(title="Agent surface: an agent works GOALIE over MCP", src="Epic 5 #6 (MCP tools for each App. A how-to; Drafts; comments; errors name the rule; manual as resource); ADR 0004, 0005, 0007; SPEC §1.1, §10, §13 items 8, 21–22",
 screen=s, tag="Agent · MCP (CLI/chat)", notes=["The agent signs in as its own actor (Entra app token) with a named human operator.",
 "Errors name the broken rule, so the agent corrects itself without a human.",
 "The User's Manual is the agent's rulebook, loaded as an MCP resource.",
 "Agents propose changes as Drafts, and only a human can make them take effect.",
 "Agents subscribe to the same change stream as the views and resume by sequence.",
 "The Draft appears live on the goal in the app within 1 s (frames 02, 04, 10)."],
 tenet="<b>Autonomous end to end:</b> agents do the bookkeeping, and humans make only the promises. API and MCP come first in build order (#1).",
 q="Which agent actors does Excaliwire register first (drafting, hygiene, review, manual), and who is each one's operator? USERS_MANUAL §3 leaves ‹list agents and operators› blank.")
