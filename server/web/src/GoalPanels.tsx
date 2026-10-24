import { useState, type ReactNode } from "react";
import type { ApiViolation, CommandsRequest, FormOptions, GoalFields, GoalPageResponse, Health, PathToGreen, StoredGoal } from "../../src/api.ts";
import { addDays, shortDate } from "../../src/dates.ts";
import { postCommands, useJson } from "./data.ts";
import { closeBatch, fieldsBatch, healthBatch, promoteBatch, pursueBatch, slipBatch, staleMerge } from "./model/commands.ts";
import { eventValue, fieldLabel } from "./model/goalpage.ts";
import { HealthDot } from "./parts.tsx";

/**
 * The goal page's panels (G9 to G19). One panel at a time, in place. Each Save posts one batch; the server checks every rule.
 * A rule broken shows at the field it names. A stale save keeps the typed values and shows the current ones beside them.
 */

export type PanelName = "health" | "slip" | "promote" | "close" | "pursue" | "fields" | "description";

type Saved = { saving: boolean; violations: ApiViolation[]; message?: string; stale?: { current: Record<string, unknown> } };

/** Save a batch. A 200 reloads the page and closes the panel. A 409 rebases the next save on the current version. */
function useSave(goal: StoredGoal, onSaved: () => void) {
  const [state, setState] = useState<Saved>({ saving: false, violations: [] });
  const [base, setBase] = useState(goal.version);
  const save = async (build: (goal: StoredGoal) => CommandsRequest, typed: Record<string, unknown>) => {
    setState((s) => ({ ...s, saving: true }));
    const { body } = await postCommands(build({ ...goal, version: base }));
    if (body.ok) {
      setState({ saving: false, violations: [] });
      onSaved();
    } else if (body.error === "stale") {
      const merged = staleMerge(typed, body.current as unknown as { version: number } & Record<string, unknown>);
      setBase(merged.base_version);
      setState({ saving: false, violations: [], stale: { current: merged.current } });
    } else if (body.error === "invalid") {
      setState((s) => ({ ...s, saving: false, violations: body.violations }));
    } else {
      setState((s) => ({ ...s, saving: false, violations: [], message: body.message }));
    }
  };
  return { ...state, save };
}

/** A rule's message at the field it names. */
function FieldError({ saved, field }: { saved: Saved; field: string }) {
  const here = saved.violations.filter((v) => v.field === field);
  return here.length ? <p className="ferror">{here.map((v) => v.message).join(" ")}</p> : null;
}

/** What the current goal holds for a field the panel changed, after a stale save. */
function Current({ saved, field, data }: { saved: Saved; field: string; data: GoalPageResponse }) {
  if (!saved.stale || !(field in saved.stale.current)) return null;
  return <p className="fcurrent">Now: {eventValue(saved.stale.current[field], field, data.actors)}</p>;
}

