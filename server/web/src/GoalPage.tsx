import { useCallback, useState, type CSSProperties } from "react";
import type { ApiActor, ApiEvent, ApiWorkItem, GoalEventsResponse, GoalPageResponse, Health, PathToGreen, SubGoalCard } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import { getJson, postCommands, useJson } from "./data.ts";
import { AddSubGoal, AddWorkItem, useTick } from "./GoalAdd.tsx";
import { Crumbs, Props } from "./GoalSide.tsx";
import { ClosePanel, DescriptionPanel, HealthPanel, PromotePanel, PursuePanel, SlipPanel, type Done, type PanelName } from "./GoalPanels.tsx";
import { commentBatch } from "./model/commands.ts";
import { activity, ACTIVITY, changeParts, createdFields, ptgChanges, historyNames, joinPages, dateBar, labelRows, eventValue, fieldLabel, groupEvents, groupWorkItems, type ActivityChip, type EventGroup, type Names } from "./model/goalpage.ts";
import { dateLabel } from "./model/labels.ts";
import { backPath, goalPath } from "./model/route.ts";
import { Avatar, HealthDot } from "./parts.tsx";
import { homeSearch, Link } from "./router.tsx";

/**
 * The goal page (docs/design/goal-page-and-create.md, G1 to G24). It reads GET /api/goals/:id.
 * This part draws the goal. The panels that change it come next, each as one batch to POST /api/commands.
 */
export function GoalPage({ goalKey, viewName }: { goalKey: string; viewName: string }) {
  const [loaded, reload] = useJson<GoalPageResponse>(`/api/goals/${encodeURIComponent(goalKey)}`);
  // G26: the saved line lives above the keyed Goal, which remounts after every save (QA N1). Another goal starts without it.
  const [status, setStatus] = useState<Status>({ text: "", where: "head" });
  const [shownFor, setShownFor] = useState(goalKey);
  if (shownFor !== goalKey) {
    setShownFor(goalKey);
    setStatus({ text: "", where: "head" });
  }
  const back = (
    <Link to={backPath(homeSearch())} className="back">
      ‹ {viewName}
    </Link>
  );
  if (loaded.state === "loading") {
    return (
      <main className="goalpage" aria-busy="true">
        {back}
        <section className="card ghead">
          <div className="skel skel-title" />
          <div className="skel skel-line short" />
          <div className="skel skel-line" />
        </section>
        <div className="skel skel-row" />
        <div className="skel skel-row" />
      </main>
    );
  }
  if (loaded.state === "refused") {
    return (
      <main className="goalpage">
        {back}
        <p className="note">{loaded.status === 404 ? `No goal ${goalKey}.` : loaded.reason}</p>
      </main>
    );
  }
  return <Goal key={`${loaded.data.goal.id}-${loaded.data.goal.version}-${loaded.data.events.length}`} data={loaded.data} reload={reload} status={status} setStatus={setStatus} />;
}

type Status = { text: string; where: "head" | "subs" | "work" };

/** A date with its year, as on the goal page's header (design check: rule 14). */
const yearDate = (date: string) => eventValue(date, "due_date");

const time = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const when = (ts: string) => time.format(new Date(ts));

