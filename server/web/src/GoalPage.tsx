import { useState, type CSSProperties } from "react";
import type { ApiActor, ApiEvent, ApiWorkItem, GoalPageResponse, Health, SubGoalCard } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import { postCommands, useJson } from "./data.ts";
import { ClosePanel, DescriptionPanel, FieldsPanel, HealthPanel, PromotePanel, PursuePanel, SlipPanel, type PanelName } from "./GoalPanels.tsx";
import { commentBatch } from "./model/commands.ts";
import { comments, dateBar, eventValue, fieldLabel, filterEvents, groupWorkItems, HISTORY_FILTERS, type HistoryFilter } from "./model/goalpage.ts";
import { dateLabel, slipLabel } from "./model/labels.ts";
import { backPath, goalPath } from "./model/route.ts";
import { Avatar, HealthDot } from "./parts.tsx";
import { homeSearch, Link } from "./router.tsx";

/**
 * The goal page (docs/design/goal-page-and-create.md, G1 to G24). It reads GET /api/goals/:id.
 * This part draws the goal. The panels that change it come next, each as one batch to POST /api/commands.
 */
export function GoalPage({ goalKey, viewName }: { goalKey: string; viewName: string }) {
  const [loaded, reload] = useJson<GoalPageResponse>(`/api/goals/${encodeURIComponent(goalKey)}`);
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
  return <Goal key={`${loaded.data.goal.id}-${loaded.data.goal.version}-${loaded.data.events.length}`} data={loaded.data} back={back} reload={reload} />;
}

const time = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const when = (ts: string) => time.format(new Date(ts));

