import { useCallback, useRef, useState } from "react";
import type { Health } from "../../src/api.ts";
import { monthYear, shortDate, weekday } from "../../src/dates.ts";
import { isLit } from "./model/filter.ts";
import { dateLabel, slipLabel } from "./model/labels.ts";
import { dayChips, type CalendarDay, type CalendarMark, type CalendarMonth } from "./model/calendar.ts";
import { HealthDot, Legend } from "./parts.tsx";
import { useDismiss } from "./useScreen.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Date Type mark: solid for a Committed date, a diamond for a Promotion Milestone, light for Ambition, dotted for Fantasy, hatched red for a slip. */
const markClass = (mark: CalendarMark) => (mark.date.slipDays !== undefined ? "slip" : mark.date.kind === "Promotion Milestone" ? "pm" : mark.date.kind);

type Lit = { selected?: Health; hot?: Health };

function Chip({ mark, today, lit }: { mark: CalendarMark; today: string; lit: Lit }) {
  const { goal, date } = mark;
  const label = `${dateLabel(date, today)}${date.slipDays !== undefined ? ` · ${slipLabel(date.slipDays)}` : ""}`;
  const on = isLit(goal, lit);
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
        {WEEKDAYS[weekday(d.date)]} {shortDate(d.date, today)}
      </span>
      {shown.map((m, i) => (
        <Chip key={i} mark={m} today={today} lit={lit} />
      ))}
      {more.length > 0 && <More marks={more} today={today} lit={lit} />}
    </div>
  );
}


/** The Priorities as a month calendar, Monday first. Each goal date is a chip on its day. */
export function CalendarView({ month, today, none, filtering, ...lit }: { month: CalendarMonth; today: string; none: boolean; filtering: boolean } & Lit) {
  const empty = !month.weeks.some((w) => w.some((d) => d.inMonth && d.marks.length));
  return (
    <>
      {none && <p className="note muted">No goals match.</p>}
      {/* On a phone the Calendar lists only days with dates, so an empty month says so. */}
      {!none && empty && <p className="note muted calempty">{filtering ? "No goals match." : `No dates in ${monthYear(month.month)}.`}</p>}
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
      <Legend kind="calendar" />
    </>
  );
}