function Goal({ data, reload, status, setStatus }: { data: GoalPageResponse; reload: () => void; status: Status; setStatus: (s: Status | ((s: Status) => Status)) => void }) {
  const { goal, actors, today } = data;
  // One panel at a time (G9). A saved panel reloads the page, so every section shows the stored state.
  const [panel, openPanel] = useState<{ name: PanelName | "subgoal" | "workitem"; health?: Exclude<Health, null> } | null>(null);
  const setPanel = (next: typeof panel) => {
    setStatus((s) => ({ ...s, text: "" }));
    openPanel(next);
  };
  // G26: a save that adds or moves something out of view says so on one live line by the action; the next action clears it.
  const done = (saved: boolean, text?: string) => {
    const where = panel?.name === "subgoal" ? "subs" : panel?.name === "workitem" ? "work" : "head";
    setPanel(null);
    setStatus({ text: saved ? (text ?? "") : "", where });
    if (saved) reload();
  };
  const said = (where: "head" | "subs" | "work") => (
    <p className="gstatus" role="status">
      {status.where === where ? status.text : ""}
    </p>
  );
  const open = goal.state === "In Progress";
  // G25: the server says whether the signed-in actor may change this goal (owners-change-goal). Anyone else gets the same page, read-only.
  const may = data.mayChange;
  const late = data.needsYou.lateWorkItems.length;
  return (
    <main className="goalpage v2">
      {/* GP2-1: the breadcrumb replaces "‹ Priorities" and the Parent link; the browser's Back still returns to the view. */}
      <Crumbs data={data} />
      <div className="glayout">
        <header className="ghead2">
          {/* The key shows here; rule 7 keeps keys off Home only (G3). */}
          <span className="gkey">{goal.id}</span>
          <h1 className="gtitle">{goal.summary}</h1>
          {/* GP2-3: what needs the owner, each a link to it; silence reads as "Nothing needs you now", never as not built. */}
          {may &&
            (late || data.needsYou.missingPtg ? (
              <p className="needs">
                ! Needs you:{" "}
                {late > 0 && (
                  <a href="#g-work" className="needlink">
                    {late} work item{late === 1 ? "" : "s"} past {late === 1 ? "its" : "their"} date
                  </a>
                )}
                {late > 0 && data.needsYou.missingPtg && " and "}
                {data.needsYou.missingPtg && goal.health && goal.health !== "GREEN" && (
                  <button type="button" className="linkbtn needlink" onClick={() => setPanel({ name: "health", health: goal.health as "YELLOW" | "RED" })}>
                    a missing Path to Green
                  </button>
                )}
              </p>
            ) : (
              <p className="needs none">Nothing needs you now</p>
            ))}
          {!may && <Changers data={data} />}
          {may && said("head")}
          {/* GP2-4: every multi-field action opens its panel here, under the title. */}
          {panel?.name === "health" && panel.health && <HealthPanel data={data} health={panel.health} onDone={done} />}
          {panel?.name === "slip" && <SlipPanel data={data} onDone={done} />}
          {panel?.name === "promote" && <PromotePanel data={data} onDone={done} />}
          {panel?.name === "close" && <ClosePanel data={data} onDone={done} />}
          {panel?.name === "pursue" && <PursuePanel data={data} onDone={done} />}
        </header>
        <aside className="gprops" aria-label="Properties">
          <Props data={data} reload={reload} onAct={(a) => setPanel(a)} chosen={panel?.name === "health" ? panel.health : undefined} dateBar={data.dates.length > 0 ? <DateBar data={data} /> : null} />
        </aside>
        <div className="gbody">
          {/* The place for Drafts (G8). It draws nothing in the MLP. */}
          <div className="draftslot" />
          {panel?.name === "description" ? (
            <DescriptionPanel data={data} onDone={done} />
          ) : (
            <section className="gsec gdesc">
              <h2>
                Description
                {may && <Pencil label="Edit Description" onClick={() => setPanel({ name: "description" })} />}
              </h2>
              {goal.description ? goal.description.split(/\n{2,}/).map((p, k) => <p key={k}>{p}</p>) : <p className="muted">No description yet.</p>}
              {/* GP2-5: the missing parts, for owners only, plain muted text. */}
              {may && data.hints.some((h) => h.field === "description") && <p className="hint">{data.hints.filter((h) => h.field === "description").map((h) => h.text).join(" · ")}</p>}
            </section>
          )}
          {goal.path_to_green && (goal.health === "YELLOW" || goal.health === "RED") && (
            <section className={`gsec gptg ${goal.health}`}>
              <h2>
                Path to Green
                {may && open && <Pencil label="Edit Path to Green" onClick={() => setPanel({ name: "health", health: goal.health as "YELLOW" | "RED" })} />}
              </h2>
              <table className="steps">
                <thead>
                  <tr>
                    <th>Steps</th>
                    <th>Owner</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {goal.path_to_green.steps.map((st, k) => (
                    <tr key={k}>
                      <td>{st.text}</td>
                      <td>{actors[st.owner]?.name ?? st.owner}</td>
                      <td className="date">{shortDate(st.date, today)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                <b>When it is On track again</b> {goal.path_to_green.criteria || <span className="muted">None</span>}
              </p>
              {goal.health === "YELLOW" && (
                <p className="note">
                  <b>What makes it Off track</b> {goal.path_to_green.trigger || <span className="muted">None</span>}
                </p>
              )}
            </section>
          )}
          <section className="gsec gsubs">
            <h2>
              Sub-goals <span className="muted">{data.subGoals.length}</span>
            </h2>
            {said("subs")}
            <div className="subrows">
              {data.subGoals.map((c) => (
                <SubGoal key={c.id} card={c} data={data} />
              ))}
              {panel?.name === "subgoal" ? (
                <AddSubGoal data={data} onDone={done} />
              ) : (
                may && (
                  <button type="button" className="addrow" onClick={() => setPanel({ name: "subgoal" })}>
                    + Add sub-goal
                  </button>
                )
              )}
            </div>
          </section>
          {data.workItems && (
            <WorkItems items={data.workItems} data={data} adding={panel?.name === "workitem"} onAdd={() => setPanel({ name: "workitem" })} onDone={done} reload={reload} status={said("work")} />
          )}
          <Talk data={data} reload={reload} />
        </div>
      </div>
    </main>
  );
}

/** G25: who may change this goal, for a viewer who may not. The server names them and says why; the tooltip writes it. */
function Changers({ data }: { data: GoalPageResponse }) {
  const why = (c: GoalPageResponse["changers"][number]) => (c.as === "goalie-owner" ? "GOALIE owner" : `Owner of ${c.goal}`);
  return (
    <p className="gwho small">
      {changeParts(data.changers, data.moreChangers).map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="gwhoname" title={why(part)}>
            <Avatar actor={data.actors[part.actor] ?? { id: part.actor, name: part.actor }} mine={part.actor === data.me.id} /> {data.actors[part.actor]?.name ?? part.actor}
          </span>
        ),
      )}{" "}
      can change this goal. You can comment.
    </p>
  );
}

function DateBar({ data }: { data: GoalPageResponse }) {
  const bar = dateBar(data.started, data.today, data.dates);
  const [width, setWidth] = useState(0);
  // The bar's width decides which labels would touch; a label that would drops to a second row (labelRows).
  const measured = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setWidth(el.clientWidth);
    const resized = new ResizeObserver(() => setWidth(el.clientWidth));
    resized.observe(el);
    return () => resized.disconnect();
  }, []);
  // Each mark is labelled under it: the start, Today, and each date (design check: G6).
  const labels = [
    ...(bar.start !== null && data.started ? [{ key: "start", at: bar.start, text: `In Progress since ${shortDate(data.started, data.today)}`, align: "start" as const }] : []),
    ...(bar.start === null || Math.abs(bar.today - bar.start) > 12 ? [{ key: "today", at: bar.today, text: "Today", align: bar.start === null && bar.today < 5 ? ("start" as const) : ("center" as const) }] : []),
    ...bar.marks.map((m) => ({ key: m.kind, at: m.at, text: shortDate(m.date, data.today), align: m.at > 85 ? ("end" as const) : ("center" as const) })),
  ];
  const rows = labelRows(labels, width || 1000);
  return (
    <div className={`datebar${rows.includes(1) ? " two" : ""}`} aria-hidden="true" ref={measured}>
      <span className="dbtrack" />
      {bar.start !== null && <span className="dbfill" style={{ left: `${bar.start}%`, width: `${Math.max(0, bar.today - bar.start)}%` }} />}
      <span className="dbtoday" style={{ left: `${bar.today}%` }} />
      {bar.marks.map((m) => (
        <span key={m.kind} className={`dbmark ${m.kind === "Promotion Milestone" ? "pm" : m.kind}`} style={{ left: `${m.at}%` }} />
      ))}
      <span className="dblabels small">
        {labels.map((l, i) => (
          <span key={l.key} className={`${l.align}${rows[i] ? " low" : ""}`} style={{ left: `${l.at}%` }}>
            {l.text}
          </span>
        ))}
      </span>
    </div>
  );
}

