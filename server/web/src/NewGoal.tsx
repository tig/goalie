import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiActor, ApiViolation, CommandsResponse, FormOptions, Health, PathToGreen, PlanMaturity } from "../../src/api.ts";
import { addDays, shortDate } from "../../src/dates.ts";
import { postCommands, useJson } from "./data.ts";
import { PtgFields } from "./GoalPanels.tsx";
import { stillMissing } from "./model/labels.ts";
import { commandPlace, createBatch, goalTypes, refusals, type NewGoalForm, type NewMilestone, type SubGoalRow } from "./model/commands.ts";
import { eventValue, fieldLabel } from "./model/goalpage.ts";
import { backPath, goalPath } from "./model/route.ts";
import { Avatar, HealthDot, Help } from "./parts.tsx";
import { homeSearch, Link, navigate } from "./router.tsx";

/**
 * New goal (docs/design/goal-page-and-create.md, N1 to N16). One page, five numbered cards, and a rail.
 * The browser checks no rule: the rail asks the server with `check: true` 400 ms after the last change, and shows its answer.
 */

type DateType = NewGoalForm["date_type"];

const DATE_TYPES: { type: DateType; meaning: string }[] = [
  { type: "Committed", meaning: "A promise. Others plan around it." },
  { type: "Ambition", meaning: "A stretch. Not a promise." },
  { type: "Fantasy", meaning: "A wish. Fine as a starting point." },
];

const HEALTHS: { health: Exclude<Health, null>; meaning: string }[] = [
  { health: "GREEN", meaning: "On track. The risks are understood and the owner believes the date will be hit." },
  { health: "YELLOW", meaning: "Real unknowns or blockers, with a credible path to the date." },
  { health: "RED", meaning: "The date is not credible without help, or there is no Path to Green." },
];

const MATURITY: Record<PlanMaturity, string> = {
  Watercolor: "Broad strokes, soft edges.",
  Crayon: "Main parts clear, details flexible.",
  Pencil: "Precise and ready to execute.",
};

/** The §6.1 parts of a description (N3). Each chip writes its heading into the description and turns green once the heading is there. */
const PARTS = ["Key results", "Metrics", "Why it matters", "Who shares it"];

const CHECK_DELAY = 400;

/** "1 sub-goal", "2 sub-goals". */
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The §6.1 meaning of each field the More fields row offers (N8). */
const MEANINGS: Record<string, string> = {
  type: "What kind of goal it is, for example a launch or a metric.",
  severity: "How much it matters if the goal is missed. sev1 matters most.",
  state: "Where the goal is in its life: Backlog, then In Progress.",
  origination: "Whether the goal is new, carried over from the last period, or repeating.",
  level: "The level of the org the goal belongs to.",
  visibility: "Who can see the goal.",
  work_product: "Links to what the goal produces, such as a repo or a page.",
};

export function NewGoal({ parent, viewName }: { parent?: string; viewName: string }) {
  const [options] = useJson<FormOptions>("/api/options");
  const back = (
    <Link to={parent ? goalPath(parent) : backPath(homeSearch())} className="back">
      ‹ {parent ?? viewName}
    </Link>
  );
  if (options.state !== "ok") {
    return (
      <main className="newgoal" aria-busy={options.state === "loading"}>
        {back}
        {options.state === "refused" ? <p className="note">{options.reason}</p> : <div className="skel skel-title" />}
      </main>
    );
  }
  return <Form options={options.data} parent={parent} back={back} />;
}

