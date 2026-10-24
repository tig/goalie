import { useEffect, useMemo, useState } from "react";
import type { ApiError, Health, PrioritiesResponse } from "../../src/api.ts";
import { monthYear } from "../../src/dates.ts";
import { labelSizers, rangeLabel } from "./model/labels.ts";
import { calendarMonth } from "./model/calendar.ts";
import { filterPriorities, isFiltering } from "./model/filter.ts";
import { ZOOM_ORDER, type View } from "./model/query.ts";
import { moveFrom, timelineWindow } from "./model/timeline.ts";
import { Cards, HealthCounts } from "./Cards.tsx";
import { CalendarView } from "./CalendarView.tsx";
import { ListView } from "./ListView.tsx";
import { Avatar, BRAND } from "./parts.tsx";
import { Search } from "./Search.tsx";
import { TimelineView } from "./TimelineView.tsx";
import { usePhone, useScreen } from "./useScreen.ts";
import { GoalPage } from "./GoalPage.tsx";
import { NewGoal } from "./NewGoal.tsx";
import { WorkPage } from "./WorkPage.tsx";
import { backPath, newGoalPath, workPath } from "./model/route.ts";
import { homeSearch, Link, rememberHome, useRoute } from "./router.tsx";

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

/** The top bar's pages: Home and Work items. The one you are on is filled. */
function TopTabs() {
  const route = useRoute();
  return (
    <nav className="toptabs" aria-label="Pages">
      <Link to={backPath(route.page === "home" ? location.search : homeSearch())} className={`tab${route.page === "work" ? " off" : ""}`}>
        Home
      </Link>
      <Link to={workPath()} className={`tab${route.page === "work" ? "" : " off"}`}>
        Work items
      </Link>
    </nav>
  );
}

function TopBar({ data }: { data?: PrioritiesResponse }) {
  return (
    <header className="top">
      <span className="logo">{BRAND.mark}</span>
      <span className="brand">{BRAND.app}</span>
      {data && <span className="org">/ {data.org.name}</span>}
      {data && <TopTabs />}
      {data && (
        <span className="me">
          <Avatar actor={data.me} />
        </span>
      )}
    </header>
  );
}

/** A 401 reloads the page once, so the server answers with its own sign-in page (review E5). The mark stops a second reload within a minute. */
const RELOADED = "goalie-reloaded";

function reloadOnce(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOADED) ?? 0);
    if (Date.now() - at < 60_000) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** The screen's shape while /api/priorities loads: the cards and the board as soft blocks. */
function Skeleton() {
  return (
    <main aria-busy="true">
      <div className="skel skel-title" />
      <section className="cards">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card">
            <div className="skel skel-line short" />
            <div className="skel skel-line" />
            <div className="skel skel-line" />
          </div>
        ))}
      </section>
      <section className="card board">
        <div className="skel skel-line short" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel skel-row" />
        ))}
      </section>
    </main>
  );
}

export function App() {
  usePhone();
  const [loaded, setLoaded] = useState<Load>({ state: "loading" });
  useEffect(() => {
    load().then(
      (result) => {
        if (result.state === "refused" && result.status === 401 && reloadOnce()) return;
        setLoaded(result);
      },
      (e: Error) => setLoaded({ state: "refused", status: 0, reason: e.message }),
    );
  }, []);
  if (loaded.state === "ok") return <Pages data={loaded.data} />;
  return (
    <>
      <TopBar />
      {loaded.state === "loading" ? (
        <Skeleton />
      ) : (
        <main className="signin">
          <p className="small">{loaded.reason}</p>
        </main>
      )}
    </>
  );
}

const VIEW_LABELS: Record<View, string> = { timeline: "Timeline", list: "List", calendar: "Calendar" };

/** The page the URL names. Home stays the data source for every page until the goal API lands. */
function Pages({ data }: { data: PrioritiesResponse }) {
  const route = useRoute();
  return (
    <>
      <TopBar data={data} />
      {route.page === "goal" ? (
        <GoalPage goalKey={route.key} viewName={data.view.name} />
      ) : route.page === "work" ? (
        <WorkPage data={data} owner={route.owner} />
      ) : route.page === "new" ? (
        <NewGoal key={route.parent ?? ""} parent={route.parent} viewName={data.view.name} />
      ) : (
        <Home data={data} />
      )}
    </>
  );
}