/** The pencil icon that makes a card editable in place. */
function Pencil({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="pencil" aria-label={label} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z" />
      </svg>
    </button>
  );
}

function SubGoal({ card, data }: { card: SubGoalCard; data: GoalPageResponse }) {
  // The goal's own date, not its Promotion Milestone's: the one a sub-goal with no date of its own takes (D2).
  const ownDate = data.dates.find((d) => d.kind !== "Promotion Milestone");
  const owner = data.actors[card.owner] ?? { id: card.owner, name: card.owner };
  const done = card.workItems && card.workItems.total > 0 ? card.workItems.completed / card.workItems.total : 0;
  return (
    <div className="gsub2">
      <HealthDot health={card.state === "In Progress" ? card.health : null} word={false} />
      <div className="gsubmain">
        <Link to={goalPath(card.id)} className="title">
          {card.summary}
        </Link>
        <span className="gsubmeta small">
          {card.promotionMilestone && <span className="pmtag">◆ Promotion Milestone</span>}
          {card.state !== "In Progress" && <span>{card.state}</span>}
          {card.dates.length > 0 ? (
            <span className="date">{card.dates.map((d) => dateLabel(d, data.today)).join(" · ")}</span>
          ) : (
            // QA U1: a sub-goal on this goal's date says so, and shares this goal's Promotion Milestone when the date is uncommitted (G21).
            <span>
              {/* QA U1: the date itself, then whose it is: "Fantasy Feb 28, 2027 · this goal's date · shares XW-0012". */}
              {ownDate && `${ownDate.kind} ${yearDate(ownDate.date)} `}
              <span className="muted">
                {ownDate ? "· this goal's date" : "This goal's date"}
                {data.goal.promotion_milestone ? ` · shares ${data.goal.promotion_milestone}` : ""}
              </span>
            </span>
          )}
          {card.workItems && card.workItems.total > 0 && (
            <span className="progress">
              <span className="pbar">
                <span style={{ width: `${done * 100}%` }} />
              </span>
              {card.workItems.completed} of {card.workItems.total} work items
            </span>
          )}
        </span>
      </div>
      {card.subGoals > 0 && <span className="chev static">{card.subGoals}</span>}
      <Avatar actor={owner} mine={owner.id === data.me.id} />
    </div>
  );
}