function Form({ options, parent, back }: { options: FormOptions; parent?: string; back: ReactNode }) {
  const { me, today } = options;
  const humans = options.actors.filter((a) => a.kind === "human");
  const [form, setForm] = useState<NewGoalForm>({
    summary: "",
    description: options.defaults.description,
    owner: me.id,
    priority: null,
    due_date: "",
    date_type: "" as DateType,
    health: null,
    path_to_green: { steps: [{ text: "", owner: me.id, date: "" }], criteria: "" },
    plan: null,
    plan_maturity: options.defaults.plan_maturity,
    more: {
      type: options.defaults.type,
      severity: options.defaults.severity,
      state: options.defaults.state,
      origination: options.defaults.origination,
      level: options.defaults.level,
      visibility: options.defaults.visibility,
      org_unit: options.defaults.org_unit,
    },
    milestone: null,
    milestoneType: goalTypes(options).milestone,
    parent: parent ?? null,
    subGoals: [],
    workItems: [],
  });
  const set = (part: Partial<NewGoalForm>) => setForm((f) => ({ ...f, ...part }));
  const asked = Boolean(form.summary.trim() && form.owner && form.due_date && form.date_type);
  const uncommitted = form.date_type === "Ambition" || form.date_type === "Fantasy";

  // Ambition or Fantasy opens the Promotion Milestone, filled in from the summary until it is edited (N6).
  const milestone = form.milestone ?? { summary: `Commit a date for ${form.summary || "this goal"}`, due_date: addDays(today, 14), owner: form.owner };
  const sent = useMemo(() => ({ ...form, milestone: uncommitted ? milestone : null }), [form, uncommitted, milestone.summary, milestone.due_date, milestone.owner]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rail asks the server 400 ms after the last change (plan: Checking before Create).
  const [check, setCheck] = useState<CommandsResponse | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!asked) return;
    let live = true;
    const timer = setTimeout(async () => {
      setChecking(true);
      const { body } = await postCommands(createBatch(sent, true));
      if (live) {
        setCheck(body);
        setChecking(false);
      }
    }, CHECK_DELAY);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [sent, asked]);

  const [result, setResult] = useState<CommandsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = result ?? (asked ? check : null);
  const refused = shown && !shown.ok ? shown : null;
  const batch = createBatch(sent);
  const every = refused ? refusals(refused, batch) : [];
  const violations: ApiViolation[] = every;
  const at = (where: string, field?: string) =>
    every
      .filter((v) => v.place === where && (field ? v.field === field : !v.field || !KNOWN.includes(v.field)))
      .map((v, i) => (
        <p key={i} className="ferror">
          {v.message}
        </p>
      ));
  // The keys come from the server's answer; before it, from nextGoalKeys in create order (milestones are made first).
  const order = batch.commands.flatMap((c) => (c.op === "create" && c.kind === "goal" && c.ref ? [c.ref] : []));
  const keyOf = (ref: string) => (shown?.ok ? shown.ids[ref as `$${string}`] : options.nextGoalKeys[order.indexOf(ref as `$${string}`)]);
  const key = keyOf("$goal");
  const sharing = form.subGoals.filter((r) => !r.date).length;

  const typed = form.summary || form.description || form.subGoals.length > 0;
  const leave = () => !typed || confirm("Leave without creating?");
  useEffect(() => {
    if (!typed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [typed]);

  const create = async () => {
    if (!asked) {
      setResult({ ok: false, at: 0, error: "invalid", violations: [{ rule: "asked", message: stillMissing(form), field: "summary" }] });
      document.getElementById("ng-1")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setSaving(true);
    const { body } = await postCommands(createBatch(sent));
    setSaving(false);
    if (body.ok) {
      removeEventListener("beforeunload", () => undefined);
      navigate(goalPath(body.ids["$goal"]));
      return;
    }
    setResult(body);
    const where = commandPlace(createBatch(sent), body.at);
    document.getElementById(where === "goal" ? "ng-1" : where.startsWith("sub") ? "ng-4" : where.startsWith("workitem") ? "ng-5" : "ng-3")?.scrollIntoView({ behavior: "smooth" });
  };
  // Typing again clears the last refusal; the rail's check takes over.
  const [seen, setSeen] = useState(form);
  if (seen !== form) {
    setSeen(form);
    if (result) setResult(null);
  }

  return (
    <main className="newgoal">
      {back}
      <h1>New goal</h1>
      {/* On a phone the rail's checks are a one-line count at the top (N15). */}
      {refused && (
        <button type="button" className="linkbtn ngtopcount" onClick={() => document.querySelector(".ngmake")?.scrollIntoView({ behavior: "smooth" })}>
          {count(violations.length, "check")} to fix
        </button>
      )}
      <div className="nglayout">
        <div className="ngform">
          <section className="card ngcard" id="ng-1">
            <h2>
              <span className="ngnum">1</span> Summary and description
            </h2>
            <label className="field">
              <span className="flabel">Summary</span>
              <input value={form.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="Start with a verb: Launch, Reduce, Increase" autoFocus />
              {at("goal", "summary")}
            </label>
            <label className="field">
              <span className="flabel">Description</span>
              <textarea rows={6} value={form.description} onChange={(e) => set({ description: e.target.value })} />
              {at("goal", "description")}
            </label>
            <p className="chips">
              {PARTS.map((p) => {
                const written = form.description.includes(`${p}:`);
                return (
                  <button key={p} type="button" className={`fchip${written ? " on" : ""}`} aria-pressed={written} onClick={() => !written && set({ description: `${form.description}${form.description && !form.description.endsWith("\n") ? "\n" : ""}${p}: ` })}>
                    {p}
                  </button>
                );
              })}
            </p>
            {at("goal")}
          </section>

          <section className="card ngcard" id="ng-2">
            <h2>
              <span className="ngnum">2</span> Owner and Priority
            </h2>
            <label className="field">
              <span className="flabel">Owner</span>
              <select value={form.owner} onChange={(e) => set({ owner: e.target.value })}>
                {humans.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {at("goal", "owner")}
            </label>
            <span className="flabel">Priority</span>
            {/* Picking a Priority maps the goal to it. Creating a goal never re-ranks (N4). */}
            <div className="prows" role="radiogroup" aria-label="Priority">
              {[{ id: null, rank: null, title: "None" }, ...options.priorities].map((p) => (
                <label key={p.id ?? "none"} className={`prow${form.priority === p.id ? " on" : ""}`}>
                  <input type="radio" name="priority" checked={form.priority === p.id} onChange={() => set({ priority: p.id })} />
                  <span className="rnum">{p.rank ?? ""}</span>
                  <span className={p.id ? "" : "muted"}>{p.title}</span>
                </label>
              ))}
            </div>
            {at("goal", "priority")}
            {parent && (
              <p className="note">
                {fieldLabel("parent")} <b>{parent}</b>
              </p>
            )}
          </section>

          <section className="card ngcard" id="ng-3">
            <h2>
              <span className="ngnum">3</span> Date
            </h2>
            <div className="addgrid">
              <label className="field">
                <span className="flabel">Due Date</span>
                <input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} />
                {form.due_date && <span className="small">{shortDate(form.due_date, "0000")}</span>}
                {at("goal", "due_date")}
              </label>
              <div className="field">
                <span className="flabel">Date Type</span>
                <span className="hpick">
                  {DATE_TYPES.map((d) => (
                    <button key={d.type} type="button" className={`hopt dt${form.date_type === d.type ? " on" : ""}`} aria-pressed={form.date_type === d.type} onClick={() => set({ date_type: d.type })}>
                      {d.type}
                    </button>
                  ))}
                </span>
                {form.date_type && <span className="small">{DATE_TYPES.find((d) => d.type === form.date_type)?.meaning}</span>}
                {at("goal", "date_type")}
              </div>
            </div>
            {uncommitted && (
              <MilestoneBox value={milestone} onChange={(milestone) => set({ milestone })} step={form.date_type === "Fantasy" ? "Ambition" : "Committed"} humans={humans}>
                {at("milestone")}
                {at("goal", "promotion_milestone")}
              </MilestoneBox>
            )}
            {form.date_type === "Committed" && (
              <div className="planbox">
                <label className="field">
                  <span className="flabel">Plan</span>
                  <input value={form.plan ?? ""} placeholder="None" onChange={(e) => set({ plan: e.target.value || null })} />
                </label>
                <span className="flabel">Plan Maturity</span>
                <span className="hpick">
                  {options.choices.plan_maturity.map((m) => (
                    <button key={m} type="button" className={`hopt dt${form.plan_maturity === m ? " on" : ""}`} aria-pressed={form.plan_maturity === m} onClick={() => set({ plan_maturity: m })}>
                      {m}
                    </button>
                  ))}
                </span>
                <p className="small">{MATURITY[form.plan_maturity]}</p>
                <p className="small">No plan yet? Choose Ambition now, and commit when the plan is at Pencil.</p>
                {every.some((v) => v.place === "goal" && v.field === "plan_maturity") && (
                  <>
                    {at("goal", "plan_maturity")}
                    <button type="button" className="linkbtn" onClick={() => set({ date_type: "Ambition" })}>
                      Use Ambition with a Promotion Milestone instead
                    </button>
                  </>
                )}
              </div>
            )}
            <span className="flabel">Health</span>
            <span className="hpick">
              {HEALTHS.map((h) => (
                <button key={h.health} type="button" className={`hopt ${h.health}${form.health === h.health ? " on" : ""}`} aria-pressed={form.health === h.health} onClick={() => set({ health: h.health })}>
                  <HealthDot health={h.health} word={false} />
                  {h.health}
                </button>
              ))}
            </span>
            {form.health && <p className="small">{HEALTHS.find((h) => h.health === form.health)?.meaning}</p>}
            {at("goal", "health")}
            {(form.health === "YELLOW" || form.health === "RED") && form.path_to_green && (
              <PtgFields
                value={form.path_to_green}
                onChange={(path_to_green: PathToGreen) => set({ path_to_green })}
                health={form.health}
                people={humans}
                me={me.id}
                error={at("goal", "path_to_green")}
              />
            )}
          </section>

          <section className="card ngcard ngmore">
            <h2>More fields</h2>
            {/* Every other §6.1 field shows its default in one row of chips, each a small picker with its meaning (N8). */}
            <div className="mchips">
              {(
                [
                  ["type", options.choices.type],
                  ["severity", options.choices.severity],
                  ["state", ["In Progress", "Backlog"]],
                  ["origination", ["New", "Carryover", "Repeating"]],
                  ["level", options.choices.level],
                  ["visibility", [form.more.visibility]],
                ] as const
              ).map(([field, list]) => (
                <span key={field} className="mchip">
                  <label>
                    <span className="mlabel">{fieldLabel(field)}</span>
                    <select value={form.more[field]} onChange={(e) => set({ more: { ...form.more, [field]: e.target.value } })}>
                      {list.map((c) => (
                        <option key={c} value={c}>
                          {eventValue(c, field)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Help label={fieldLabel(field)}>
                    <div>{MEANINGS[field]}</div>
                  </Help>
                  {at("goal", field)}
                </span>
              ))}
              <span className="mchip">
                <label>
                  <span className="mlabel">{fieldLabel("work_product")}</span>
                  <input value={form.work_product?.[0]?.url ?? ""} placeholder="None" onChange={(e) => set({ work_product: e.target.value ? [{ url: e.target.value }] : null })} />
                </label>
                <Help label={fieldLabel("work_product")}>
                  <div>{MEANINGS.work_product}</div>
                </Help>
                {at("goal", "work_product")}
              </span>
            </div>
          </section>

          <SubGoals form={form} set={set} humans={humans} today={today} shares={uncommitted ? keyOf("$m") : undefined} errors={(k) => at(`sub:${k}`)} />
          {options.workItems && <WorkItems form={form} set={set} actors={options.actors} errors={(k) => at(`workitem:${k}`)} />}
        </div>

        <aside className="ngrail">
          <div className="card ngpreview">
            <div className="lbl">Preview</div>
            <div className="previewrow">
              <span className="rnum">{options.priorities.find((p) => p.id === form.priority)?.rank ?? ""}</span>
              <HealthDot health={form.health} word={false} />
              <span className="title">{form.summary || <span className="muted">Summary</span>}</span>
              <Avatar actor={options.actors.find((a) => a.id === form.owner) ?? me} mine={form.owner === me.id} />
            </div>
            {form.due_date && form.date_type && (
              <p className="small">
                {/* The judged date leads, as everywhere else (G5). */}
                {uncommitted ? `Committed ${shortDate(milestone.due_date, today)} · Promotion Milestone, then ${form.date_type} ${shortDate(form.due_date, today)}` : `${form.date_type} ${shortDate(form.due_date, today)}`}
              </p>
            )}
          </div>
          <div className="card ngmake">
            <div className="lbl">Create will make</div>
            <ul>
              {/* The server gives the keys in its create order, the milestone first; each line names what it is. */}
              <li>
                {key} <span className="muted">this goal</span>
              </li>
              {uncommitted && (
                <li>
                  {keyOf("$m")} <span className="muted">its Promotion Milestone</span>
                </li>
              )}
              {form.subGoals.length > 0 && (
                <li>
                  {count(form.subGoals.length, "sub-goal")}
                  {uncommitted && sharing > 0 && <span className="muted"> · {sharing} sharing {keyOf("$m")}</span>}
                </li>
              )}
              {form.workItems.length > 0 && <li>{count(form.workItems.length, "work item")}</li>}
            </ul>
            {asked ? (
              checking && !shown ? (
                <p className="small">…</p>
              ) : refused ? (
                <ul className="checks">
                  {violations.map((v, i) => (
                    <li key={i} className="bad">
                      ✕ {v.message}
                    </li>
                  ))}
                </ul>
              ) : shown?.ok ? (
                <p className="good">✓ Every check passes</p>
              ) : null
            ) : (
              <p className="small">{stillMissing(form)}</p>
            )}
          </div>
          <button type="button" className="btn primary create" onClick={create} disabled={saving} aria-busy={saving}>
            Create {key}
          </button>
          {refused && <p className="ferror ngcount">{count(violations.length, "check")} to fix</p>}
          <a
            href={parent ? goalPath(parent) : backPath(homeSearch())}
            className="cancel"
            onClick={(e) => {
              e.preventDefault();
              if (leave()) navigate(parent ? goalPath(parent) : backPath(homeSearch()));
            }}
          >
            Cancel
          </a>
        </aside>
      </div>
    </main>
  );
}

/** The fields a rule names that the form shows in place. A violation of any other field shows at the top of its card. */
const KNOWN = ["summary", "description", "owner", "priority", "due_date", "date_type", "promotion_milestone", "plan_maturity", "health", "path_to_green", "type", "severity", "state", "origination", "level", "visibility", "work_product"];

/** N6: the Promotion Milestone, in place, filled in. Its heading names the step it promotes to. */
function MilestoneBox({ value, onChange, step, humans, children }: { value: NewMilestone; onChange: (v: NewMilestone) => void; step: string; humans: ApiActor[]; children?: ReactNode }) {
  return (
    <div className="pmbox">
      <p className="small">A Committed date by which this date moves up to {step}. Health is judged against it.</p>
      <label className="field">
        <span className="flabel">Promotion Milestone</span>
        <input value={value.summary} onChange={(e) => onChange({ ...value, summary: e.target.value })} />
      </label>
      <div className="addgrid">
        <label className="field">
          <span className="flabel">Committed date</span>
          <input type="date" value={value.due_date} onChange={(e) => onChange({ ...value, due_date: e.target.value })} />
        </label>
        <label className="field">
          <span className="flabel">Owner</span>
          <select value={value.owner} onChange={(e) => onChange({ ...value, owner: e.target.value })}>
            {humans.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children}
    </div>
  );
}

type Part = { form: NewGoalForm; set: (p: Partial<NewGoalForm>) => void };

/** N9: sub-goals, added in rows. A row takes this goal's date and Date Type unless it is given its own (D2). */
function SubGoals({ form, set, humans, today, shares, errors }: Part & { humans: ApiActor[]; today: string; shares?: string; errors: (k: number) => ReactNode }) {
  const empty = (): SubGoalRow => ({ summary: "", owner: form.owner });
  const [row, setRow] = useState<SubGoalRow>(empty);
  const [own, setOwn] = useState(false);
  const move = (i: number, by: number) => {
    const list = [...form.subGoals];
    const [r] = list.splice(i, 1);
    list.splice(i + by, 0, r);
    set({ subGoals: list });
  };
  const add = () => {
    if (!row.summary.trim()) return;
    const date = own ? (row.date ?? { due_date: form.due_date || today, date_type: form.date_type || "Committed" }) : undefined;
    const milestone = date && date.date_type !== "Committed" ? (row.milestone ?? { summary: `Commit a date for ${row.summary}`, due_date: addDays(today, 14), owner: row.owner }) : undefined;
    set({ subGoals: [...form.subGoals, { summary: row.summary, owner: row.owner, ...(date ? { date } : {}), ...(milestone ? { milestone } : {}) }] });
    setRow(empty());
    setOwn(false);
  };
  // A sub-goal on this goal's date says so, and under an uncommitted goal says it shares this goal's Promotion Milestone (N9).
  const thisDate = (
    <>
      {form.due_date && form.date_type ? (
        <>
          {`${form.date_type} ${shortDate(form.due_date, "0000")} `}
          <span className="muted">· this goal's date{shares ? ` · shares ${shares}` : ""}</span>
        </>
      ) : (
        <span className="muted">This goal's date{shares ? ` · shares ${shares}` : ""}</span>
      )}
    </>
  );
  return (
    <section className="card ngcard" id="ng-4">
      <h2>
        <span className="ngnum">4</span> Sub-goals
      </h2>
      {form.subGoals.map((s, i) => (
        <div key={i} className="ngsub">
          <span className="title">{s.summary}</span>
          <span className="small">{s.date ? `${s.date.date_type} ${shortDate(s.date.due_date, "0000")}` : thisDate}</span>
          <span className="ngsubbtns">
            <button type="button" className="gbtn" aria-label="Up" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="gbtn" aria-label="Down" disabled={i === form.subGoals.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="gbtn" aria-label="Remove" onClick={() => set({ subGoals: form.subGoals.filter((_, j) => j !== i), workItems: form.workItems.filter((w) => w.goal !== i + 1).map((w) => (w.goal > i + 1 ? { ...w, goal: w.goal - 1 } : w)) })}>
              ×
            </button>
          </span>
          {errors(i)}
        </div>
      ))}
      <div className="addgrid">
        <label className="field">
          <span className="flabel">Summary</span>
          <input value={row.summary} onChange={(e) => setRow({ ...row, summary: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        </label>
        <label className="field">
          <span className="flabel">Owner</span>
          <select value={row.owner} onChange={(e) => setRow({ ...row, owner: e.target.value })}>
            {humans.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="radios">
        <label className={`radio${own ? "" : " on"}`}>
          <input type="radio" checked={!own} onChange={() => setOwn(false)} />
          {thisDate}
        </label>
        <label className={`radio${own ? " on" : ""}`}>
          <input type="radio" checked={own} onChange={() => setOwn(true)} />
          Its own date
        </label>
      </div>
      {own && (
        <div className="addgrid">
          <label className="field">
            <span className="flabel">Due Date</span>
            <input type="date" value={row.date?.due_date ?? ""} onChange={(e) => setRow({ ...row, date: { due_date: e.target.value, date_type: row.date?.date_type ?? "Committed" } })} />
          </label>
          <label className="field">
            <span className="flabel">Date Type</span>
            <select value={row.date?.date_type ?? "Committed"} onChange={(e) => setRow({ ...row, date: { due_date: row.date?.due_date ?? today, date_type: e.target.value as DateType } })}>
              {DATE_TYPES.map((d) => (
                <option key={d.type}>{d.type}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {own && row.date && row.date.date_type !== "Committed" && (
        <MilestoneBox
          value={row.milestone ?? { summary: `Commit a date for ${row.summary || "this sub-goal"}`, due_date: addDays(today, 14), owner: row.owner }}
          onChange={(milestone) => setRow({ ...row, milestone })}
          step={row.date.date_type === "Fantasy" ? "Ambition" : "Committed"}
          humans={humans}
        />
      )}
      <button type="button" className="btn" onClick={add}>
        + Sub-goal
      </button>
    </section>
  );
}

/** N10: work items, added in rows, each on this goal or one of the sub-goals above. Each starts In Progress. */
function WorkItems({ form, set, actors, errors }: Part & { actors: ApiActor[]; errors: (k: number) => ReactNode }) {
  const [row, setRow] = useState({ title: "", goal: 0, owner: form.owner, due_date: null as string | null });
  const title = useRef<HTMLInputElement>(null);
  const add = () => {
    if (!row.title.trim()) return;
    set({ workItems: [...form.workItems, row] });
    setRow({ ...row, title: "" });
    title.current?.focus();
  };
  const goals = [form.summary || "This goal", ...form.subGoals.map((s) => s.summary)];
  return (
    <section className="card ngcard" id="ng-5">
      <h2>
        <span className="ngnum">5</span> Work items
      </h2>
      {form.workItems.map((w, i) => (
        <div key={i} className="ngsub">
          <span className="title">{w.title}</span>
          <span className="small">
            {goals[w.goal]} · {actors.find((a) => a.id === w.owner)?.name ?? w.owner}
          </span>
          <span className="ngsubbtns">
            <button type="button" className="gbtn" aria-label="Remove" onClick={() => set({ workItems: form.workItems.filter((_, j) => j !== i) })}>
              ×
            </button>
          </span>
          {errors(i)}
        </div>
      ))}
      <div className="addgrid four">
        <label className="field">
          <span className="flabel">Title</span>
          <input ref={title} value={row.title} onChange={(e) => setRow({ ...row, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        </label>
        <label className="field">
          <span className="flabel">Goal</span>
          <select value={row.goal} onChange={(e) => setRow({ ...row, goal: Number(e.target.value) })}>
            {goals.map((g, i) => (
              <option key={i} value={i}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">Owner</span>
          <select value={row.owner} onChange={(e) => setRow({ ...row, owner: e.target.value })}>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.kind === "agent" ? " (agent)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">Due Date</span>
          <input type="date" value={row.due_date ?? ""} onChange={(e) => setRow({ ...row, due_date: e.target.value || null })} />
        </label>
      </div>
      <button type="button" className="btn" onClick={add}>
        + Work item
      </button>
    </section>
  );
}