function Home({ data }: { data: PrioritiesResponse }) {
  const [screen, change] = useScreen();
  rememberHome(location.search);
  const [hot, setHot] = useState<Health | undefined>();
  const [home, setHome] = useState(0);
  const phone = usePhone();
  const filter = { health: screen.health, q: screen.q };
  const filtering = isFiltering(filter);
  const funded = useMemo(() => filterPriorities(data.funded, { health: screen.health, q: screen.q }), [data, screen.health, screen.q]);
  const backlog = useMemo(() => filterPriorities(data.backlog, { health: screen.health, q: screen.q }), [data, screen.health, screen.q]);
  const all = useMemo(() => [...data.funded, ...data.backlog], [data]);
  const window = useMemo(() => timelineWindow(all, data.today, screen.zoom, screen.from), [all, data.today, screen.zoom, screen.from]);
  const [range, setRange] = useState({ first: window.first, last: window.last });
  const month = useMemo(() => calendarMonth([...funded, ...backlog], data.today, screen.from), [funded, backlog, data.today, screen.from]);
  const sizers = useMemo(() => labelSizers(data.today), [data.today]);
  // On a phone the timeline is hidden, and the List stands in for it.
  const view: View = phone && screen.view === "timeline" ? "list" : screen.view;

  const search = <Search q={screen.q} health={screen.health} onSearch={(q) => change({ q }, Boolean(screen.q) === Boolean(q.trim()))} onClear={() => change({ health: undefined, q: undefined })} />;
  const tree = { funded, backlog, me: data.me, today: data.today, filtering, selected: screen.health, hot };
  const zoomAt = ZOOM_ORDER.indexOf(screen.zoom);
  const zoomStep = (to: number, label: string, sign: string) => {
    const zoom = ZOOM_ORDER[to];
    return (
      <button type="button" className={`gbtn${zoom ? "" : " off"}`} aria-label={label} aria-disabled={!zoom} onClick={() => zoom && change({ zoom })}>
        {sign}
      </button>
    );
  };
  const step = (direction: -1 | 1) =>
    // The Calendar stops at December 9999 (review Q10).
    !(view === "calendar" && direction > 0 && month.later > "9999-12-31") &&
    change({ from: view === "calendar" ? (direction < 0 ? month.earlier : month.later) : moveFrom(range.first, screen.zoom, direction) });
  const today = () => {
    change({ from: undefined });
    setHome((n) => n + 1);
  };

  return (
    <>
      <main>
        <h1>{data.org.name}</h1>
        <Cards data={data} filter={filter} onHealth={(health) => change({ health })} onHot={setHot} />
        {/* On a phone the health counts also sit above Priorities, so the first screen answers how things stand (review X5, X17). */}
        {phone && (
          <div className="phonesum">
            <HealthCounts data={data} filter={filter} onHealth={(health) => change({ health })} onHot={setHot} />
          </div>
        )}
        <section className="card board" data-view={view}>
          {/* One toolbar for every view (rules 25 to 25c, V1, V4). The left cluster never moves; the right cluster is anchored right. */}
          <div className="toolbar">
            <h2>{data.view.name}</h2>
            <span className="tabs" role="group" aria-label="View">
              {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
                <button key={v} type="button" className={`vtab vtab-${v}${view === v ? " on" : ""}`} aria-pressed={view === v} onClick={() => change({ view: v })}>
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </span>
            {/* On a phone New goal sits on the first row, after the view tabs. */}
            <Link to={newGoalPath()} className="btn primary newgoal mob">
              New goal
            </Link>
            {/* When one row does not fit, a break puts the search box and the right cluster together on a second row (rule 25b). */}
            <span className="tbreak" aria-hidden="true" />
            {search}
            <span className="tright">
              {view === "timeline" && (
                <span className="pgroup zoom">
                  {zoomStep(zoomAt + 1, "Zoom out", "−")}
                  {zoomStep(zoomAt - 1, "Zoom in", "+")}
                </span>
              )}
              {view !== "list" && (
                <nav className="range" aria-label={view === "calendar" ? "Month" : "Timeline"}>
                  <span className="pgroup">
                    <button type="button" className="gbtn" aria-label="Earlier" onClick={() => step(-1)}>
                      ‹
                    </button>
                    <span className="rangelbl">
                      {sizers.map((t) => (
                        <span key={t} className="sizer" aria-hidden="true">
                          {t}
                        </span>
                      ))}
                      <span className="now">{view === "calendar" ? monthYear(month.month) : rangeLabel(range.first, range.last, data.today)}</span>
                    </span>
                    <button type="button" className="gbtn" aria-label="Later" onClick={() => step(1)}>
                      ›
                    </button>
                  </span>
                  <button type="button" className="btn" onClick={today}>
                    Today
                  </button>
                </nav>
              )}
              {/* New goal is in every view, last in the right cluster, so it never moves. */}
              <Link to={newGoalPath()} className="btn primary newgoal desk">
                New goal
              </Link>
            </span>
          </div>
          {view === "timeline" && <TimelineView {...tree} window={window} home={home} onRange={setRange} />}
          {view === "list" && <ListView {...tree} columns={data.view.columns} />}
          {view === "calendar" && <CalendarView month={month} today={data.today} none={filtering && !funded.length && !backlog.length} filtering={filtering} selected={screen.health} hot={hot} />}
        </section>
      </main>
    </>
  );
}

