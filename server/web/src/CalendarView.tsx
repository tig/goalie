import { useCallback, useRef, useState, type ReactNode } from "react";
import type { Health } from "../../src/api.ts";
import { dateLabel, shortDate } from "./model/dates.ts";
import { dayChips, type CalendarDay, type CalendarMark, type CalendarMonth } from "./model/calendar.ts";
import { HealthDot } from "./parts.tsx";
import { useDismiss } from "./useScreen.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Date Type mark: solid for a committed date, light for Ambition, dotted for Fantasy, hatched red for a slip. */
const markClass = (mark: CalendarMark) => (mark.date.slipDays !== undefined ? "slip" : mark.date.kind === "Promotion Milestone" ? "Committed" : mark.date.kind);

type Lit = { selected?: Health; hot?: Health };

function Chip({ mark, today, lit }: { mark: CalendarMark; today: string; lit: Lit }) {
  const { goal, date } = mark;
  const label = `${dateLabel(date, today)}${date.slipDays !== undefined ? ` · slip ${date.slipDays} days` : ""}`;
  const on = (lit.selected && goal.health === lit.selected) || (lit.hot !== undefined && goal.health === lit.hot);
  return (
    <span className={`chip${on ? " lit" : ""}`} data-health={goal.health ?? ""} title={`${goal.summary} · ${label}`}>
      <HealthDot health={goal.health} />
      <span className="ctitle">{goal.summary}</span>
      <i className={`mk ${markClass(mark)}`} aria-hidden="true" />
      <span className="vh">{label}</span>
    </span>
  );
}

/** "+N": the chips past the first three, in a list that opens on click and closes on Escape or a click outside. */
function More({ marks, today, lit }: { marks: CalendarMark[]; today: string; lit: Lit }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useDismiss(open, [box], useCallback(() => setOpen(false), []));
  return (
    <span className="more" ref={box}>
      <button type="button" className={`morebtn${open ? " on" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        +{marks.length}
      </button>
      {open && (
        <span className="morelist">
          {marks.map((m, i) => (
            <Chip key={i} mark={m} today={today} lit={lit} />
          ))}
        </span>
      )}
    </span>
  );
}

function Day({ d, today, lit }: { d: CalendarDay; today: string; lit: Lit }) {
  const { shown, more } = dayChips(d.marks);
  return (
    <div className={`day${d.inMonth ? "" : " out"}${d.today ? " today" : ""}${d.marks.length ? " has" : ""}`} aria-current={d.today ? "date" : undefined}>
      <span className="dnum">{Number(d.date.slice(8))}</span>
      <span className="dfull">
        {WEEKDAYS[(new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7]} {shortDate(d.date, today)}
      </span>
      {shown.map((m, i) => (
        <Chip key={i} mark={m} today={today} lit={lit} />
      ))}
      {more.length > 0 && <More marks={more} today={today} lit={lit} />}
    </div>
  );
}

function Legend() {
  const item = (mark: string, label: string) => (
    <span className="lg">
      <i className={`mk ${mark}`} />
      {label}
    </span>
  );
  return (
    <div className="legend callegend">
      {item("Committed", "Committed date")}
      {item("Ambition", "Ambition date")}
      {item("Fantasy", "Fantasy date")}
      {item("slip", "Slip")}
    </div>
  );
}

/** The Priorities as a month calendar, Monday first. Each goal date is a chip on its day. */
export function CalendarView({ month, today, search, none, ...lit }: { month: CalendarMonth; today: string; search: ReactNode; none: boolean } & Lit) {
  return (
    <>
      <div className="calbar">
        <div className="corner">{search}</div>
        <Legend />
      </div>
      {none && <p className="note muted">No goals match.</p>}
      <div className="cal">
        <div className="calhead">
          {WEEKDAYS.map((w) => (
            <span key={w} className="dow">
              {w}
            </span>
          ))}
        </div>
        {month.weeks.map((week) => (
          <div key={week[0].date} className="calweek">
            {week.map((d) => (
              <Day key={d.date} d={d} today={today} lit={lit} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
