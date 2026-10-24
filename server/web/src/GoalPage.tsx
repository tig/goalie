import type { PrioritiesResponse } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import { findGoal } from "./model/goal.ts";
import { dateLabel, listDates, slipLabel } from "./model/labels.ts";
import { backPath, goalPath } from "./model/route.ts";
import { Avatar, HealthDot } from "./parts.tsx";
import { homeSearch, Link } from "./router.tsx";

/**
 * The goal page (docs/design/goal-page-and-create.md). This first part reads the goal from the Priorities view: the header, the date health is judged on, and the sub-goals.
 * The fields, the history, and every write come with the goal API.
 */
export function GoalPage({ data, goalKey }: { data: PrioritiesResponse; goalKey: string }) {
  const found = findGoal(data, goalKey);
  const back = (
    <Link to={backPath(homeSearch())} className="back">
      ‹ {data.view.name}
    </Link>
  );
  if (!found) {
    return (
      <main className="goalpage">
        {back}
        <p className="note">No goal {goalKey}.</p>
      </main>
    );
  }
  const { goal, priority, parent, dates } = found;
  const shown = dates.own.length ? dates.own : dates.inherited;
  const { own, pm, judged } = listDates(shown);
  const others = [...own, ...pm].filter((d) => d !== judged);
  const open = goal.state === "In Progress";
  return (
    <main className="goalpage">
      {back}
      <section className="card ghead">
        <h1 className="gtitle">{goal.summary}</h1>
        {/* The key shows here; rule 7 keeps keys off Home only (G3). */}
        <p className="gmeta">
          <span>{goal.id}</span>
          <span className="gowner">
            <Avatar actor={goal.owner} mine={goal.owner.id === data.me.id} /> {goal.owner.name}
          </span>
          <span>{goal.state}</span>
          {priority && (
            <span>
              Priority {priority.rank} {priority.title}
            </span>
          )}
          {parent && (
            <span>
              Parent <Link to={goalPath(parent.id)}>{parent.summary}</Link>
            </span>
          )}
        </p>
        {open && (
          <p className="ghealth">
            <HealthDot health={goal.health} word="shown" />
          </p>
        )}
        {/* The date health is judged on leads (G5, DD1). */}
        {judged && (
          <div className="gjudged">
            <span className="lbl">Health is judged on</span>
            <p className="gdate">
              {dateLabel(judged, data.today)}
              {judged.slipDays !== undefined && <span className="late"> · {slipLabel(judged.slipDays)}</span>}
            </p>
          </div>
        )}
        {others.map((d) => (
          <p key={d.kind} className="gother date">
            {dateLabel(d, data.today)}
          </p>
        ))}
      </section>
      {goal.ptg && (
        <section className={`card gptg ${goal.health ?? ""}`}>
          <div className="lbl">Path to Green (PTG)</div>
          <p className="note">
            {goal.ptg.text}
            {goal.ptg.owner && <span className="muted"> · {goal.ptg.owner.name}</span>}
            {goal.ptg.date && <span className="muted"> · {shortDate(goal.ptg.date, data.today)}</span>}
          </p>
        </section>
      )}
      {goal.children.length > 0 && (
        <section className="gsubs">
          <h2>Sub-goals</h2>
          {goal.children.map((c) => (
            <div key={c.id} className="card gsub">
              <HealthDot health={c.state === "In Progress" ? c.health : null} />
              <Link to={goalPath(c.id)} className="title">
                {c.summary}
              </Link>
              {c.state !== "In Progress" && <span className="muted small">{c.state}</span>}
              {c.dates.length > 0 && <span className="small">{c.dates.map((d) => dateLabel(d, data.today)).join(" · ")}</span>}
              {c.children.length > 0 && <span className="chev static">{c.children.length}</span>}
              <Avatar actor={c.owner} mine={c.owner.id === data.me.id} />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
