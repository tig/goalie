import type { Health, PrioritiesResponse } from "../../src/api.ts";
import { shortDate } from "../../src/dates.ts";
import { slipLabel } from "./model/labels.ts";
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

const controls = ({ filter, onHealth, onHot }: Omit<Props, "data">) => ({
  pick: (h: Exclude<Health, null>) => onHealth(filter.health === h ? undefined : h),
  hover: (h: Health) => ({ onPointerEnter: () => onHot(h), onPointerLeave: () => onHot(undefined), onFocus: () => onHot(h), onBlur: () => onHot(undefined) }),
});

/** Rule 24b: a short SPEC.md §6.1 meaning of each health. The ? help holds the full definitions. */
const MEANS: Record<Exclude<Health, null>, string> = {
  RED: "Not credible without help",
  YELLOW: "Real unknowns, a credible path",
  GREEN: "On track",
};

/** The health counts: controls that highlight and filter (rule 24). The Committed dates card draws them, and so does the line above Priorities on a phone. */
export function HealthCounts({ data, ...props }: Props) {
  const { pick, hover } = controls(props);
  return (
    <p className="counts">
      {HEALTHS.map((h) => (
        <button key={h} type="button" className={`count${props.filter.health === h ? " on" : ""}`} aria-pressed={props.filter.health === h} onClick={() => pick(h)} {...hover(h)}>
          <HealthDot health={h} word={false} />
          <b className="cnum">{data.summary.counts[h]}</b>
          {/* Rule 24b: what the health means leads; the word follows, smaller, as every other screen names it. */}
          <span className="cmean">{MEANS[h]}</span>
          <span className="cword"> · {h}</span>
        </button>
      ))}
    </p>
  );
}

/** The three summary cards above the board. */
export function Cards(props: Props) {
  const { data } = props;
  const { healths, slips, drafts, nextPromotion } = data.summary;
  const today = data.today;
  const { pick, hover } = controls(props);
  const slip = slips[0];
  return (
    <section className="cards">
      <Card label="Committed dates" help={HELP.committed}>
        <HealthCounts {...props} />
        <div className="meter">
          {healths.map((h, i) => (
            <span
              key={i}
              style={{ background: look(h).bar }}
              {...(h
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": h,
                    onClick: () => pick(h),
                    onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(h)),
                  }
                : {})}
              {...hover(h)}
            />
          ))}
        </div>
        {slip ? (
          <p className="note">
            <span className="late">{slipLabel(slip.days)}</span> past <span className="date">{slip.kind} {shortDate(slip.date, today)}</span> · {slip.summary}
          </p>
        ) : (
          <p className="note muted">No slips.</p>
        )}
      </Card>
      <Card label="Drafts" help={HELP.drafts}>
        <p className="big">
          <span className="num">{drafts}</span> <small>waiting on an owner</small>
        </p>
      </Card>
      <Card label="Promotions due" help={HELP.promotions}>
        {nextPromotion ? (
          <>
            <p className="big">
              <span className="num">{nextPromotion.days} days</span> <small>to the Promotion Milestone</small>
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
