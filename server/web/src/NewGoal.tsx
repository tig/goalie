import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiActor, CommandsResponse, FormOptions, GoalPageResponse, Health, PathToGreen, PlanMaturity } from "../../src/api.ts";
import { addDays, shortDate } from "../../src/dates.ts";
import { postCommands, useJson } from "./data.ts";
import { PtgFields } from "./GoalPanels.tsx";
import { createBatch, goalTypes, type NewGoalForm, type NewMilestone, type SubGoalRow } from "./model/commands.ts";
import { eventValue, fieldLabel } from "./model/goalpage.ts";
import { detailsLine, makes, placeOf, toSave, type SaveLine } from "./model/newgoal.ts";
import { backPath, goalPath } from "./model/route.ts";
import { Avatar, HealthDot, Help } from "./parts.tsx";
import { homeSearch, Link, navigate } from "./router.tsx";

/**
 * New goal v2, foundation first (docs/design/goal-page-and-create.md, NF1 to NF18; interaction rules NG2 to NG7).
 * One "Needed to save" card, one folded Details card, and a rail. The browser checks no rule: once the foundation is filled,
 * the rail asks the server with `check: true` 400 ms after the last change and shows its answer in plain words (model/newgoal.ts).
 */

type DateType = NewGoalForm["date_type"];

/** NF5: each Date Type's meaning and cost, shown before it is chosen. The order is the spec's (§5). */
const DATE_TYPES: { type: DateType; meaning: string; cost: string }[] = [
  { type: "Committed", meaning: "A promise.", cost: "Needs a plan at Pencil." },
  { type: "Ambition", meaning: "A stretch.", cost: "Needs a Promotion Milestone." },
  { type: "Fantasy", meaning: "A wish.", cost: "Needs a Promotion Milestone." },
];

const HEALTHS: { health: Exclude<Health, null>; meaning: string }[] = [
  { health: "GREEN", meaning: "On track. The risks are understood and the owner believes the date will be hit." },
  { health: "YELLOW", meaning: "Real unknowns or blockers, with a credible path to the date." },
  { health: "RED", meaning: "The date is not credible without help, or there is no Path to Green." },
];

/** NF7: the §4 meanings of Plan Maturity. */
const MATURITY: Record<PlanMaturity, string> = {
  Watercolor: "Broad strokes, soft edges.",
  Crayon: "Main parts clear, details flexible.",
  Pencil: "Precise and ready to execute.",
};

/** The §6.1 parts of a description. Each prompt adds its heading (design U9: prompts, with no checked look). */
const PARTS = ["Key results", "Metrics", "Why it matters", "Who shares it"];

/** The §6.1 meaning of each Details field (NF11). */
const MEANINGS: Record<string, string> = {
  description: "What the goal is, its key results, its metrics, why it matters, and who shares it.",
  state: "Where the goal is in its life. A new goal starts in Backlog; In Progress asks for its health.",
  type: "What kind of goal it is, for example a launch or a metric.",
  severity: "How much it matters if the goal is missed. sev1 matters most.",
  origination: "Whether the goal is new, carried over from the last period, or repeating.",
  visibility: "Who can see the goal.",
  work_product: "Links to what the goal produces, such as a repo or a page.",
  level: "The level of the org the goal belongs to. It agrees with the org unit.",
  org_unit: "The part of the org the goal belongs to.",
};

const CHECK_DELAY = 400;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function NewGoal({ parent, viewName }: { parent?: string; viewName: string }) {
  const [options] = useJson<FormOptions>("/api/options");
  // NF9: from a parent, the form says which goal it is under and shows the date it takes.
  const [under] = useJson<GoalPageResponse>(parent ? `/api/goals/${encodeURIComponent(parent)}` : "/api/options");
  const back = (
    <Link to={parent ? goalPath(parent) : backPath(homeSearch())} className="back">
      ‹ {parent ?? viewName}
    </Link>
  );
  if (options.state !== "ok" || (parent && under.state === "loading")) {
    return (
      <main className="newgoal" aria-busy={options.state === "loading"}>
        {back}
        {options.state === "refused" ? <p className="note">{options.reason}</p> : <div className="skel skel-title" />}
      </main>
    );
  }
  return <Form options={options.data} parent={parent} under={parent && under.state === "ok" ? under.data : undefined} back={back} />;
}

