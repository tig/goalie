import { useEffect, useRef, useState } from "react";
import type { ApiActor, ApiViolation, ApiWorkItem, CommandsRequest, CommandsResponse, FormOptions, GitHubSearchResponse, GoalPageResponse, WorkItemStatus } from "../../src/api.ts";
import { addDays } from "../../src/dates.ts";
import { postCommands, useJson } from "./data.ts";
import type { Done } from "./GoalPanels.tsx";
import { goalTypes, savedStatus, subGoalBatch, workItemBatch, workItemFieldsBatch, workItemStatusBatch, type SubGoalRow } from "./model/commands.ts";
import { humans } from "./model/goalpage.ts";
import { dateLabel } from "./model/labels.ts";
import { formFocus } from "./model/feedback.ts";
import { TitleBits } from "./parts.tsx";

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

/** tig/goalie#65: these forms add something new, and its key is not shown until it saves, so a message drops the key it starts with. */
const unkeyed = (message: string) => message.replace(/^[A-Z]+-\d+: (.)/, (_, c: string) => c.toUpperCase());

const Errors = ({ result }: { result: Result }) => (
  <>
    {result.message && <p className="ferror">{result.message}</p>}
    {result.violations.map((v, i) => (
      <p key={i} className="ferror">
        {unkeyed(v.message)}
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
  const [plan, setPlan] = useState({ plan: "", plan_maturity: goal.plan_maturity });
  const [result, post] = usePost((b) => onDone(true, savedStatus("subgoal", b)));
  const parentDate = data.dates.find((d) => d.kind !== "Promotion Milestone") ?? data.dates[0];
  const uncommitted = own && date.date_type !== "Committed";
  const committed = own && date.date_type === "Committed";
  const row: SubGoalRow = { summary, owner, ...(own ? { date } : {}), ...(uncommitted ? { milestone: { ...ms, summary: ms.summary || `Commit a date for ${summary}` } } : {}), ...(committed ? { plan } : {}) };
  return (
    <section className="panel addrow" aria-label="Sub-goal" data-focus={formFocus("Sub-goal")}>
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
      {/* tig/goalie#65: a Committed date needs a Plan at Pencil, so its own Committed date asks for the plan here, not after Add. */}
      {committed && (
        <div className="pmbox">
          <p className="small">A Committed date needs a Plan at Pencil. Link the plan, or pick Ambition.</p>
          <div className="addgrid">
            <label className="field">
              <span className="flabel">Plan</span>
              <input value={plan.plan} placeholder="A link or a path" onChange={(e) => setPlan({ ...plan, plan: e.target.value })} />
            </label>
            <label className="field">
              <span className="flabel">Plan Maturity</span>
              <select value={plan.plan_maturity} onChange={(e) => setPlan({ ...plan, plan_maturity: e.target.value as typeof plan.plan_maturity })}>
                {(["Watercolor", "Crayon", "Pencil"] as const).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
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

type GitHubHit = GitHubSearchResponse["items"][number];

/** An issue URL, the same shape the server attaches. A pull request uses /pull/ and is not one. */
function hasIssueLink(links: string[] | null | undefined): boolean {
  return Array.isArray(links) && links.some((link) => /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.test(link));
}

/** The link a choice adds. An issue is added only when the work item has no issue link. A pull request is always a link. Undefined when the save should not send links. */
function chosenLinks(links: string[] | null | undefined, hit: GitHubHit | null): string[] | undefined {
  if (hit === null) return undefined;
  if (hit.kind === "issue" && hasIssueLink(links)) return undefined;
  const prior = Array.isArray(links) ? links : [];
  if (prior.includes(hit.url)) return undefined;
  return [...prior, hit.url];
}

/** The choice stays with the # query that found it. A different query drops it. */
function useGitHubChoice(title: string): [GitHubHit | null, (query: string, item: GitHubHit) => void] {
  const current = hashQuery(title);
  const [choice, setChoice] = useState<{ query: string; item: GitHubHit } | null>(null);
  const picked = choice !== null && current !== undefined && choice.query === current ? choice.item : null;
  return [picked, (query, item) => setChoice({ query, item })];
}

/** The search menu for a # in the title. It lists issues and pull requests on this goal. */
function GitHubAttach({ goal, title, onPick }: { goal: string; title: string; onPick: (query: string, item: GitHubHit) => void }) {
  const query = hashQuery(title);
  if (query === undefined) return null;
  return <GitHubAttachMenu goal={goal} query={query} onPick={onPick} />;
}

/** The same # token the server searches: the text after # up to whitespace. */
function hashQuery(title: string): string | undefined {
  return /#(\S+)/.exec(title)?.[1];
}

/** The first query is sent at once. A changed query waits until 300 ms pass with no further change. */
function GitHubAttachMenu({ goal, query, onPick }: { goal: string; query: string; onPick: (query: string, item: GitHubHit) => void }) {
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    if (settled === query) return;
    const timer = setTimeout(() => setSettled(query), 300);
    return () => clearTimeout(timer);
  }, [query, settled]);
  const [loaded] = useJson<GitHubSearchResponse>(`/api/github/search?goal=${encodeURIComponent(goal)}&q=${encodeURIComponent(settled)}`);
  if (settled !== query) return null;
  if (loaded.state !== "ok" || loaded.data.items.length === 0) return null;
  return (
    <div className="slist ghit" role="menu" aria-label="Attach" onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}>
      {loaded.data.items.map((item) => (
        <button key={item.url} type="button" role="menuitem" onClick={() => onPick(settled, item)}>
          <span className="muted">{item.kind === "pull" ? "Pull request" : "Issue"}</span>
          {item.title}
        </button>
      ))}
    </div>
  );
}

/** G22: one add row for a work item. The owner may be a human or an agent. It starts In Progress; its reason is "Filed". */
export function AddWorkItem({ data, statuses, onDone }: { data: GoalPageResponse; statuses: WorkItemStatus[]; onDone: Done }) {
  const repos = data.githubRepos;
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(data.me.id);
  const [status, setStatus] = useState<WorkItemStatus>("In Progress");
  const [due, setDue] = useState("");
  const [picked, setPicked] = useState(repos[0] ?? "");
  const [hit, pickHit] = useGitHubChoice(title);
  const [result, post] = usePost((b) => onDone(true, savedStatus("workitem", b)));
  const links = chosenLinks(null, hit);
  const fields = { title, owner, status, due_date: due || null, ...(links === undefined ? {} : { links }) };
  const chosen = repos.length === 1 ? repos[0] : picked;
  return (
    <section className="panel addrow" aria-label="Work item" data-focus={formFocus("Work item")}>
      <div className="addgrid four">
        <label className="field attach">
          <span className="flabel">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <GitHubAttach goal={data.goal.id} title={title} onPick={pickHit} />
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
        <button type="button" className="btn primary" disabled={result.saving} onClick={() => post(workItemBatch(data.goal.id, fields))}>
          Add
        </button>
        {repos.length === 0 ? null : (
          <>
            {repos.length > 1 && (
              <select aria-label="Repository" value={chosen} onChange={(e) => setPicked(e.target.value)}>
                {repos.map((name, index) => (
                  <option key={`${name}-${index}`} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn" disabled={result.saving} onClick={() => post(workItemBatch(data.goal.id, fields, chosen))}>
              Add as Github Issue
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/**
 * W6: edit a work item in place: its title, owner, and due date, with one reason. Status keeps its own picker.
 * The title starts selected, so typing replaces it. Enter saves; Escape closes and keeps the stored values.
 */
export function EditWorkItem({ item, actors, repos = [], onDone }: { item: ApiWorkItem; actors: Record<string, ApiActor>; repos?: string[]; onDone: (saved: boolean) => void }) {
  const [title, setTitle] = useState(item.title);
  const [owner, setOwner] = useState(item.owner);
  const [due, setDue] = useState(item.due_date ?? "");
  const [reason, setReason] = useState("");
  const [hit, pickHit] = useGitHubChoice(title);
  const [result, post] = usePost(() => onDone(true));
  const links = chosenLinks(item.links, hit);
  const batch = workItemFieldsBatch(item, { title, owner, due_date: due || null, ...(links === undefined ? {} : { links }) }, reason);
  const save = () => batch && post(batch);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") onDone(false);
  };
  return (
    <section className="panel wiedit" aria-label={`Edit ${item.title}`} onKeyDown={keys}>
      <div className="addgrid four">
        <label className="field attach">
          <span className="flabel">Title</span>
          <input value={title} aria-label="Title" onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
          <TitleBits title={title} goal={item.goal} repos={repos} revision={title} linksOnly />
          <GitHubAttach goal={item.goal} title={title} onPick={pickHit} />
        </label>
        <label className="field">
          <span className="flabel">Owner</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {Object.values(actors).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.kind === "agent" ? " (agent)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="flabel">Due Date</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="field">
          <span className="flabel">Reason</span>
          <input value={reason} aria-label="Reason" onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <Errors result={result} />
      <div className="pactions">
        <button type="button" className="btn primary" disabled={result.saving || !batch} onClick={save}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

const STATUSES: WorkItemStatus[] = ["Backlog", "In Progress", "Completed", "Deleted"];

/** The status's shape, drawn in CSS: empty Backlog, half In Progress, checked Completed, crossed Deleted. */
const shape = (status: WorkItemStatus) => ({ Backlog: "sbacklog", "In Progress": "sprogress", Completed: "sdone", Deleted: "sdeleted" })[status];

/**
 * W7: one status control per work item, the same on the Work items page and a goal page. The pill names the status; pressing it opens
 * a menu of every status. A new status opens the row's reason box, since every status change needs a reason. Enter or Save saves it;
 * Escape or Cancel puts the pill back.
 */
function StatusPill({ item, value, onPick }: { item: ApiWorkItem; value: WorkItemStatus; onPick: (status: WorkItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const shut = () => {
    setOpen(false);
    pill.current?.focus();
  };
  const step = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") shut();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    } else return;
    e.stopPropagation();
  };
  return (
    <span className="smenu" ref={wrap}>
      <button
        ref={pill}
        type="button"
        className={`spill ${shape(value)}${value !== item.status ? " pending" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${value}. Change the status of ${item.title}`}
        onClick={() => setOpen(!open)}
      >
        <span className="sicon" aria-hidden="true" />
        {value}
        <span className="schev" aria-hidden="true" />
      </button>
      {open && (
        <div className="slist" role="menu" aria-label={`Status of ${item.title}`} onKeyDown={step}>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitemradio"
              aria-checked={status === value}
              className={`sitem ${shape(status)}`}
              autoFocus={status === value}
              onClick={() => {
                setOpen(false);
                onPick(status);
              }}
            >
              <span className="sicon" aria-hidden="true" />
              {status}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Every change is an Event with a reason (SPEC.md §13 item 24); marking an item Completed says so itself. */
const DONE_REASON = "Marked Completed";

export function useStatus(onSaved: () => void) {
  // The item being moved and the status it moves to. Completed saves at once with its own reason; any other status asks for one.
  const [moving, setMoving] = useState<{ item: ApiWorkItem; status: WorkItemStatus; quick?: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [result, post] = usePost(() => {
    setMoving(null);
    setReason("");
    onSaved();
  });
  const cancel = () => {
    setMoving(null);
    setReason("");
  };
  const save = () => moving && reason.trim() && post(workItemStatusBatch(moving.item, moving.status, reason));
  const pill = (item: ApiWorkItem) => (
    <StatusPill
      item={item}
      value={moving?.item.id === item.id ? moving.status : item.status}
      onPick={(status) => {
        setReason("");
        if (status === item.status) return setMoving(null);
        if (status !== "Completed") return setMoving({ item, status });
        setMoving({ item, status, quick: true });
        void post(workItemStatusBatch(item, status, DONE_REASON));
      }}
    />
  );
  const box = (item: ApiWorkItem) =>
    moving?.item.id !== item.id ? null : moving.quick ? (
      <div className="tickreason">
        <Errors result={result} />
      </div>
    ) : (
      <div className="tickreason">
        <input
          value={reason}
          placeholder={`Why is it ${moving.status} now?`}
          aria-label={`Reason for ${moving.status}`}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
        />
        <button type="button" className="btn primary" disabled={result.saving || !reason.trim()} onClick={save}>
          Save
        </button>
        <button type="button" className="linkbtn cancel" onClick={cancel}>
          Cancel
        </button>
        <Errors result={result} />
      </div>
    );
  return { pill, box };
}