function Goal({ data, back, reload }: { data: GoalPageResponse; back: React.ReactNode; reload: () => void }) {
  const { goal, actors, today } = data;
  // One panel at a time (G9). A saved panel reloads the page, so every section shows the stored state.
  const [panel, setPanel] = useState<{ name: PanelName; health?: Exclude<Health, null> } | null>(null);
  const done = (saved: boolean) => {
    setPanel(null);
    if (saved) reload();
  };
  const closable = goal.state === "In Progress" || goal.state === "Backlog";
  const owner = actors[goal.owner] ?? { id: goal.owner, name: goal.owner, kind: "human" as const };
  const [judged, ...others] = data.dates;
  const open = goal.state === "In Progress";
  const hint = (field: string) => data.hints.filter((h) => h.field === field).map((h) => <p key={h.text} className="hint">{h.text}</p>);
  const needs = [
    data.needsYou.lateWorkItems.length > 0 && `${data.needsYou.lateWorkItems.length} work item${data.needsYou.lateWorkItems.length === 1 ? "" : "s"} past its date`,
    data.needsYou.missingPtg && "a missing Path to Green",
  ].filter(Boolean);
  return (
    <main className="goalpage">
      {back}
      <section className="card ghead">
        <div className="ghead-top">
          <div className="ghead-main">
            <h1 className="gtitle">{goal.summary}</h1>
            {/* The key shows here; rule 7 keeps keys off Home only (G3). */}
            <p className="gmeta">
              <span>{goal.id}</span>
              <span className="gowner">
                <Avatar actor={owner} mine={owner.id === data.me.id} /> {owner.name}
              </span>
              <span>{goal.state}</span>
              {data.priority && (
                <span>
                  Priority {data.priority.rank} {data.priority.title}
                </span>
              )}
              {data.parent && (
                <span>
                  Parent <Link to={goalPath(data.parent.id)}>{data.parent.summary}</Link>
                </span>
              )}
            </p>
            {needs.length > 0 && <p className="needs">! Needs you: {needs.join(" and ")}</p>}
          </div>
          {/* A goal that is not In Progress shows no health control; its State word stands alone (G4). */}
          {open && (
            <div className="ghealth" role="group" aria-label="Health">
              <span className="lbl">Health</span>
              <span className="hpick">
                {(["GREEN", "YELLOW", "RED"] as const).map((h) => {
                  const chosen = panel?.name === "health" && panel.health === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      className={`hopt ${h}${goal.health === h && !panel?.health ? " on" : ""}${chosen ? " chosen" : ""}`}
                      aria-pressed={goal.health === h}
                      onClick={() => (h === goal.health ? setPanel(null) : setPanel({ name: "health", health: h }))}
                    >
                      <HealthDot health={h} word={false} />
                      {h}
                    </button>
                  );
                })}
              </span>
            </div>
          )}
        </div>
        {/* The date health is judged on leads (G5, DD1). */}
        {judged && (
          <div className="gjudged">
            <span className="lbl">Health is judged on</span>
            <p className="gdate">
              <span className="date">{goal.changed_due_date && judged.kind === "Committed" ? shortDate(goal.changed_due_date, today) : shortDate(judged.date, today)}</span>
              <span className="gkind">{judged.kind === "Promotion Milestone" ? "Committed · Promotion Milestone" : judged.kind}</span>
              {judged.slipDays !== undefined && <span className="late"> · {slipLabel(judged.slipDays)}</span>}
            </p>
            {data.promotionMilestone && judged.kind === "Promotion Milestone" && (
              <Link to={goalPath(data.promotionMilestone.id)} className="gpm">
                {data.promotionMilestone.summary} ›
              </Link>
            )}
            {goal.original_committed_date && <p className="small">Original Committed Date {shortDate(goal.original_committed_date, today)}</p>}
            {data.inherited && <p className="small">The parent's date</p>}
          </div>
        )}
        {others.map((d) => (
          <p key={d.kind} className="gother">
            <span className="date">{dateLabel(d, today)}</span>
          </p>
        ))}
        {data.dates.length > 0 && <DateBar data={data} />}
        {/* The actions name their object; one that does not apply is not drawn (G7). */}
        <div className="gactions">
          {goal.state === "Backlog" && (
            <button type="button" className="btn" onClick={() => setPanel({ name: "pursue" })}>
              Pursue
            </button>
          )}
          {open && goal.date_type === "Committed" && (
            <button type="button" className="btn" onClick={() => setPanel({ name: "slip" })}>
              Record a slip
            </button>
          )}
          {closable && (goal.date_type === "Ambition" || goal.date_type === "Fantasy") && (
            <button type="button" className="btn" onClick={() => setPanel({ name: "promote" })}>
              Promote date
            </button>
          )}
          {closable && (
            <button type="button" className="btn" onClick={() => setPanel({ name: "close" })}>
              Close goal
            </button>
          )}
        </div>
        {panel?.name === "health" && panel.health && <HealthPanel data={data} health={panel.health} onDone={done} />}
        {panel?.name === "slip" && <SlipPanel data={data} onDone={done} />}
        {panel?.name === "promote" && <PromotePanel data={data} onDone={done} />}
        {panel?.name === "close" && <ClosePanel data={data} onDone={done} />}
        {panel?.name === "pursue" && <PursuePanel data={data} onDone={done} />}
      </section>
      {/* The place for Drafts (G8). It draws nothing in the MLP. */}
      <div className="draftslot" />
      {goal.path_to_green && (
        <section className={`card gptg ${goal.health ?? ""}`}>
          <div className="lbl">
            Path to Green (PTG)
            {open && goal.health && goal.health !== "GREEN" && <Pencil label="Edit Path to Green" onClick={() => setPanel({ name: "health", health: goal.health as "YELLOW" | "RED" })} />}
          </div>
          <table className="steps">
            <thead>
              <tr>
                <th>Steps</th>
                <th>Owner</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {goal.path_to_green.steps.map((s, i) => (
                <tr key={i}>
                  <td>{s.text}</td>
                  <td>{actors[s.owner]?.name ?? s.owner}</td>
                  <td className="date">{shortDate(s.date, today)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            <b>Criteria for GREEN</b> {goal.path_to_green.criteria || <span className="muted">None</span>}
          </p>
          {goal.health === "YELLOW" && (
            <p className="note">
              <b>Trigger for RED</b> {goal.path_to_green.trigger || <span className="muted">None</span>}
            </p>
          )}
        </section>
      )}
      <div className="gtwo">
        {panel?.name === "description" ? (
          <DescriptionPanel data={data} onDone={done} />
        ) : (
          <section className="card gdesc">
            <div className="lbl">
              Description
              <Pencil label="Edit Description" onClick={() => setPanel({ name: "description" })} />
            </div>
            {goal.description ? goal.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <p className="muted">None</p>}
            {hint("description")}
          </section>
        )}
        {panel?.name === "fields" ? <FieldsPanel data={data} onDone={done} /> : <Fields data={data} onEdit={() => setPanel({ name: "fields" })} />}
      </div>
      {data.subGoals.length > 0 && (
        <section className="gsubs">
          <h2>Sub-goals</h2>
          {data.subGoals.map((c) => (
            <SubGoal key={c.id} card={c} data={data} />
          ))}
        </section>
      )}
      {data.workItems && <WorkItems items={data.workItems} data={data} />}
      <Talk data={data} reload={reload} />
    </main>
  );
}

function DateBar({ data }: { data: GoalPageResponse }) {
  const bar = dateBar(data.started, data.today, data.dates);
  return (
    <div className="datebar" aria-hidden="true">
      <span className="dbtrack" />
      <span className="dbfill" style={{ left: `${bar.start}%`, width: `${Math.max(0, bar.today - bar.start)}%` }} />
      <span className="dbtoday" style={{ left: `${bar.today}%` }} />
      {bar.marks.map((m) => (
        <span key={m.kind} className={`dbmark ${m.kind === "Promotion Milestone" ? "pm" : m.kind}`} style={{ left: `${m.at}%` }} title={dateLabel({ date: m.date, kind: m.kind as "Committed" }, data.today)} />
      ))}
      <span className="dbstart small">In Progress since {shortDate(data.started, data.today)}</span>
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

function Fields({ data, onEdit }: { data: GoalPageResponse; onEdit: () => void }) {
  const { goal, today } = data;
  const none = <span className="muted">None</span>;
  const dateOr = (d: string | null) => (d ? <span className="date">{shortDate(d, today)}</span> : none);
  const rows: [string, React.ReactNode][] = [
    ["type", goal.type],
    ["level", goal.level],
    ["org_unit", data.orgUnit.name],
    ["severity", goal.severity],
    ["plan", goal.plan ?? none],
    ["plan_maturity", goal.plan_maturity],
    ["work_product", goal.work_product?.length ? goal.work_product.map((w) => Object.values(w).join(" ")).join(", ") : none],
    ["parent", data.parent ? <Link to={goalPath(data.parent.id)}>{data.parent.summary}</Link> : none],
    ["origination", goal.origination],
    ["visibility", goal.visibility],
    ["original_committed_date", dateOr(goal.original_committed_date)],
    ["changed_due_date", dateOr(goal.changed_due_date)],
  ];
  return (
    <section className="card gfields">
      <div className="lbl">
        Fields
        <Pencil label="Edit Fields" onClick={onEdit} />
      </div>
      <dl>
        {rows.map(([field, value]) => (
          <div key={field}>
            <dt>{fieldLabel(field)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SubGoal({ card, data }: { card: SubGoalCard; data: GoalPageResponse }) {
  const owner = data.actors[card.owner] ?? { id: card.owner, name: card.owner };
  const done = card.workItems && card.workItems.total > 0 ? card.workItems.completed / card.workItems.total : 0;
  return (
    <div className="card gsub">
      <HealthDot health={card.state === "In Progress" ? card.health : null} word={false} />
      <div className="gsubmain">
        <Link to={goalPath(card.id)} className="title">
          {card.summary}
        </Link>
        <span className="gsubmeta small">
          {card.promotionMilestone && <span className="pmtag">◆ Promotion Milestone</span>}
          {card.state !== "In Progress" && <span>{card.state}</span>}
          {card.dates.length > 0 && <span className="date">{card.dates.map((d) => dateLabel(d, data.today)).join(" · ")}</span>}
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
function Owner({ actor, me }: { actor: ApiActor; me: string }) {
  return (
    <span className={`wowner${actor.kind === "agent" ? " agent" : ""}`}>
      <Avatar actor={actor} mine={actor.id === me} />
      {actor.name}
      {actor.kind === "agent" && <span className="muted"> agent</span>}
    </span>
  );
}

function WorkItems({ items, data }: { items: ApiWorkItem[]; data: GoalPageResponse }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({ Completed: true });
  const live = items.filter((i) => i.status !== "Deleted");
  return (
    <section className="gwork">
      <h2>
        Work items <span className="muted">{live.length}</span>
      </h2>
      {groupWorkItems(live).map((g) => (
        <div key={g.status} className="wgroup">
          <button type="button" className="wghead" aria-expanded={!closed[g.status]} onClick={() => setClosed((c) => ({ ...c, [g.status]: !c[g.status] }))}>
            {g.status} <span className="muted">{g.items.length}</span>
          </button>
          {!closed[g.status] &&
            g.items.map((i) => (
              <div key={i.id} className={`wrow${i.status === "Completed" ? " done" : ""}`}>
                <input type="checkbox" checked={i.status === "Completed"} readOnly aria-label={`${i.title} is Completed`} />
                <span className="wtitle">{i.title}</span>
                <Owner actor={data.actors[i.owner] ?? { id: i.owner, name: i.owner, kind: "human" }} me={data.me.id} />
                <span className="wstatus small">{i.status}</span>
                <span className={`wdue small${i.late ? " late" : ""}`}>{i.due_date ? `${shortDate(i.due_date, data.today)}${i.late ? " late" : ""}` : ""}</span>
              </div>
            ))}
        </div>
      ))}
    </section>
  );
}

function EventRow({ e, data }: { e: ApiEvent; data: GoalPageResponse }) {
  const actor = data.actors[e.actor] ?? { id: e.actor, name: e.actor };
  return (
    <li className="erow">
      <Avatar actor={actor} mine={actor.id === data.me.id} />
      <div>
        <p className="small">
          <b>{actor.name}</b> · {when(e.timestamp)}
          {e.entity !== data.goal.id && <span className="muted"> · {e.entity}</span>}
        </p>
        {e.field === "comment" ? (
          <p>{String(e.new)}</p>
        ) : (
          <p>
            {fieldLabel(e.field)}: {eventValue(e.old, e.field, data.actors)} → {eventValue(e.new, e.field, data.actors)}
            {e.reason && <span className="muted"> “{e.reason}”</span>}
          </p>
        )}
      </div>
    </li>
  );
}

/** Comments and History, each with its count. Comments opens first (design: Comments and History). */
function Talk({ data, reload }: { data: GoalPageResponse; reload: () => void }) {
  const [tab, setTab] = useState<"Comments" | "History">("Comments");
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<HistoryFilter>("All");
  const said = comments(data.events);
  const shown = tab === "Comments" ? said : filterEvents(data.events, filter);
  return (
    <section className="gtalk">
      <span className="tabs" role="tablist">
        {(["Comments", "History"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`vtab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
            {t} <span className="muted">{t === "Comments" ? said.length : data.events.length}</span>
          </button>
        ))}
      </span>
      {tab === "History" && (
        <p className="chips">
          {HISTORY_FILTERS.map((f) => (
            <button key={f} type="button" className={`fchip${filter === f ? " on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </p>
      )}
      {tab === "Comments" && (
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
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
          {error && <p className="ferror">{error}</p>}
          <button type="submit" className="btn primary">
            Comment
          </button>
        </form>
      )}
      <ul className="events" style={{ "--n": shown.length } as CSSProperties}>
        {shown.map((e) => (
          <EventRow key={e.sequence} e={e} data={data} />
        ))}
      </ul>
    </section>
  );
}
