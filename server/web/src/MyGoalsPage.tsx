import type { GoalHit, MyGoalsResponse } from "../../src/api.ts";
import { useJson } from "./data.ts";
import { cell } from "./ListView.tsx";
import { HealthDot } from "./parts.tsx";
import { encodeFocus } from "./model/feedback.ts";
import { nameHover } from "./model/goalpage.ts";
import { goalPath } from "./model/route.ts";
import { Link } from "./router.tsx";

/** A column's class name. */
const slug = (column: string) => column.replace(/ /g, "-").toLowerCase();

/** The Priority a goal serves, or "No priority" muted (SPEC.md §6.1 priority, #71). */
export function PriorityName({ title }: { title: string | null }) {
  return title === null ? <span className="muted">No priority</span> : <>{title}</>;
}

/**
 * The My goals view (SPEC.md §8.2): every open goal the signed-in actor owns, with or without a Priority (#71).
 * It reads GET /api/my-goals. The server keeps the saved definition: the selection, the sort, and the columns.
 */
export function MyGoalsPage() {
  const [loaded] = useJson<MyGoalsResponse>("/api/my-goals");
  return (
    <main className="mygoals">
      <h1>My goals</h1>
      {loaded.state === "loading" && <div className="skel skel-row" />}
      {loaded.state === "refused" && <p className="note">{loaded.reason}</p>}
      {loaded.state === "ok" && <MyGoalsList view={loaded.data} />}
    </main>
  );
}

function MyGoalsList({ view }: { view: MyGoalsResponse }) {
  const cols = view.view.columns.filter((c) => c !== "Summary");
  if (!view.goals.length) return <p className="muted note">You own no open goals.</p>;
  return (
    <section className="card mlist">
      <div className="mrow mhead small muted">
        <span>Goal</span>
        {cols.map((c) => (
          <span key={c} className={`c-${slug(c)}`}>
            {c === "PTG" ? "Path to Green (PTG)" : c}
          </span>
        ))}
      </div>
      {view.goals.map((g) => (
        <div key={g.id} className="mrow" data-focus={encodeFocus({ kind: "goal", id: g.id, label: g.summary })}>
          <Link to={goalPath(g.id)} className="mtitle" title={nameHover(g.id, g.summary)}>
            {g.summary}
          </Link>
          {cols.map((c) => (
            <span key={c} className={`cell c-${slug(c)}`}>
              {c === "Priority" ? <PriorityName title={g.priority} /> : c === "State" ? g.state : cell(c, { ...g, inherited: [] }, view.today)}
            </span>
          ))}
        </div>
      ))}
    </section>
  );
}

/** Search hits the view does not draw, under the board (#71): each with its owner, state, and Priority. */
export function NotInView({ name, hits }: { name: string; hits: GoalHit[] }) {
  if (!hits.length) return null;
  return (
    <section className="card mlist notinview" aria-label={`Not in ${name}`}>
      <h2>Not in {name}</h2>
      {hits.map((g) => (
        <div key={g.id} className="mrow hit" data-focus={encodeFocus({ kind: "goal", id: g.id, label: g.summary })}>
          <Link to={goalPath(g.id)} className="mtitle" title={nameHover(g.id, g.summary)}>
            {g.summary}
          </Link>
          <span className="cell c-owner">{g.owner.name}</span>
          <span className="cell c-priority">
            <PriorityName title={g.priority} />
          </span>
          <span className="cell c-state">{g.state}</span>
          <span className="cell c-health">
            <HealthDot health={g.health} word="shown" />
          </span>
        </div>
      ))}
    </section>
  );
}