/** An owner with its kind: an agent's avatar has a dashed ring and the muted word "agent" (G23, SPEC.md §6.4). */
export function Owner({ actor, me }: { actor: ApiActor; me: string }) {
  return (
    <span className={`wowner${actor.kind === "agent" ? " agent" : ""}`}>
      <Avatar actor={actor} mine={actor.id === me} />
      {actor.name}
      {actor.kind === "agent" && <span className="muted"> agent</span>}
    </span>
  );
}

const STATUSES = ["In Progress", "Backlog", "Completed", "Deleted"] as const;

/** GP2-8, GL4: compact rows under a "Status" heading; status chips with counts filter them, and Completed is closed until its chip is pressed. */
function WorkItems({ items, data, adding, onAdd, onDone, reload, status }: { items: ApiWorkItem[]; data: GoalPageResponse; adding: boolean; onAdd: () => void; onDone: Done; reload: () => void; status: React.ReactNode }) {
  const live = items.filter((i) => i.status !== "Deleted");
  const counts = groupWorkItems(live).map((g) => ({ status: g.status, n: g.items.length }));
  const [shown, setShown] = useState<Record<string, boolean>>({ "In Progress": true, Backlog: true, Completed: false });
  const [picking, setPicking] = useState<string | null>(null);
  const { move, chosen, box } = useTick(reload);
  const rows = live.filter((i) => shown[i.status]);
  return (
    <section className="gsec gwork" id="g-work">
      <h2>
        Work items <span className="muted">{live.length}</span>
        <span className="wchips">
          {counts.map((c) => (
            <button key={c.status} type="button" className={`fchip${shown[c.status] ? " on" : ""}`} aria-pressed={Boolean(shown[c.status])} onClick={() => setShown((x) => ({ ...x, [c.status]: !x[c.status] }))}>
              {c.status} {c.n}
            </button>
          ))}
        </span>
      </h2>
      {status}
      {rows.length > 0 && <div className="wstatushead small">Status</div>}
      <div className="wrows">
        {rows.map((i) => {
          const owner = data.actors[i.owner] ?? { id: i.owner, name: i.owner, kind: "human" as const };
          const now = chosen(i);
          return (
            <div key={i.id} className={`wrow2${i.status === "Completed" ? " done" : ""}`}>
              {/* The circle is a named control: empty Backlog, half In Progress, checked Completed. */}
              <button type="button" className={`scircle ${i.status === "Completed" ? "full" : i.status === "In Progress" ? "half" : "empty"}`} aria-label={`Status: ${i.status}. Change`} title="Change status" onClick={() => setPicking(picking === i.id ? null : i.id)} />
              <span className="wtitle">{i.title}</span>
              <span className="wwho">
                <Avatar actor={owner} mine={owner.id === data.me.id} />
                <span className="wfirst">{owner.name.split(" ")[0]}</span>
              </span>
              <span className={`wdue small${i.late ? " late" : ""}`}>{i.due_date ? `${shortDate(i.due_date, data.today)}${i.late ? " late" : i.due_date === data.today ? " today" : ""}` : ""}</span>
              {picking === i.id && (
                <select className="wpick" aria-label={`Status of ${i.title}`} value={now} onChange={(e) => move(i, e.target.value as (typeof STATUSES)[number])} autoFocus>
                  {STATUSES.map((st) => (
                    <option key={st}>{st}</option>
                  ))}
                </select>
              )}
              {box(i)}
            </div>
          );
        })}
        {adding ? (
          <AddWorkItem data={data} statuses={["Backlog", "In Progress", "Completed", "Deleted"]} onDone={onDone} />
        ) : (
          <button type="button" className="addrow" onClick={onAdd}>
            + Add work item
          </button>
        )}
      </div>
    </section>
  );
}

