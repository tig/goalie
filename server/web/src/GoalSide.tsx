import { useState, type ReactNode } from "react";
import type { FormOptions, GoalFields, GoalPageResponse, Health } from "../../src/api.ts";
import { postCommands, useJson } from "./data.ts";
import { fieldsBatch } from "./model/commands.ts";
import { eventValue, fieldLabel } from "./model/goalpage.ts";
import { healthWord, slipLabel } from "./model/labels.ts";
import { backPath, goalPath } from "./model/route.ts";
import { Avatar, HealthDot } from "./parts.tsx";
import { homeSearch, Link } from "./router.tsx";

/**
 * Goal page v2 (design GP2-1, GP2-10 to GP2-13; rules GL2, GL6, GL7): the breadcrumb and the properties column.
 * The page reads who may change the goal from the server (mayChange); a one-field property edits in place with a reason line and Save.
 */

const yearDate = (date: string) => eventValue(date, "due_date");

/** GP2-1: Priority, each goal above (top first), this goal. A middle step is cut with an ellipsis and keeps its whole summary in its tooltip. */
export function Crumbs({ data }: { data: GoalPageResponse }) {
  const above = [...data.above].reverse();
  const nearest = above[above.length - 1];
  return (
    <nav className="crumbs" aria-label="Where this goal sits">
      {/* On a phone only the nearest goal above shows, as "‹ <summary>" (GP2-14). */}
      <span className="crumbs-full">
        {data.priority && (
          <>
            <Link to={backPath(homeSearch())} className="crumb end">
              Priority {data.priority.rank} {data.priority.title}
            </Link>
            <span className="sep">›</span>
          </>
        )}
        {above.map((g) => (
          <span key={g.id} className="crumbstep">
            <Link to={goalPath(g.id)} className="crumb mid" aria-label={g.summary}>
              <span title={g.summary}>{g.summary}</span>
            </Link>
            <span className="sep">›</span>
          </span>
        ))}
        <span className="crumb end here" aria-current="page">
          {data.goal.summary}
        </span>
      </span>
      <span className="crumbs-phone">
        {nearest ? <Link to={goalPath(nearest.id)}>‹ {nearest.summary}</Link> : <Link to={backPath(homeSearch())}>‹ {data.priority ? `Priority ${data.priority.rank} ${data.priority.title}` : "Priorities"}</Link>}
      </span>
    </nav>
  );
}

type Edit = { field: keyof GoalFields; initial: unknown; input: (value: unknown, set: (v: unknown) => void, options: FormOptions | null) => ReactNode };

/** One property row: a 12 px label and its value. With `edit`, an owner can change it in place, with one reason line and Save. */
function Prop({ label, children, edit, data, reload, className }: { label: string; children: ReactNode; edit?: Edit; data: GoalPageResponse; reload: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`prop${className ? ` ${className}` : ""}`}>
      <span className="plabel">{label}</span>
      <span className="pvalue">
        {children}
        {edit && data.mayChange && !open && (
          <button type="button" className="linkbtn pedit" aria-label={`Change ${label}`} onClick={() => setOpen(true)}>
            Change
          </button>
        )}
      </span>
      {open && edit && (
        <PropForm
          edit={edit}
          data={data}
          onDone={(saved) => {
            setOpen(false);
            if (saved) reload();
          }}
        />
      )}
    </div>
  );
}

