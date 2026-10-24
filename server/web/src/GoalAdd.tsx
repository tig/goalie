import { useState } from "react";
import type { ApiActor, ApiViolation, ApiWorkItem, CommandsRequest, CommandsResponse, FormOptions, GoalPageResponse, WorkItemStatus } from "../../src/api.ts";
import { addDays } from "../../src/dates.ts";
import { postCommands, useJson } from "./data.ts";
import type { Done } from "./GoalPanels.tsx";
import { goalTypes, savedStatus, subGoalBatch, workItemBatch, workItemStatusBatch, type SubGoalRow } from "./model/commands.ts";
import { humans } from "./model/goalpage.ts";
import { dateLabel } from "./model/labels.ts";

/** + Sub-goal, + Work item, and the work item tick (G20, G22, G24). Each posts one batch; the server checks every rule. */

type Result = { saving: boolean; violations: ApiViolation[]; message?: string };

/** Post a batch. A 200 calls onSaved; a refusal keeps the typed values and names what broke. */
function usePost(onSaved: (answer: CommandsResponse) => void): [Result, (batch: CommandsRequest) => Promise<void>] {
  const [result, setResult] = useState<Result>({ saving: false, violations: [] });
  const post = async (batch: CommandsRequest) => {
    setResult({ saving: true, violations: [] });
    const { body } = await postCommands(batch);
    if (body.ok) {
      setResult({ saving: false, violations: [] });
      onSaved(body);
    } else if (body.error === "invalid") setResult({ saving: false, violations: body.violations });
    else setResult({ saving: false, violations: [], message: body.error === "stale" ? "Someone saved this after you opened it." : body.message });
  };
  return [result, post];
}

const Errors = ({ result }: { result: Result }) => (
  <>
    {result.message && <p className="ferror">{result.message}</p>}
    {result.violations.map((v, i) => (
      <p key={i} className="ferror">
        {v.message}
      </p>
    ))}
  </>
);

const people = (data: GoalPageResponse): ApiActor[] => humans(data.actors);

/**
 * G20: one add row at the top of the sub-goals. Its date starts as this goal's (D2), written out.
 * Its own Ambition or Fantasy date opens its own Promotion Milestone, as on the New goal form (N6).
 */
export function AddSubGoal({ data, onDone }: { data: GoalPageResponse; onDone: Done }) {
  const [options] = useJson<FormOptions>("/api/options");
  const { goal, today } = data;
  const [summary, setSummary] = useState("");
  const [owner, setOwner] = useState(goal.owner);
  const [own, setOwn] = useState(false);
  const [date, setDate] = useState({ due_date: goal.due_date ?? today, date_type: (goal.date_type ?? "Committed") as "Committed" | "Ambition" | "Fantasy" });
  const [ms, setMs] = useState({ summary: "", due_date: addDays(today, 14), owner: goal.owner });
  const [result, post] = usePost((b) => onDone(true, savedStatus("subgoal", b)));
  const parentDate = data.dates.find((d) => d.kind !== "Promotion Milestone") ?? data.dates[0];
  const uncommitted = own && date.date_type !== "Committed";
  const row: SubGoalRow = { summary, owner, ...(own ? { date } : {}), ...(uncommitted ? { milestone: { ...ms, summary: ms.summary || `Commit a date for ${summary}` } } : {}) };
  return (
    <section className="panel addrow" aria-label="Sub-goal">
      <div className="addgrid">
        <label className="field">
          <span className="flabel">Summary</span>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Start with a verb" autoFocus />
        </label>
        <label className="field">
          <span className="flabel">Owner</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {people(data).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="radios" role="radiogroup" aria-label="Date">
        <label className={`radio${own ? "" : " on"}`}>
          <input type="radio" checked={!own} onChange={() => setOwn(false)} />
          {parentDate ? dateLabel(parentDate, today) : "None"} <span className="muted">· this goal's date</span>
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
            <input type="date" value={date.due_date} onChange={(e) => setDate({ ...date, due_date: e.target.value })} />
          </label>
          <label className="field">
            <span className="flabel">Date Type</span>
            <select value={date.date_type} onChange={(e) => setDate({ ...date, date_type: e.target.value as typeof date.date_type })}>
              {(["Committed", "Ambition", "Fantasy"] as const).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {uncommitted && (
        <div className="pmbox">
          <p className="small">A Committed date by which this date moves up. Health is judged against it.</p>
          <div className="addgrid">
            <label className="field">
              <span className="flabel">Promotion Milestone</span>
              <input value={ms.summary} placeholder={`Commit a date for ${summary || "this sub-goal"}`} onChange={(e) => setMs({ ...ms, summary: e.target.value })} />
            </label>
            <label className="field">
              <span className="flabel">Committed date</span>
              <input type="date" value={ms.due_date} onChange={(e) => setMs({ ...ms, due_date: e.target.value })} />
            </label>
          </div>
        </div>
      )}
      <Errors result={result} />
      <div className="pactions">
        <button type="button" className="btn primary" disabled={result.saving || options.state !== "ok"} onClick={() => options.state === "ok" && post(subGoalBatch(goal, row, goalTypes(options.data)))}>
          Add
        </button>
        <button type="button" className="btn" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** G22: one add row for a work item. The owner may be a human or an agent. It starts In Progress; its reason is "Filed". */
export function AddWorkItem({ data, statuses, onDone }: { data: GoalPageResponse; statuses: WorkItemStatus[]; onDone: Done }) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(data.me.id);
  const [status, setStatus] = useState<WorkItemStatus>("In Progress");
  const [due, setDue] = useState("");
  const [result, post] = usePost((b) => onDone(true, savedStatus("workitem", b)));
  return (
    <section className="panel addrow" aria-label="Work item">
      <div className="addgrid four">
        <label className="field">
          <span className="flabel">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="flabel">Owner</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {Object.values(data.actors).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.kind === "agent" ? " (agent)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as WorkItemStatus)}>
            {statuses
              .filter((s) => s !== "Deleted")
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">Due Date</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <Errors result={result} />
      <div className="pactions">
        <button type="button" className="btn primary" disabled={result.saving} onClick={() => post(workItemBatch(data.goal.id, { title, owner, status, due_date: due || null }))}>
          Add
        </button>
        <button type="button" className="btn" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/**
 * G24: ticking the box marks the item Completed. Every status change needs a reason, so the row shows one box, "Reason", with Save.
 * Enter saves; Escape undoes the tick.
 */
export function useTick(onSaved: () => void) {
  const [ticked, setTicked] = useState<ApiWorkItem | null>(null);
  const [reason, setReason] = useState("");
  const [result, post] = usePost(() => {
    setTicked(null);
    setReason("");
    onSaved();
  });
  const box = (item: ApiWorkItem) =>
    ticked?.id === item.id ? (
      <div className="tickreason">
        <input
          value={reason}
          placeholder="Reason"
          aria-label="Reason"
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") post(workItemStatusBatch(item, "Completed", reason));
            if (e.key === "Escape") setTicked(null);
          }}
        />
        <button type="button" className="btn primary" disabled={result.saving} onClick={() => post(workItemStatusBatch(item, "Completed", reason))}>
          Save
        </button>
        <Errors result={result} />
      </div>
    ) : null;
  return { ticked, tick: (item: ApiWorkItem) => setTicked(ticked?.id === item.id ? null : item), box };
}