/** One History row: one write (design check). A create opens to list its fields; a change lists each field, old to new, with names for ids. */
function EventRow({ group, data }: { group: EventGroup; data: GoalPageResponse }) {
  const e = group.events[0];
  const actor = data.actors[e.actor] ?? { id: e.actor, name: e.actor };
  const names: Names = {
    actors: data.actors,
    names: {
      ...historyNames(data.events),
      ...(data.priority ? { [data.priority.id]: `Priority ${data.priority.rank} ${data.priority.title}` } : {}),
      [data.orgUnit.id]: data.orgUnit.name,
      ...(data.parent ? { [data.parent.id]: data.parent.summary } : {}),
      ...(data.promotionMilestone ? { [data.promotionMilestone.id]: data.promotionMilestone.summary } : {}),
    },
  };
  const value = (v: unknown, field: string) => eventValue(v, field, names);
  // One write can touch several goals; the row speaks of this goal, and names any other goal before its step.
  const find = (field: string) => group.events.find((x) => x.field === field && x.entity === data.goal.id)?.new;
  // GL5: a Path to Green change says what changed in it ("Step 1 date Nov 6, 2026 → Nov 13, 2026"), never "1 step → 1 step".
  const change = (x: ApiEvent) =>
    x.field === "path_to_green" ? (ptgChanges(x.old as PathToGreen | null, x.new as PathToGreen | null, names).join("; ") || "Path to Green unchanged") : `${fieldLabel(x.field)}: ${value(x.old, x.field)} → ${value(x.new, x.field)}`;
  const other = (x: { entity: string }) => (x.entity !== data.goal.id ? `${x.entity} ` : "");
  return (
    <li className="erow">
      <Avatar actor={actor} mine={actor.id === data.me.id} />
      <div>
        <p className="small">
          <b>{actor.name}</b> · {when(e.timestamp)}
          {group.events.every((x) => x.entity !== data.goal.id) && <span className="muted"> · {e.entity}</span>}
        </p>
        {e.field === "comment" ? (
          <p>{String(e.new)}</p>
        ) : group.created ? (
          <details className="created">
            <summary>
              Created
              {find("date_type") !== undefined && ` · ${value(find("date_type"), "date_type")} ${value(find("due_date"), "due_date")}`}
              {find("health") ? ` · ${value(find("health"), "health")}` : ""}
              {e.reason && <span className="muted"> “{e.reason}”</span>}
            </summary>
            <ul>
              {createdFields(group.events, data.goal.id).map((x) => (
                  <li key={x.sequence}>
                    {other(x)}
                    {fieldLabel(x.field)}: {value(x.new, x.field)}
                  </li>
                ))}
            </ul>
          </details>
        ) : group.promoted ? (
          <details className="created">
            <summary>
              Promoted{group.promoted.milestone && ` · ${group.promoted.milestone} completed`}
              {e.reason && <span className="muted"> “{e.reason}”</span>}
            </summary>
            <ul>
              {[...group.events].reverse().map((x) => (
                <li key={x.sequence}>
                  {other(x)}
                  {change(x)}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <>
            {group.events.map((x) => (
              <p key={x.sequence}>
                {other(x)}
                {change(x)}
              </p>
            ))}
            {e.reason && <p className="muted">“{e.reason}”</p>}
          </>
        )}
      </div>
    </li>
  );
}

/** Comments and History, each with its count. Comments opens first (design: Comments and History). */
/** GP2-9, GL5: Activity, last: one stream of comments and changes, newest first, with All, Comments, and Changes, and the comment box at its top. */
function Talk({ data, reload }: { data: GoalPageResponse; reload: () => void }) {
  const [chip, setChip] = useState<ActivityChip>("All");
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  // D1: past 1,000 Events the page holds the newest 100; "Show older" joins the next page.
  const [older, setOlder] = useState<ApiEvent[]>([]);
  const [cursor, setCursor] = useState(data.olderEvents);
  const [loading, setLoading] = useState<string>();
  const events = joinPages(data.events, older);
  const shown = activity(events, chip);
  const count = { All: data.eventCount, Comments: data.commentCount, Changes: data.eventCount - data.commentCount };
  const more = async () => {
    if (cursor === null) return;
    setLoading("…");
    const page = await getJson<GoalEventsResponse>(`/api/goals/${encodeURIComponent(data.goal.id)}/events?before=${cursor}`);
    if (page.state === "ok") {
      setOlder((o) => joinPages(o, page.data.events));
      setCursor(page.data.olderEvents);
      setLoading(undefined);
    } else setLoading(page.state === "refused" ? page.reason : "");
  };
  return (
    <section className="gsec gtalk">
      <h2>
        Activity
        <span className="wchips">
          {ACTIVITY.map((c) => (
            <button key={c} type="button" className={`fchip${chip === c ? " on" : ""}`} aria-pressed={chip === c} onClick={() => setChip(c)}>
              {c} <span className="muted">{count[c]}</span>
            </button>
          ))}
        </span>
      </h2>
      <form
        className="commentbox"
        onSubmit={async (e) => {
          e.preventDefault();
          const { body } = await postCommands(commentBatch("goal", data.goal.id, text));
          if (body.ok) {
            setText("");
            reload();
          } else setError(body.error === "invalid" ? body.violations.map((v) => v.message).join(" ") : body.error === "stale" ? "" : body.message);
        }}
      >
        <textarea rows={2} value={text} placeholder="Comment" onChange={(e) => setText(e.target.value)} aria-label="Comment" />
        {error && <p className="ferror">{error}</p>}
        <button type="submit" className="btn primary">
          Comment
        </button>
      </form>
      {shown.length === 0 && <p className="muted note">{chip === "Comments" ? "No comments yet." : "Nothing yet."}</p>}
      <ul className="events" style={{ "--n": shown.length } as CSSProperties}>
        {groupEvents(shown).map((g) => (
          <EventRow key={g.events[0].sequence} group={g} data={data} />
        ))}
      </ul>
      {cursor !== null && (
        <p className="olderrow">
          <button type="button" className="btn" onClick={more} disabled={loading === "…"} aria-busy={loading === "…"}>
            Show older
          </button>
          {loading && loading !== "…" && <span className="ferror">{loading}</span>}
        </p>
      )}
    </section>
  );
}