/** The in-place form: the field, one reason line, Save. The server checks every rule; a refusal shows here in its words. */
function PropForm({ edit, data, onDone }: { edit: Edit; data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const [value, setValue] = useState<unknown>(edit.initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [options] = useJson<FormOptions>("/api/options");
  const save = async () => {
    setSaving(true);
    const { body } = await postCommands(fieldsBatch(data.goal, { [edit.field]: value } as Partial<GoalFields>, reason));
    setSaving(false);
    if (body.ok) onDone(true);
    else setError(body.error === "invalid" ? body.violations.map((v) => v.message).join(" ") : body.error === "stale" ? "Someone saved this goal after you opened it. Reload the page." : body.message);
  };
  return (
    <div className="pform">
      {edit.input(value, setValue, options.state === "ok" ? options.data : null)}
      <input value={reason} placeholder="Reason" aria-label="Reason" onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      {error && <p className="ferror">{error}</p>}
      <span className="pactions">
        <button type="button" className="btn" onClick={() => onDone(false)}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={saving} aria-busy={saving}>
          Save
        </button>
      </span>
    </div>
  );
}

const pick = (list: readonly string[], field: string) => (value: unknown, set: (v: unknown) => void) => (
  <select value={String(value ?? "")} aria-label={fieldLabel(field)} onChange={(e) => set(e.target.value)}>
    {list.map((c) => (
      <option key={c} value={c}>
        {eventValue(c, field)}
      </option>
    ))}
  </select>
);

type Act = { name: "health" | "pursue" | "slip" | "promote" | "close"; health?: Exclude<Health, null> };

/** GP2-10 to GP2-13: the properties column. Actions that need more than one field open their panel in the main column (`onAct`). */
export function Props({ data, reload, onAct, chosen, dateBar }: { data: GoalPageResponse; reload: () => void; onAct: (a: Act | null) => void; chosen?: Health; dateBar: ReactNode }) {
  const { goal } = data;
  const may = data.mayChange;
  const open = goal.state === "In Progress";
  const closable = goal.state === "In Progress" || goal.state === "Backlog";
  const [judged, ...others] = data.dates;
  const pm = data.promotionMilestone;
  const owner = data.actors[goal.owner] ?? { id: goal.owner, name: goal.owner };
  const humans = Object.values(data.actors).filter((a) => a.kind === "human");
  const [all, setAll] = useState(false);
  const plan = goal.plan ? /^https?:\/\//.test(goal.plan) ? <a href={goal.plan} target="_blank" rel="noreferrer">{goal.plan}</a> : goal.plan : <span className="muted">None</span>;
  return (
    <div className="props">
      <Prop label="Health" data={data} reload={reload} className="phealth">
        {open && may ? (
          <span className="hpick" role="group" aria-label="Health">
            {(["GREEN", "YELLOW", "RED"] as const).map((h) => (
              <button
                key={h}
                type="button"
                className={`hopt ${h}${goal.health === h && !chosen ? " on" : ""}${chosen === h ? " chosen" : ""}`}
                aria-pressed={goal.health === h}
                onClick={() => onAct(h === goal.health ? null : { name: "health", health: h })}
              >
                <HealthDot health={h} word="beside" />
                {healthWord(h)}
              </button>
            ))}
          </span>
        ) : open ? (
          <span className="hread">
            <HealthDot health={goal.health} word="shown" />
          </span>
        ) : (
          <span className="muted">None while {goal.state}</span>
        )}
      </Prop>
      {judged && (
        <Prop label="Health judged on" data={data} reload={reload} className="pjudged">
          <span>
            <b className="date">{yearDate(judged.date)}</b> {judged.kind === "Promotion Milestone" ? "Committed · Promotion Milestone" : judged.kind}
            {judged.slipDays !== undefined && <span className="late"> · {slipLabel(judged.slipDays)}</span>}
          </span>
          {dateBar}
          {pm && judged.kind === "Promotion Milestone" && (
            <Link to={goalPath(pm.id)} className="pbacked">
              ◆ backed by {pm.id} <HealthDot health={pm.health} word={false} /> {pm.summary}
            </Link>
          )}
          {others.map((d) => (
            <span key={d.kind} className="muted pother">
              {yearDate(d.date)} {d.kind} · this goal's date
            </span>
          ))}
          {data.inherited && <span className="muted pother">The parent's date</span>}
          {may && (
            <span className="pacts">
              {open && goal.date_type === "Committed" && (
                <button type="button" className="linkbtn" onClick={() => onAct({ name: "slip" })}>
                  Record a slip
                </button>
              )}
              {closable && (goal.date_type === "Ambition" || goal.date_type === "Fantasy") && (
                <button type="button" className="linkbtn" onClick={() => onAct({ name: "promote" })}>
                  Promote date
                </button>
              )}
            </span>
          )}
        </Prop>
      )}
      <Prop label="State" data={data} reload={reload}>
        <span>{goal.state}</span>
        {may && goal.state === "Backlog" && (
          <button type="button" className="linkbtn" onClick={() => onAct({ name: "pursue" })}>
            Pursue
          </button>
        )}
        {may && closable && (
          <button type="button" className="linkbtn" onClick={() => onAct({ name: "close" })}>
            Close goal
          </button>
        )}
      </Prop>
      <Prop label="Owner" data={data} reload={reload} edit={{ field: "owner", initial: goal.owner, input: pick(humans.map((h) => h.id), "owner") }}>
        <span className="powner">
          <Avatar actor={owner} mine={owner.id === data.me.id} /> {owner.name}
        </span>
      </Prop>
      <Prop
        label="Priority"
        data={data}
        reload={reload}
        edit={{
          field: "priority",
          initial: goal.priority ?? "",
          input: (value, set, options) => (
            <select value={String(value ?? "")} aria-label="Priority" onChange={(e) => set(e.target.value || null)}>
              <option value="">None</option>
              {(options?.priorities ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rank} {p.title}
                </option>
              ))}
            </select>
          ),
        }}
      >
        {data.priority ? (
          <Link to={backPath(homeSearch())}>
            {data.priority.rank} {data.priority.title}
          </Link>
        ) : (
          <span className="muted">None</span>
        )}
      </Prop>
      <Prop label="Plan" data={data} reload={reload} edit={{ field: "plan", initial: goal.plan ?? "", input: (value, set) => <input value={String(value ?? "")} aria-label="Plan" placeholder="A link to the plan" onChange={(e) => set(e.target.value || null)} /> }}>
        {plan}
      </Prop>
      <Prop label="Plan Maturity" data={data} reload={reload} edit={{ field: "plan_maturity", initial: goal.plan_maturity, input: (v, s, o) => pick(o?.choices.plan_maturity ?? ["Watercolor", "Crayon", "Pencil"], "plan_maturity")(v, s) }}>
        {goal.plan_maturity}
      </Prop>
      {/* GP2-14: under 1100 px the rest folds behind "All properties". */}
      <button type="button" className="linkbtn allprops" aria-expanded={all} onClick={() => setAll(!all)}>
        All properties
      </button>
      <div className={`propsrest${all ? " shown" : ""}`}>
        <Family data={data} />
        <MoreProps data={data} reload={reload} />
      </div>
    </div>
  );
}

/** GP2-12: where this goal sits, from the parent down: the parent, this goal (bold, with its health bar), its sub-goals, and its siblings as one line. */
function Family({ data }: { data: GoalPageResponse }) {
  const { goal } = data;
  const siblings = data.siblings;
  const backs = data.backs;
  const [more, setMore] = useState(false);
  return (
    <div className="family">
      <span className="plabel">Family</span>
      <ul className="ftree">
        {data.parent && (
          <li>
            <Link to={goalPath(data.parent.id)}>{data.parent.summary}</Link>
          </li>
        )}
        <li className={data.parent ? "fchild" : ""}>
          <span className="fthis" style={{ boxShadow: goal.health ? `inset 3px 0 0 var(--${goal.health.toLowerCase()})` : undefined }}>
            <HealthDot health={goal.state === "In Progress" ? goal.health : null} word={false} /> <b>{goal.summary}</b> <span className="muted">(this goal)</span>
          </span>
          {backs && <span className="fbacks small">◆ backs {backs.id}'s date</span>}
          {data.subGoals.length > 0 && (
            <ul>
              {data.subGoals.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link to={goalPath(c.id)}>
                    <HealthDot health={c.state === "In Progress" ? c.health : null} word={false} /> {c.summary}
                  </Link>
                </li>
              ))}
              {data.subGoals.length > 5 && <li className="muted">{data.subGoals.length - 5} more sub-goals</li>}
            </ul>
          )}
        </li>
        {siblings.length > 0 && (
          <li className="fchild">
            {more ? (
              siblings.map((s) => (
                <span key={s.id} className="fsib">
                  <Link to={goalPath(s.id)}>{s.summary}</Link>
                </span>
              ))
            ) : (
              <button type="button" className="linkbtn" onClick={() => setMore(true)}>
                {siblings.length} more sub-goal{siblings.length === 1 ? "" : "s"}
              </button>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

/** GP2-13: the rest, folded, with three values shown when closed. */
function MoreProps({ data, reload }: { data: GoalPageResponse; reload: () => void }) {
  const { goal } = data;
  const [open, setOpen] = useState(false);
  const none = <span className="muted">None</span>;
  const rows: [string, string, ReactNode, Edit | undefined][] = [
    ["type", fieldLabel("type"), goal.type, { field: "type", initial: goal.type, input: (v, s, o) => pick(o?.choices.type ?? [goal.type], "type")(v, s) }],
    ["level", fieldLabel("level"), goal.level, { field: "level", initial: goal.level, input: (v, s, o) => pick(o?.choices.level ?? [goal.level], "level")(v, s) }],
    ["org_unit_name", fieldLabel("org_unit"), data.orgUnit.name, undefined],
    ["severity", fieldLabel("severity"), goal.severity, { field: "severity", initial: goal.severity, input: (v, s, o) => pick(o?.choices.severity ?? [goal.severity], "severity")(v, s) }],
    ["origination", fieldLabel("origination"), goal.origination, { field: "origination", initial: goal.origination, input: pick(["New", "Carryover", "Repeating"], "origination") }],
    ["visibility", fieldLabel("visibility"), eventValue(goal.visibility, "visibility"), undefined],
    ["work_product", fieldLabel("work_product"), goal.work_product?.length ? goal.work_product.map((w) => Object.values(w).join(" ")).join(", ") : none, undefined],
    ["original_committed_date", fieldLabel("original_committed_date"), goal.original_committed_date ? yearDate(goal.original_committed_date) : none, undefined],
    ["changed_due_date", fieldLabel("changed_due_date"), goal.changed_due_date ? yearDate(goal.changed_due_date) : none, undefined],
  ];
  return (
    <div className="moreprops">
      <button type="button" className="mphead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="plabel">More properties</span> <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        rows.map(([key, label, value, edit]) => (
          <Prop key={key} label={label} data={data} reload={reload} edit={edit}>
            {value}
          </Prop>
        ))
      ) : (
        <p className="small muted">
          {rows
            .slice(0, 3)
            .map(([, label, value]) => `${label} ${typeof value === "string" ? value : ""}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
