import { useEffect, useRef, useState } from "react";
import type { ApiEvent, PrioritiesResponse, WorkResponse } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import { useJson } from "./data.ts";
import { useTick } from "./GoalAdd.tsx";
import { Owner } from "./GoalPage.tsx";
import { queues } from "./model/goalpage.ts";
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
        <span className="tabs" role="group" aria-label="Work items">
          {tab(data.me.id, data.me.name)}
          {tab(undefined, data.org.name)}
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

function Queues({ work, reload, single }: { work: WorkResponse; reload: () => void; single: boolean }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const { ticked, tick, box } = useTick(reload);
  const list = queues(work.items, work.actors, work.me.id);
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
            const shut = closed[key] ?? g.status === "Completed";
            return (
              <div key={g.status} className="wgroup">
                <button type="button" className="wghead" aria-expanded={!shut} onClick={() => setClosed((c) => ({ ...c, [key]: !shut }))}>
                  {g.status} <span className="muted">{g.items.length}</span>
                </button>
                {!shut &&
                  g.items.map((i) => (
                    <div key={i.id} className={`wrow qrow${i.status === "Completed" ? " done" : ""}`}>
                      <input type="checkbox" checked={i.status === "Completed" || ticked?.id === i.id} disabled={i.status === "Completed"} onChange={() => tick(i)} aria-label={`Mark ${i.title} Completed`} />
                      <span className="wtitle">{i.title}</span>
                      <Link to={goalPath(i.goal)} className="wgoal small">
                        {work.goals[i.goal]?.summary ?? i.goal}
                      </Link>
                      <span className={`wdue small${i.late ? " late" : ""}`}>{i.due_date ? `${shortDate(i.due_date, work.today)}${i.late ? " late" : ""}` : ""}</span>
                      {box(i)}
                    </div>
                  ))}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
