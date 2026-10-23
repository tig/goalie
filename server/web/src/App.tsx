import { useEffect, useMemo, useState } from "react";
import type { ApiError, Health, PrioritiesResponse } from "../../src/api.ts";
import { monthYear, shortDate } from "./model/dates.ts";
import { calendarMonth } from "./model/calendar.ts";
import { filterPriorities, isFiltering } from "./model/filter.ts";
import { ZOOM_ORDER, type View } from "./model/query.ts";
import { moveFrom, timelineWindow } from "./model/timeline.ts";
import { Cards } from "./Cards.tsx";
import { CalendarView } from "./CalendarView.tsx";
import { ListView } from "./ListView.tsx";
import { Avatar, BRAND, HealthDot } from "./parts.tsx";
import { Search } from "./Search.tsx";
import { TimelineView } from "./TimelineView.tsx";
import { useMedia, useScreen } from "./useScreen.ts";

/**
 * The Home screen (ADR 0010). It reads GET /api/priorities once and draws it. It holds no rule and writes nothing.
 * The filter, the search, the zoom, the window, and the view live in the URL query, so a link reopens the same screen.
 */

type Load = { state: "loading" } | { state: "ok"; data: PrioritiesResponse } | { state: "refused"; status: number; reason: string };

async function load(): Promise<Load> {
  const reply = await fetch("/api/priorities", { headers: { accept: "application/json" } });
  if (reply.ok) return { state: "ok", data: (await reply.json()) as PrioritiesResponse };
  const error = (await reply.json().catch(() => ({ reason: reply.statusText }))) as Partial<ApiError>;
  return { state: "refused", status: reply.status, reason: error.reason ?? reply.statusText };
}

function TopBar({ data }: { data?: PrioritiesResponse }) {
  return (
    <header className="top">
      <span className="logo">{BRAND.mark}</span>
      <span className="brand">{BRAND.app}</span>
      {data && <span className="org">/ {data.org.name}</span>}
      {data && <span className="tab">Home</span>}
      {data && (
        <span className="me">
          <Avatar actor={data.me} />
        </span>
      )}
    </header>
  );
}

export function App() {
  const [loaded, setLoaded] = useState<Load>({ state: "loading" });
  useEffect(() => {
    load().then(setLoaded, (e: Error) => setLoaded({ state: "refused", status: 0, reason: e.message }));
  }, []);
  if (loaded.state === "ok") return <Home data={loaded.data} />;
  return (
    <>
      <TopBar />
      {loaded.state === "refused" && (
        <main className="signin">
          {loaded.status === 401 ? (
            <>
              <h1>Sign in to {BRAND.app}</h1>
              <p>{BRAND.app} shows goals only to a signed-in actor.</p>
              <p className="small">Not signed in: {loaded.reason}.</p>
            </>
          ) : (
            <p className="small">{loaded.reason}</p>
          )}
        </main>
      )}
    </>
  );
}

const VIEW_LABELS: Record<View, string> = { timeline: "Timeline", list: "List", calendar: "Calendar" };

function Home({ data }: { data: PrioritiesResponse }) {
  const [screen, change] = useScreen();
  const [hot, setHot] = useState<Health | undefined>();
  const [home, setHome] = useState(0);
  const phone = useMedia("(max-width:760px)");
  const filter = { health: screen.health, q: screen.q };
  const filtering = isFiltering(filter);
  const funded = useMemo(() => filterPriorities(data.funded, { health: screen.health, q: screen.q }), [data, screen.health, screen.q]);
  const backlog = useMemo(() => filterPriorities(data.backlog, { health: screen.health, q: screen.q }), [data, screen.health, screen.q]);
  const all = useMemo(() => [...data.funded, ...data.backlog], [data]);
  const window = useMemo(() => timelineWindow(all, data.today, screen.zoom, screen.from), [all, data.today, screen.zoom, screen.from]);
  const [range, setRange] = useState({ first: window.first, last: window.last });
  const month = useMemo(() => calendarMonth([...funded, ...backlog], data.today, screen.from), [funded, backlog, data.today, screen.from]);
  // On a phone the timeline is hidden, and the List stands in for it.
  const view: View = phone && screen.view === "timeline" ? "list" : screen.view;

  const search = <Search q={screen.q} onSearch={(q) => change({ q }, Boolean(screen.q) === Boolean(q.trim()))} />;
  const tree = { funded, backlog, me: data.me, today: data.today, filtering, selected: screen.health, hot };
  const zoomAt = ZOOM_ORDER.indexOf(screen.zoom);
  const zoomStep = (to: number, label: string, sign: string) => {
    const zoom = ZOOM_ORDER[to];
    return (
      <button type="button" className={`segbtn${zoom ? "" : " off"}`} aria-label={label} aria-disabled={!zoom} onClick={() => zoom && change({ zoom })}>
        {sign}
      </button>
    );
  };
  const step = (direction: -1 | 1) =>
    change({ from: view === "calendar" ? (direction < 0 ? month.earlier : month.later) : moveFrom(range.first, screen.zoom, direction) });
  const today = () => {
    change({ from: undefined });
    setHome((n) => n + 1);
  };

  return (
    <>
      <TopBar data={data} />
      <main>
        <h1>{data.org.name}</h1>
        <Cards data={data} filter={filter} onHealth={(health) => change({ health })} onHot={setHot} />
        <section className="card board" data-view={view}>
          <div className="bhead">
            <h2>Priorities</h2>
            {filtering && (
              <span className="filter">
                {screen.health && (
                  <>
                    <HealthDot health={screen.health} />
                    {screen.health}
                  </>
                )}
                {screen.health && screen.q && " · "}
                {screen.q && `“${screen.q}”`}
                <button type="button" className="clear" onClick={() => change({ health: undefined, q: undefined })}>
                  Show all
                </button>
              </span>
            )}
            <span className="tools">
              <span className="seggroup views" role="group" aria-label="View">
                {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
                  <button key={v} type="button" className={`segbtn fmt fmt-${v}${view === v ? " on" : ""}`} aria-pressed={view === v} onClick={() => change({ view: v })}>
                    {VIEW_LABELS[v]}
                  </button>
                ))}
              </span>
              {view === "timeline" && (
                <span className="seggroup zoom">
                  {zoomStep(zoomAt + 1, "Zoom out", "−")}
                  {zoomStep(zoomAt - 1, "Zoom in", "+")}
                </span>
              )}
              {view !== "list" && (
                <nav className="range" aria-label={view === "calendar" ? "Month" : "Timeline"}>
                  <span className="seggroup">
                    <button type="button" className="segbtn" aria-label="Earlier" onClick={() => step(-1)}>
                      ‹
                    </button>
                    <span className="rangelbl">
                      {view === "calendar" ? (
                        monthYear(month.month)
                      ) : (
                        <>
                          <span className="date">{shortDate(range.first, data.today)}</span> – <span className="date">{shortDate(range.last, data.today)}</span>
                        </>
                      )}
                    </span>
                    <button type="button" className="segbtn" aria-label="Later" onClick={() => step(1)}>
                      ›
                    </button>
                  </span>
                  <button type="button" className="btn" onClick={today}>
                    Today
                  </button>
                </nav>
              )}
            </span>
          </div>
          {view === "timeline" && <TimelineView {...tree} window={window} search={search} home={home} onRange={setRange} />}
          {view === "list" && <ListView {...tree} columns={data.view.columns} search={search} />}
          {view === "calendar" && (
            <CalendarView month={month} today={data.today} search={search} none={filtering && !funded.length && !backlog.length} selected={screen.health} hot={hot} />
          )}
        </section>
      </main>
    </>
  );
}

