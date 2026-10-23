import type { ApiGoal, Health, PrioritiesResponse } from "../../src/api.ts";
import { shortDate } from "./model/dates.ts";
import { flatten } from "./model/filter.ts";
import { HEALTHS, type Filter } from "./model/query.ts";
import { HELP } from "./helpText.tsx";
import { Card, HealthDot, look } from "./parts.tsx";

type Props = {
  data: PrioritiesResponse;
  filter: Filter;
  /** Show only one health, or every goal with null. */
  onHealth: (health: Exclude<Health, null> | undefined) => void;
  /** The health whose goals are highlighted while the pointer is on its count or meter (rule H2). */
  onHot: (health: Health | undefined) => void;
};

/** The three summary cards above the board. */
export function Cards({ data, filter, onHealth, onHot }: Props) {
  const { counts, healths, slips, drafts, nextPromotion } = data.summary;
  const today = data.today;
  const pick = (h: Exclude<Health, null>) => onHealth(filter.health === h ? undefined : h);
  const hover = (h: Health) => ({ onPointerEnter: () => onHot(h), onPointerLeave: () => onHot(undefined), onFocus: () => onHot(h), onBlur: () => onHot(undefined) });
  const slip = slips[0];
  const goals = flatten([...data.funded, ...data.backlog].flatMap((p) => p.goals) as ApiGoal[]);
  const slipKind = slip && goals.find((g) => g.id === slip.goal)?.dates.find((d) => d.date === slip.date)?.kind;
  return (
    <section className="cards">
      <Card label="Committed dates" help={HELP.committed}>
        <p className="counts">
          {HEALTHS.map((h) => (
            <button key={h} type="button" className={`count${filter.health === h ? " on" : ""}`} aria-pressed={filter.health === h} onClick={() => pick(h)} {...hover(h)}>
              <HealthDot health={h} />
              {counts[h]} {h}
            </button>
          ))}
        </p>
        <div className="meter">
          {healths.map((h, i) => (
            <span key={i} style={{ background: look(h).bar }} onClick={() => h && pick(h)} {...hover(h)} />
          ))}
        </div>
        {slip ? (
          <p className="note">
            <span className="late">slip {slip.days} days</span> past <span className="date">{slipKind ?? "Committed"} {shortDate(slip.date, today)}</span> · {slip.summary}
          </p>
        ) : (
          <p className="note muted">No slips.</p>
        )}
      </Card>
      <Card label="Drafts" help={HELP.drafts}>
        <p className="big">
          {drafts} <small>waiting on an owner</small>
        </p>
      </Card>
      <Card label="Promotions due" help={HELP.promotions}>
        {nextPromotion ? (
          <>
            <p className="big">
              {nextPromotion.days} days <small>to the Promotion Milestone</small>
            </p>
            <p className="note">
              <span className="date">{shortDate(nextPromotion.date, today)}</span> · {nextPromotion.summary}
            </p>
          </>
        ) : (
          <p className="note muted">No Promotion Milestone is due.</p>
        )}
      </Card>
    </section>
  );
}
