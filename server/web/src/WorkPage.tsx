import { useEffect, useRef, useState } from "react";
import type { ApiEvent, PrioritiesResponse, WorkItemStatus, WorkResponse } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import { useJson } from "./data.ts";
import { useTick } from "./GoalAdd.tsx";
import { Owner } from "./GoalPage.tsx";
import { keepOrder, queues } from "./model/goalpage.ts";
import { goalPath, workPath } from "./model/route.ts";
import { Link } from "./router.tsx";

/**
 * The work page (plan F6): one owner's queue, or every queue (the team view), each by status.
 * It reads GET /api/work and reloads it when a work item Event arrives on GET /api/events (ADR 0007).
 */
export function WorkPage({ data, owner }: { data: PrioritiesResponse; owner?: string }) {
  const [loaded, reload] = useJson<WorkResponse>(owner ? `/api/work?owner=${encodeURIComponent(owner)}` : "/api/work");
  useLive(reload);
  const tab = (to: string | undefined, label: string) => (
    <Link to={workPath(to)} className={`vtab${owner === to ? " on" : ""}`}>
      {label}
    </Link>
  );
  return (
    <main className="workpage">
      <div className="workhead">
        <h1>Work items</h1>
        {/* The switch names what it switches: the Owner (SPEC.md §6.7). */}
        <span className="wowner">
          <span className="flabel">Owner</span>
          <span className="tabs" role="group" aria-label="Owner">
            {tab(data.me.id, data.me.name)}
            {tab(undefined, data.org.name)}
          </span>
        </span>
      </div>
      {loaded.state === "loading" && <div className="skel skel-row" />}
      {loaded.state === "refused" && <p className="note">{loaded.reason}</p>}
      {loaded.state === "ok" && <Queues work={loaded.data} reload={reload} single={Boolean(owner)} />}
    </main>
  );
}

/** Subscribe to GET /api/events and reload, at most once a frame, when a work item changes. EventSource resumes with Last-Event-ID by itself. */
function useLive(reload: () => void) {
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/events");
    let frame = 0;
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as ApiEvent;
      if (event.entity_kind !== "work_item") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => latest.current());
    };
    return () => {
      cancelAnimationFrame(frame);
      source.close();
    };
  }, []);
}

/** A due date: past and not Completed in red with "late", today with "today" (G23). */
function Due({ date, late, today, done }: { date: string | null; late: boolean; today: string; done: boolean }) {
  if (!date) return <span className="wdue small" />;
  const now = !done && date === today;
  return (
    <span className={`wdue small${late ? " late" : now ? " today" : ""}`}>
      {shortDate(date, today)}
      {late ? " late" : now ? " today" : ""}
    </span>
  );
}

const STATUSES: WorkItemStatus[] = ["Backlog", "In Progress", "Completed", "Deleted"];

function Queues({ work, reload, single }: { work: WorkResponse; reload: () => void; single: boolean }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const { ticked, tick, move, chosen, box } = useTick(reload);
  // QA U5: a save does not move a person's queue; the order from page load holds until the next visit.
  const sorted = queues(work.items, work.actors, work.me.id);
  const [first] = useState(() => sorted.map((q) => q.owner.id));
  const order = keepOrder(first, sorted.map((q) => q.owner.id));
  const list = order.map((id) => sorted.find((q) => q.owner.id === id)).filter((q) => q !== undefined);
  if (!list.length) return <p className="muted note">No work items yet.</p>;
  return (
    <>
      {list.map((q) => (
        <section key={q.owner.id} className="queue">
          <h2>
            {single ? <Owner actor={q.owner} me={work.me.id} /> : <Link to={workPath(q.owner.id)} className="qowner"><Owner actor={q.owner} me={work.me.id} /></Link>}
            <span className="muted">{q.groups.reduce((n, g) => n + g.items.length, 0)}</span>
          </h2>
          {q.groups.map((g) => {
            const key = `${q.owner.id}:${g.status}`;
            const done = g.status === "Completed";
            const shut = closed[key] ?? done;
            const rows = g.items.map((i) => (
              <div key={i.id} className={`wrow qrow${i.status === "Completed" ? " done" : ""}`}>
                {/* The tick's label is its 44 px tap area on touch (rule 29). */}
                <label className="wtick">
                  <input type="checkbox" checked={i.status === "Completed" || ticked?.id === i.id} disabled={i.status === "Completed"} onChange={() => tick(i)} aria-label={`Mark ${i.title} Completed`} />
                </label>
                <span className="wtitle">{i.title}</span>
                <Link to={goalPath(i.goal)} className="wgoal small">
                  {work.goals[i.goal]?.summary ?? i.goal}
                </Link>
                <Due date={i.due_date} late={i.late} today={work.today} done={done} />
                {/* QA U6: any status can be set here, each with its reason (product D8). */}
                <select className="wstatus small" value={chosen(i)} aria-label={`Status of ${i.title}`} onChange={(e) => move(i, e.target.value as WorkItemStatus)}>
                  {STATUSES.map((st) => (
                    <option key={st}>{st}</option>
                  ))}
                </select>
                {box(i)}
              </div>
            ));
            // Completed work is one muted line per person, opening in place (design check).
            if (done) {
              return (
                <div key={g.status} className="qdone">
                  <button type="button" className="linkbtn muted" aria-expanded={!shut} onClick={() => setClosed((c) => ({ ...c, [key]: !shut }))}>
                    {g.items.length} completed {shut ? "▸" : "▾"}
                  </button>
                  {!shut && <div className="wgroup">{rows}</div>}
                </div>
              );
            }
            return (
              <div key={g.status} className="wgroup">
                <div className="wghead">
                  {g.status} <span className="muted">{g.items.length}</span>
                </div>
                {rows}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