function Form({ options, parent, under, back }: { options: FormOptions; parent?: string; under?: GoalPageResponse; back: ReactNode }) {
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
  // NF14: the Details card's checks show only once it is opened and something in it changed.
  const [detailsTouched, setDetailsTouched] = useState(false);
  const setDetail = (part: Partial<NewGoalForm>) => {
    setDetailsTouched(true);
    set(part);
  };
  const uncommitted = !parent && (form.date_type === "Ambition" || form.date_type === "Fantasy");

  // NF6: the Promotion Milestone's date starts empty; the form never picks a promise. Its summary follows the goal's until changed.
  const milestone: NewMilestone = form.milestone ?? { summary: `Commit a date for ${form.summary || "this goal"}`, due_date: "", owner: form.owner };
  const setMilestone = (part: Partial<NewMilestone>) => set({ milestone: { ...milestone, ...part } });
  const sent = useMemo(() => ({ ...form, milestone: uncommitted ? milestone : null }), [form, uncommitted, milestone.summary, milestone.due_date, milestone.owner]); // eslint-disable-line react-hooks/exhaustive-deps
  const batch = useMemo(() => createBatch(sent), [sent]);
  // The server is asked once every foundation field has a value: a rule about a part not yet filled is never shown (NF15).
  const ready = Boolean(form.summary.trim() && form.owner && (parent || (form.due_date && form.date_type && (!uncommitted || milestone.due_date))));

  const [check, setCheck] = useState<CommandsResponse | null>(null);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const timer = setTimeout(async () => {
      const { body } = await postCommands(createBatch(sent, true));
      if (live) setCheck(body);
    }, CHECK_DELAY);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [sent, ready]);

  const [result, setResult] = useState<CommandsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [pressed, setPressed] = useState(false);
  const answer = ready ? (result ?? check) : null;
  // A press shows the Details card's refusals too, so a save never fails with nothing listed.
  const lines = toSave(sent, answer, detailsTouched || pressed, batch);
  const left = lines.filter((l) => !l.done);
  // NF15: after a press, each unmet line shows its sentence at its own field, in --red-ink.
  const miss = (key: string) => {
    const l = pressed ? left.find((x) => x.key === key) : undefined;
    return l ? <p className="ferror">{l.sentence}</p> : null;
  };
  // NF2: the summary hint is the server's lint for this goal, shown once the person leaves the field. It never blocks.
  const [leftSummary, setLeftSummary] = useState(false);
  const goalAt = batch.commands.findIndex((c) => c.op === "create" && c.kind === "goal" && c.ref === "$goal");
  const hints = (check as (CommandsResponse & { hints?: { at: number; field: string; text: string }[] }) | null)?.hints ?? [];
  const summaryHint = leftSummary && form.summary.trim() ? hints.find((h) => h.at === goalAt && h.field === "summary")?.text : undefined;

  const typed = form.summary || form.description || form.subGoals.length > 0;
  const leave = () => !typed || confirm("Leave without creating?");
  useEffect(() => {
    if (!typed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [typed]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const scrollTo = (l: SaveLine) => {
    const where = placeOf(l.key);
    if (where === "details") setDetailsOpen(true);
    setTimeout(() => document.getElementById(where === "details" ? "ng-details" : `ng-${where}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  // NF17: Create is muted while "To save" has lines left; a press then shows every unmet line and scrolls to the first.
  const create = async () => {
    setPressed(true);
    if (left.length) return scrollTo(left[0]);
    setSaving(true);
    const { body } = await postCommands(createBatch(sent));
    setSaving(false);
    if (body.ok) return navigate(goalPath(body.ids["$goal"]));
    setResult(body);
  };
  // Typing again clears the last refusal from a save; the rail's check takes over.
  const [seen, setSeen] = useState(form);
  if (seen !== form) {
    setSeen(form);
    if (result) setResult(null);
  }

  const owner = options.actors.find((a) => a.id === form.owner) ?? me;
  const [msOpen, setMsOpen] = useState(false);
  // NF4a: Priority is a deliberate choice, so no row is chosen until the person picks one, None included.
  const [picked, setPicked] = useState(false);
  const priority = options.priorities.find((p) => p.id === form.priority);
  const toGo = left.length ? `To save: ${left.length} to go` : "Ready to create";

  return (
    <main className="newgoal">
      {back}
      <h1>New goal</h1>
      {/* NF18: on a phone and under 960 px, the count is a line at the top that opens the checklist. */}
      <button type="button" className={`linkbtn ngtopcount${left.length ? (pressed ? " miss" : "") : " good"}`} onClick={() => document.querySelector(".ngmake")?.scrollIntoView({ behavior: "smooth" })}>
        {toGo}
      </button>
      <div className="nglayout">
        <div className="ngform">
          <section className="card ngcard ngfound" id="ng-found">
            <h2>Needed to save</h2>
            {under && <p className="ngunder">Under {under.goal.summary}</p>}
            <label className="field" id="ng-summary">
              <span className="flabel">Summary</span>
              <input value={form.summary} onChange={(e) => set({ summary: e.target.value })} onBlur={() => setLeftSummary(true)} placeholder="Start with a verb: Launch, Reduce, Increase" autoFocus />
              {miss("summary")}
              {summaryHint && <p className="hint">{summaryHint}</p>}
            </label>
            <label className="field ngowner" id="ng-owner">
              <span className="flabel">Owner</span>
              <span className="ownerpick">
                <Avatar actor={owner} mine={owner.id === me.id} />
                <select value={form.owner} onChange={(e) => set({ owner: e.target.value })}>
                  {humans.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </span>
              {miss("owner")}
            </label>
            {under ? (
              // NF9: the date, Date Type, and Priority are the parent's; the record holds none of its own (D2).
              <p className="field">
                <span className="flabel">Date</span>
                <span>
                  {under.dates.find((d) => d.kind === under.goal.date_type) ? `${under.goal.date_type} ${shortDate(under.goal.due_date ?? "", "0000")} ` : ""}
                  <span className="muted">· this goal's date{under.goal.promotion_milestone ? ` · shares ${under.goal.promotion_milestone}` : ""}</span>
                </span>
              </p>
            ) : (
              <>
                <label className="field" id="ng-due_date">
                  <span className="flabel">Date</span>
                  <input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} />
                  {form.due_date && <span className="small">{shortDate(form.due_date, "0000")}</span>}
                  {miss("due_date")}
                </label>
                <div className="field" id="ng-date_type">
                  <span className="flabel">How firm is the date?</span>
                  <div className="tiles" role="radiogroup" aria-label="Date Type">
                    {DATE_TYPES.map((d) => (
                      <button key={d.type} type="button" role="radio" aria-checked={form.date_type === d.type} className={`tile${form.date_type === d.type ? " on" : ""}`} onClick={() => set({ date_type: d.type })}>
                        <b>{d.type}</b>
                        <span>{d.meaning}</span>
                        <span className="tcost">{d.cost}</span>
                      </button>
                    ))}
                  </div>
                  {miss("date_type")}
                </div>
                {uncommitted && (
                  <div className="pmbox" id="ng-milestone_date">
                    <h3>Promotion Milestone</h3>
                    <p className="small">A promise to make this goal's date firmer by a Committed date.</p>
                    <label className="field">
                      <span className="flabel">Commit this goal's date by</span>
                      <input type="date" value={milestone.due_date} min={addDays(today, 1)} max={form.due_date || undefined} onChange={(e) => setMilestone({ due_date: e.target.value })} />
                      {milestone.due_date && <span className="small">{shortDate(milestone.due_date, "0000")}</span>}
                      <span className="small muted">Pick the date by which you will know the real date.</span>
                      {miss("milestone_date")}
                    </label>
                    {msOpen ? (
                      <div className="addgrid" id="ng-milestone">
                        <label className="field">
                          <span className="flabel">Summary</span>
                          <input value={milestone.summary} onChange={(e) => setMilestone({ summary: e.target.value })} />
                        </label>
                        <label className="field">
                          <span className="flabel">Owner</span>
                          <select value={milestone.owner} onChange={(e) => setMilestone({ owner: e.target.value })}>
                            {humans.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <p className="small muted" id="ng-milestone">
                        Owner {options.actors.find((a) => a.id === milestone.owner)?.name ?? milestone.owner} · “{milestone.summary}”{" "}
                        <button type="button" className="linkbtn" onClick={() => setMsOpen(true)}>
                          Change
                        </button>
                      </p>
                    )}
                    {miss("milestone")}
                  </div>
                )}
                {form.date_type === "Committed" && (
                  <div className="planbox" id="ng-plan_maturity">
                    <label className="field">
                      <span className="flabel">Plan</span>
                      <input value={form.plan ?? ""} placeholder="A link to the plan" onChange={(e) => set({ plan: e.target.value || null })} />
                    </label>
                    <span className="flabel">Plan Maturity</span>
                    <div className="tiles" role="radiogroup" aria-label="Plan Maturity">
                      {options.choices.plan_maturity.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={form.plan_maturity === m} className={`tile${form.plan_maturity === m ? " on" : ""}`} onClick={() => set({ plan_maturity: m })}>
                          <b>{m}</b>
                          <span>{MATURITY[m]}</span>
                        </button>
                      ))}
                    </div>
                    {form.plan_maturity !== "Pencil" && (
                      <p className="small">
                        A Committed date needs a plan at Pencil. No plan yet? Choose Ambition now and commit later.{" "}
                        <button type="button" className="linkbtn" onClick={() => set({ date_type: "Ambition" })}>
                          Use Ambition instead
                        </button>
                      </p>
                    )}
                    {miss("plan_maturity")}
                  </div>
                )}
                <span className="flabel">Priority</span>
                {/* NF4a: a deliberate choice, none chosen. Home lists only goals mapped to a Priority. */}
                <div className="prows" role="radiogroup" aria-label="Priority" id="ng-priority">
                  {[{ id: null, rank: null, title: "None" }, ...options.priorities].map((p) => (
                    <label key={p.id ?? "none"} className={`prow${picked && form.priority === p.id ? " on" : ""}`}>
                      <input
                        type="radio"
                        name="priority"
                        checked={picked && form.priority === p.id}
                        onChange={() => {
                          setPicked(true);
                          set({ priority: p.id });
                        }}
                      />
                      <span className="rnum">{p.rank ?? ""}</span>
                      <span className={p.id ? "" : "muted"}>{p.title}</span>
                    </label>
                  ))}
                </div>
                {!form.priority && <p className="small muted">It will not show on Priorities.</p>}
              </>
            )}
            {form.more.state === "Backlog" && <p className="small muted ngbacklog">It starts in Backlog. Set its health when work starts.</p>}
          </section>

          <Details
            open={detailsOpen}
            setOpen={setDetailsOpen}
            form={form}
            set={setDetail}
            options={options}
            humans={humans}
            shares={uncommitted ? "its Promotion Milestone" : under?.goal.promotion_milestone ?? undefined}
            miss={miss}
          />
        </div>

        <aside className="ngrail">
          <div className="card ngpreview">
            <div className="lbl">Preview</div>
            <div className="previewrow">
              <span className="rnum">{priority?.rank ?? ""}</span>
              <HealthDot health={form.more.state === "In Progress" ? form.health : null} word={false} />
              <span className="title">{form.summary || <span className="muted">Summary</span>}</span>
              <Avatar actor={owner} mine={form.owner === me.id} />
            </div>
            {form.due_date && form.date_type && !parent && (
              <p className="small">
                {/* The judged date leads, as everywhere else (G5). */}
                {uncommitted && milestone.due_date ? `Committed ${shortDate(milestone.due_date, today)} · Promotion Milestone, then ${form.date_type} ${shortDate(form.due_date, today)}` : `${form.date_type} ${shortDate(form.due_date, today)}`}
              </p>
            )}
          </div>
          <div className="card ngmake">
            <div className="lbl">Create will make</div>
            <p className="small">{makes(sent)}</p>
            <div className="lbl">{toGo}</div>
            <ul className="tosave">
              {lines.map((l) => (
                <li key={l.key} className={l.done ? "ok" : pressed ? "miss" : ""}>
                  <button type="button" className="linkbtn" onClick={() => scrollTo(l)}>
                    <span aria-hidden="true">{l.done ? "✓" : "○"}</span> {l.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className={`btn primary create${left.length ? " muted" : ""}`} aria-disabled={left.length > 0} onClick={create} disabled={saving} aria-busy={saving}>
            Create goal
          </button>
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

type Part = { form: NewGoalForm; set: (p: Partial<NewGoalForm>) => void };

/** NF10 to NF13: one folded card of rows, each a label, its value, and Change. Closed, it shows five values and how many more. */
function Details({ open, setOpen, form, set, options, humans, shares, miss }: Part & { open: boolean; setOpen: (o: boolean) => void; options: FormOptions; humans: ApiActor[]; shares?: string; miss: (key: string) => ReactNode }) {
  const [editing, setEditing] = useState<string | null>(null);
  const value = (field: string, v: unknown) => (v === null || v === undefined || v === "" ? "None" : eventValue(v, field));
  const rows: [string, string, string][] = [
    ["description", fieldLabel("description"), form.description.trim() ? "Written" : "None"],
    ["state", fieldLabel("state"), form.more.state],
    ["type", fieldLabel("type"), form.more.type],
    ["severity", fieldLabel("severity"), form.more.severity],
    ["origination", fieldLabel("origination"), form.more.origination],
    ["visibility", fieldLabel("visibility"), value("visibility", form.more.visibility)],
    ["work_product", fieldLabel("work_product"), form.work_product?.[0]?.url ?? "None"],
    ["level", fieldLabel("level"), `${form.more.level}, from ${options.orgUnit.name}`],
    ["org_unit", fieldLabel("org_unit"), options.orgUnit.name],
    ["subgoals", "Sub-goals", form.subGoals.length ? count(form.subGoals.length, "sub-goal") : "None"],
    ["workitems", "Work items", form.workItems.length ? count(form.workItems.length, "work item") : "None"],
  ];
  const optional = new Set(["work_product", "subgoals", "workitems"]);
  const fixed = new Set(["level", "org_unit"]);
  const pick = (field: "type" | "severity" | "origination" | "visibility", list: readonly string[]) => (
    <select value={form.more[field]} onChange={(e) => set({ more: { ...form.more, [field]: e.target.value } })} aria-label={fieldLabel(field)}>
      {list.map((c) => (
        <option key={c} value={c}>
          {eventValue(c, field)}
        </option>
      ))}
    </select>
  );
  const editor = (key: string): ReactNode => {
    switch (key) {
      case "description":
        return (
          <>
            <textarea rows={5} value={form.description} onChange={(e) => set({ description: e.target.value })} aria-label="Description" />
            <p className="chips">
              {PARTS.map((p) => (
                <button key={p} type="button" className="fchip" onClick={() => set({ description: `${form.description}${form.description && !form.description.endsWith("\n") ? "\n" : ""}${p}: ` })}>
                  + {p}
                </button>
              ))}
            </p>
          </>
        );
      case "state":
        // NF12: In Progress asks for health in the same row, with no default; YELLOW or RED opens the Path to Green.
        return (
          <>
            <select value={form.more.state} aria-label="State" onChange={(e) => set({ more: { ...form.more, state: e.target.value as NewGoalForm["more"]["state"] }, ...(e.target.value === "In Progress" ? {} : { health: null }) })}>
              {["Backlog", "In Progress"].map((st) => (
                <option key={st}>{st}</option>
              ))}
            </select>
            {form.more.state === "In Progress" && (
              <div className="field" id="ng-health">
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
                {miss("health")}
              </div>
            )}
            {(form.health === "YELLOW" || form.health === "RED") && form.path_to_green && form.more.state === "In Progress" && (
              <PtgFields value={form.path_to_green} onChange={(path_to_green: PathToGreen) => set({ path_to_green })} health={form.health} people={humans} me={form.owner} error={miss("path_to_green")} />
            )}
          </>
        );
      case "type":
        return pick("type", options.choices.type);
      case "severity":
        return pick("severity", options.choices.severity);
      case "origination":
        return pick("origination", ["New", "Carryover", "Repeating"]);
      case "visibility":
        return pick("visibility", [form.more.visibility]);
      case "work_product":
        return <input value={form.work_product?.[0]?.url ?? ""} placeholder="A link" aria-label="Work Product" onChange={(e) => set({ work_product: e.target.value ? [{ url: e.target.value }] : null })} />;
      case "subgoals":
        return <SubGoals form={form} set={set} humans={humans} today={options.today} shares={shares} />;
      case "workitems":
        return options.workItems ? <WorkItems form={form} set={set} actors={options.actors} /> : null;
      default:
        return null;
    }
  };
  return (
    <section className="card ngcard ngdetails" id="ng-details">
      <button type="button" className="dhead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h2>Details · defaults set, change now or later on the goal page</h2>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {!open ? (
        <p className="small muted dline">{detailsLine(rows.map(([, label, v]) => [label, v]))}</p>
      ) : (
        <div className="drows">
          {rows.map(([key, label, v]) => (
            <div key={key} className="drow" id={`ng-${key}`}>
              <span className="dlabel">
                {label}
                {optional.has(key) && <span className="muted"> · optional</span>}
                {MEANINGS[key] && (
                  <Help label={label}>
                    <div>{MEANINGS[key]}</div>
                  </Help>
                )}
              </span>
              <span className="dvalue">{v}</span>
              {fixed.has(key) ? (
                <span />
              ) : (
                <button type="button" className="linkbtn" onClick={() => setEditing(editing === key ? null : key)}>
                  {editing === key ? "Done" : key === "subgoals" || key === "workitems" ? "+ Add" : "Change"}
                </button>
              )}
              {editing === key && <div className="dedit">{editor(key)}</div>}
              {miss(key)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** NF13: sub-goals, one at a time, listed under the row. A row takes this goal's date and Date Type unless it is given its own (D2). */
function SubGoals({ form, set, humans, today, shares }: Part & { humans: ApiActor[]; today: string; shares?: string }) {
  const empty = (): SubGoalRow => ({ summary: "", owner: form.owner });
  const [row, setRow] = useState<SubGoalRow>(empty);
  const [own, setOwn] = useState(false);
  const add = () => {
    if (!row.summary.trim()) return;
    const date = own ? (row.date ?? { due_date: form.due_date || today, date_type: form.date_type || "Committed" }) : undefined;
    const milestone = date && date.date_type !== "Committed" ? (row.milestone ?? { summary: `Commit a date for ${row.summary}`, due_date: "", owner: row.owner }) : undefined;
    set({ subGoals: [...form.subGoals, { summary: row.summary, owner: row.owner, ...(date ? { date } : {}), ...(milestone ? { milestone } : {}) }] });
    setRow(empty());
    setOwn(false);
  };
  const thisDate = <span className="muted">This goal's date{shares ? ` · shares ${shares}` : ""}</span>;
  return (
    <div className="ngsubs">
      {form.subGoals.map((s, i) => (
        <div key={i} className="ngsub">
          <span className="title">{s.summary}</span>
          <span className="small">{s.date ? `${s.date.date_type} ${shortDate(s.date.due_date, "0000")}` : thisDate}</span>
          <span className="ngsubbtns">
            <button type="button" className="gbtn" aria-label="Remove" onClick={() => set({ subGoals: form.subGoals.filter((_, j) => j !== i), workItems: form.workItems.filter((w) => w.goal !== i + 1).map((w) => (w.goal > i + 1 ? { ...w, goal: w.goal - 1 } : w)) })}>
              ×
            </button>
          </span>
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
            <span className="flabel">Date</span>
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
        <label className="field">
          <span className="flabel">Commit its date by</span>
          <input type="date" value={row.milestone?.due_date ?? ""} min={addDays(today, 1)} onChange={(e) => setRow({ ...row, milestone: { summary: row.milestone?.summary ?? `Commit a date for ${row.summary || "this sub-goal"}`, owner: row.milestone?.owner ?? row.owner, due_date: e.target.value } })} />
        </label>
      )}
      <button type="button" className="btn" onClick={add}>
        Add sub-goal
      </button>
    </div>
  );
}

/** NF13: work items, one at a time, each on this goal or one of the sub-goals above. Each starts In Progress. */
function WorkItems({ form, set, actors }: Part & { actors: ApiActor[] }) {
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
    <div className="ngsubs">
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
        Add work item
      </button>
    </div>
  );
}