function Shell({ title, tone, saved, fields, onSave, onCancel, saveLabel = "Save", children }: { title: string; tone?: string; saved: Saved; fields: string[]; onSave: () => void; onCancel: () => void; saveLabel?: string; children: ReactNode }) {
  const loose = saved.violations.filter((v) => !v.field || !fields.includes(v.field));
  return (
    <section className={`panel${tone ? ` ${tone}` : ""}`} aria-label={title}>
      <h3>{title}</h3>
      {saved.stale && <p className="stale">Someone saved this goal after you opened it.</p>}
      {saved.message && <p className="ferror">{saved.message}</p>}
      {loose.map((v) => (
        <p key={v.rule} className="ferror">
          {v.message}
        </p>
      ))}
      {children}
      <div className="pactions">
        <button type="button" className="btn primary" onClick={onSave} disabled={saved.saving} aria-busy={saved.saving}>
          {saved.saving ? "…" : saveLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function Reason({ value, onChange, saved }: { value: string; onChange: (v: string) => void; saved: Saved }) {
  return (
    <label className="field">
      <span className="flabel">Reason</span>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      <FieldError saved={saved} field="reason" />
    </label>
  );
}

const humans = (data: GoalPageResponse) => Object.values(data.actors).filter((a) => a.kind === "human");

/** The Path to Green editor (G10): steps with an owner and a date, criteria for GREEN, and for YELLOW the trigger for RED. */
function PtgEditor({ value, onChange, health, data, saved }: { value: PathToGreen; onChange: (v: PathToGreen) => void; health: Health; data: GoalPageResponse; saved: Saved }) {
  const step = (i: number, part: Partial<PathToGreen["steps"][number]>) => onChange({ ...value, steps: value.steps.map((s, j) => (j === i ? { ...s, ...part } : s)) });
  return (
    <div className="ptgedit">
      <table className="steps">
        <thead>
          <tr>
            <th>Steps</th>
            <th>Owner</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {value.steps.map((s, i) => (
            <tr key={i}>
              <td>
                <input value={s.text} onChange={(e) => step(i, { text: e.target.value })} aria-label="Step" />
              </td>
              <td>
                <select value={s.owner} onChange={(e) => step(i, { owner: e.target.value })} aria-label="Owner">
                  {humans(data).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input type="date" value={s.date} onChange={(e) => step(i, { date: e.target.value })} aria-label="Date" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="linkbtn" onClick={() => onChange({ ...value, steps: [...value.steps, { text: "", owner: data.me.id, date: data.today }] })}>
        + Step
      </button>
      <FieldError saved={saved} field="path_to_green" />
      <label className="field">
        <span className="flabel">Criteria for GREEN</span>
        <textarea rows={2} value={value.criteria} onChange={(e) => onChange({ ...value, criteria: e.target.value })} />
      </label>
      {health === "YELLOW" && (
        <label className="field">
          <span className="flabel">Trigger for RED</span>
          <textarea rows={2} value={value.trigger ?? ""} onChange={(e) => onChange({ ...value, trigger: e.target.value })} />
          {!value.trigger && <p className="hint">Name what would turn this RED.</p>}
        </label>
      )}
    </div>
  );
}

const emptyPtg = (data: GoalPageResponse): PathToGreen => data.goal.path_to_green ?? { steps: [{ text: "", owner: data.goal.owner, date: data.today }], criteria: "" };

/** G9 to G11: health, with the Path to Green when YELLOW or RED. GREEN from YELLOW or RED asks only for a reason. */
export function HealthPanel({ data, health, onDone }: { data: GoalPageResponse; health: Exclude<Health, null>; onDone: (saved: boolean) => void }) {
  const [ptg, setPtg] = useState(emptyPtg(data));
  const [reason, setReason] = useState("");
  const saved = useSave(data.goal, () => onDone(true));
  const typed = { health, path_to_green: health === "GREEN" ? null : ptg };
  return (
    <Shell
      title={health === "GREEN" ? "GREEN" : `${health} needs a Path to Green (PTG)`}
      tone={health}
      saved={saved}
      fields={["path_to_green", "reason", "health"]}
      onSave={() => saved.save((g) => healthBatch(g, health, ptg, reason), typed)}
      onCancel={() => onDone(false)}
    >
      <Current saved={saved} field="health" data={data} />
      {health !== "GREEN" && <PtgEditor value={ptg} onChange={setPtg} health={health} data={data} saved={saved} />}
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}

/** G13: Record a slip. The original committed date is locked; the changed due date, health, and the Path to Green save together. */
export function SlipPanel({ data, onDone }: { data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const { goal, today } = data;
  const [date, setDate] = useState(goal.changed_due_date ?? goal.due_date ?? today);
  const [health, setHealth] = useState<"YELLOW" | "RED">(goal.health === "RED" ? "RED" : "YELLOW");
  const [ptg, setPtg] = useState(emptyPtg(data));
  const [reason, setReason] = useState("");
  const saved = useSave(goal, () => onDone(true));
  return (
    <Shell
      title="Record a slip"
      saved={saved}
      fields={["changed_due_date", "health", "path_to_green", "reason"]}
      onSave={() => saved.save((g) => slipBatch(g, date, health, ptg, reason), { changed_due_date: date, health, path_to_green: ptg })}
      onCancel={() => onDone(false)}
    >
      <p className="small">A Committed date can't be demoted. A slip is the only way to move it.</p>
      <p className="note">
        Original Committed Date <b className="date">{shortDate(goal.original_committed_date ?? goal.due_date ?? today, today)}</b>
      </p>
      <label className="field">
        <span className="flabel">Changed Due Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <FieldError saved={saved} field="changed_due_date" />
        <Current saved={saved} field="changed_due_date" data={data} />
      </label>
      <span className="flabel">Health</span>
      <span className="hpick small">
        {(["YELLOW", "RED"] as const).map((h) => (
          <button key={h} type="button" className={`hopt ${h}${health === h ? " on" : ""}`} aria-pressed={health === h} onClick={() => setHealth(h)}>
            <HealthDot health={h} word={false} />
            {h}
          </button>
        ))}
      </span>
      <PtgEditor value={ptg} onChange={setPtg} health={health} data={data} saved={saved} />
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}

/** G14: Promote date. Fantasy to Ambition asks for the next Promotion Milestone, filled in. Ambition to Committed shows the plan. */
export function PromotePanel({ data, onDone }: { data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const { goal, today } = data;
  const fantasy = goal.date_type === "Fantasy";
  const [ms, setMs] = useState({ summary: `Commit a date for ${goal.summary}`, due_date: addDays(today, 14), owner: goal.owner });
  const [date, setDate] = useState(goal.due_date ?? today);
  const [reason, setReason] = useState("");
  const saved = useSave(goal, () => onDone(true));
  const pm = data.promotionMilestone;
  return (
    <Shell
      title={`Promote date to ${fantasy ? "Ambition" : "Committed"}`}
      saved={saved}
      fields={["due_date", "promotion_milestone", "plan_maturity", "reason"]}
      saveLabel="Promote date"
      onSave={() => saved.save((g) => promoteBatch(g, fantasy ? ms : null, date, reason), { date_type: fantasy ? "Ambition" : "Committed", due_date: date })}
      onCancel={() => onDone(false)}
    >
      {pm && (pm.openSubGoals > 0 || pm.openWorkItems > 0) && (
        <p className="ferror">
          {pm.id} has {pm.openSubGoals > 0 && `${pm.openSubGoals} sub-goals`}
          {pm.openSubGoals > 0 && pm.openWorkItems > 0 && " and "}
          {pm.openWorkItems > 0 && `${pm.openWorkItems} work items`} not Completed. Promote when the milestone is met.
        </p>
      )}
      <p className="note">
        New Date Type: <b>{fantasy ? "Ambition" : "Committed"}</b>
      </p>
      <label className="field">
        <span className="flabel">Due Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {goal.due_date && date !== goal.due_date && <span className="small">Was {shortDate(goal.due_date, today)}</span>}
        <FieldError saved={saved} field="due_date" />
      </label>
      {fantasy ? (
        <div className="pmbox">
          <p className="small">A Committed date by which this date moves up to Ambition. Health is judged against it.</p>
          <label className="field">
            <span className="flabel">Promotion Milestone</span>
            <input value={ms.summary} onChange={(e) => setMs({ ...ms, summary: e.target.value })} />
          </label>
          <label className="field">
            <span className="flabel">Committed date</span>
            <input type="date" value={ms.due_date} onChange={(e) => setMs({ ...ms, due_date: e.target.value })} />
          </label>
          <label className="field">
            <span className="flabel">Owner</span>
            <select value={ms.owner} onChange={(e) => setMs({ ...ms, owner: e.target.value })}>
              {humans(data).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <FieldError saved={saved} field="promotion_milestone" />
        </div>
      ) : (
        <p className="note">
          Plan {goal.plan ?? "None"} · Plan Maturity <b>{goal.plan_maturity}</b>
          <FieldError saved={saved} field="plan_maturity" />
        </p>
      )}
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}

/** G15: Close goal. Completed or Completed Late is computed by the server and shown, not chosen. */
export function ClosePanel({ data, onDone }: { data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const choices = [data.closesAs, "Did Not Meet", "Deleted"].filter(Boolean) as StoredGoal["state"][];
  const [state, setState] = useState<StoredGoal["state"]>(choices[0]);
  const [reason, setReason] = useState("");
  const saved = useSave(data.goal, () => onDone(true));
  return (
    <Shell title="Close goal" saved={saved} fields={["state", "reason"]} saveLabel="Close goal" onSave={() => saved.save((g) => closeBatch(g, state, reason), { state })} onCancel={() => onDone(false)}>
      <div className="radios" role="radiogroup" aria-label="State">
        {choices.map((c) => (
          <label key={c} className={`radio${state === c ? " on" : ""}`}>
            <input type="radio" name="close" checked={state === c} onChange={() => setState(c)} />
            {c}
          </label>
        ))}
      </div>
      <FieldError saved={saved} field="state" />
      <Current saved={saved} field="state" data={data} />
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}

/** G16: Pursue moves a Backlog goal to In Progress, with a health (GREEN by default). */
export function PursuePanel({ data, onDone }: { data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const [health, setHealth] = useState<Exclude<Health, null>>("GREEN");
  const [reason, setReason] = useState("");
  const saved = useSave(data.goal, () => onDone(true));
  return (
    <Shell title="Pursue" saved={saved} fields={["state", "health", "reason"]} saveLabel="Pursue" onSave={() => saved.save((g) => pursueBatch(g, health, reason), { state: "In Progress", health })} onCancel={() => onDone(false)}>
      <span className="hpick small">
        {(["GREEN", "YELLOW", "RED"] as const).map((h) => (
          <button key={h} type="button" className={`hopt ${h}${health === h ? " on" : ""}`} aria-pressed={health === h} onClick={() => setHealth(h)}>
            <HealthDot health={h} word={false} />
            {h}
          </button>
        ))}
      </span>
      <FieldError saved={saved} field="health" />
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}

/** G18: the description as text, edited in a box with a reason. */
export function DescriptionPanel({ data, onDone }: { data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const [text, setText] = useState(data.goal.description);
  const [reason, setReason] = useState("");
  const saved = useSave(data.goal, () => onDone(true));
  return (
    <Shell title="Description" saved={saved} fields={["description", "reason"]} onSave={() => saved.save((g) => fieldsBatch(g, { description: text }, reason), { description: text })} onCancel={() => onDone(false)}>
      <textarea className="desc" rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="Description" />
      <FieldError saved={saved} field="description" />
      <Current saved={saved} field="description" data={data} />
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}

type Editable = Pick<GoalFields, "type" | "level" | "severity" | "plan" | "plan_maturity" | "origination" | "visibility">;

/** G19: the Fields grid made editable in place, with one reason and Save. Choices come from GET /api/options. */
export function FieldsPanel({ data, onDone }: { data: GoalPageResponse; onDone: (saved: boolean) => void }) {
  const [options] = useJson<FormOptions>("/api/options");
  const g = data.goal;
  const [values, setValues] = useState<Editable>({ type: g.type, level: g.level, severity: g.severity, plan: g.plan, plan_maturity: g.plan_maturity, origination: g.origination, visibility: g.visibility });
  const [reason, setReason] = useState("");
  const saved = useSave(g, () => onDone(true));
  const choices = options.state === "ok" ? options.data.choices : undefined;
  const pick = (field: keyof Editable, list?: readonly string[]) => (
    <label key={field} className="field">
      <span className="flabel">{fieldLabel(field)}</span>
      {list ? (
        <select value={values[field] ?? ""} onChange={(e) => setValues({ ...values, [field]: e.target.value })}>
          {list.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <input value={values[field] ?? ""} onChange={(e) => setValues({ ...values, [field]: e.target.value || (field === "plan" ? null : "") })} />
      )}
      <FieldError saved={saved} field={field} />
      <Current saved={saved} field={field} data={data} />
    </label>
  );
  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== g[k as keyof StoredGoal]));
  return (
    <Shell title="Fields" saved={saved} fields={Object.keys(values).concat("reason")} onSave={() => saved.save((goal) => fieldsBatch(goal, values, reason), changed)} onCancel={() => onDone(false)}>
      <div className="fgrid">
        {pick("type", choices?.type)}
        {pick("level", choices?.level)}
        {pick("severity", choices?.severity)}
        {pick("plan")}
        {pick("plan_maturity", choices?.plan_maturity)}
        {pick("origination", ["New", "Carryover", "Repeating"])}
        {pick("visibility")}
      </div>
      <Reason value={reason} onChange={setReason} saved={saved} />
    </Shell>
  );
}
