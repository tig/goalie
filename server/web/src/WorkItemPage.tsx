import { useRef, useState } from "react";
import type { ApiEvent, WorkItemPageResponse } from "../../src/api.ts";
import { postCommands, useJson, useLive } from "./data.ts";
import { EditWorkItem, useStatus } from "./GoalAdd.tsx";
import { Pencil } from "./GoalPage.tsx";
import { commentBatch } from "./model/commands.ts";
import { eventValue, fieldLabel, groupEvents, mayEditWorkItem, nameHover, type EventGroup } from "./model/goalpage.ts";
import { encodeFocus, formFocus } from "./model/feedback.ts";
import { goalPath, workPath } from "./model/route.ts";
import { Avatar, IssueLinks, Markdown, TitleBits } from "./parts.tsx";
import { Link } from "./router.tsx";

const time = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const when = (ts: string) => time.format(new Date(ts));
const day = (date: string | null) => (date ? eventValue(date, "due_date") : <span className="muted">None</span>);

/**
 * W8: one work item on its own page, like an issue in a tracker. The goal it is under in the breadcrumb, then its key, title, description, and Activity.
 * Its fields sit in the side panel: Status, Owner, Start Date, Due Date, and Goal. The pencil opens the same editor as a work row (W6).
 */
export function WorkItemPage({ itemKey }: { itemKey: string }) {
  const [loaded, reload] = useJson<WorkItemPageResponse>(`/api/work-items/${encodeURIComponent(itemKey)}`);
  // Another person's change shows here within the live-update time (SPEC section 3), as on Work items.
  useLive(reload);
  if (loaded.state === "loading") {
    return (
      <main className="goalpage v2 wipage" aria-busy="true">
        <div className="skel skel-title" />
        <div className="skel skel-line" />
      </main>
    );
  }
  if (loaded.state === "refused") {
    return (
      <main className="goalpage v2 wipage">
        <p className="note">
          {loaded.status === 404 ? `No work item ${itemKey}.` : loaded.reason} Go to <Link to={workPath()}>Work items</Link>.
        </p>
      </main>
    );
  }
  // Keyed by the work item only: a live reload keeps a comment being typed and an open editor.
  return <Item key={loaded.data.item.id} data={loaded.data} reload={reload} />;
}

function Item({ data, reload }: { data: WorkItemPageResponse; reload: () => void }) {
  const { item, goal, actors } = data;
  const [editing, setEditing] = useState(false);
  const { pill, box } = useStatus(reload);
  const owner = actors[item.owner] ?? { id: item.owner, name: item.owner, kind: "human" as const };
  return (
    <main className="goalpage v2 wipage" data-focus={encodeFocus({ kind: "work item", id: item.id, label: item.title })}>
      <nav className="crumbs" aria-label="Where this work item sits">
        <Link to={goalPath(goal.id)} title={nameHover(goal.id, goal.summary)}>
          {goal.summary}
        </Link>
        <span className="sep">›</span>
        <span className="muted wicrumb">{item.id}</span>
      </nav>
      <div className="glayout">
        <header className="ghead2">
          <span className="gkey wikey">{item.id}</span>
          <div className="wihead">
            <h1 className="gtitle" title={nameHover(item.id, item.title)}>
              <TitleBits title={item.title} goal={goal.id} repos={data.githubScope} />
            </h1>
            {mayEditWorkItem(data.me, item) && <Pencil label={`Edit ${item.title}`} onClick={() => setEditing(!editing)} />}
          </div>
          <IssueLinks links={item.links} goal={goal.id} repos={data.githubRepos} />
          {item.github_error && <p className="wgithub">{item.github_error}</p>}
          {box(item)}
          {editing && (
            <EditWorkItem
              item={item}
              actors={actors}
              repos={data.githubScope}
              onDone={(saved) => {
                setEditing(false);
                if (saved) reload();
              }}
            />
          )}
        </header>
        <aside className="gprops" aria-label="Properties">
          <dl className="props wiside">
            <div className="prop">
              <dt className="plabel">Status</dt>
              <dd className="pvalue">{pill(item)}</dd>
            </div>
            <div className="prop">
              <dt className="plabel">Owner</dt>
              <dd className="pvalue">
                <Avatar actor={owner} mine={owner.id === data.me.id} /> {owner.name}
              </dd>
            </div>
            <div className="prop">
              <dt className="plabel">Start Date</dt>
              <dd className="pvalue">{day(item.start_date)}</dd>
            </div>
            <div className="prop">
              <dt className="plabel">Due Date</dt>
              <dd className={`pvalue${item.late ? " late" : ""}`}>
                {day(item.due_date)}
                {item.late && " · late"}
              </dd>
            </div>
            <div className="prop">
              <dt className="plabel">Goal</dt>
              <dd className="pvalue">
                <Link to={goalPath(goal.id)}>{goal.summary}</Link>
              </dd>
            </div>
          </dl>
        </aside>
        <div className="gbody">
          <section className="gsec">
            <h2>Description</h2>
            {item.description ? <Markdown text={item.description} goal={goal.id} repos={data.githubRepos} /> : <p className="muted">No description yet.</p>}
          </section>
          <Activity data={data} reload={reload} />
        </div>
      </div>
    </main>
  );
}

/** W8: this work item's comments and changes, newest first, with the comment box at the top (GP2-9). */
function Activity({ data, reload }: { data: WorkItemPageResponse; reload: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A ref, not only state: a second click in the same frame must not post the comment twice. A comment Event is permanent.
  const posting = useRef(false);
  return (
    <section className="gsec gtalk">
      <h2>Activity</h2>
      <form
        className="commentbox"
        data-focus={formFocus("Comment")}
        onSubmit={async (e) => {
          e.preventDefault();
          if (posting.current || !text.trim()) return;
          posting.current = true;
          setSaving(true);
          setError(undefined);
          const { body } = await postCommands(commentBatch("work_item", data.item.id, text));
          posting.current = false;
          setSaving(false);
          if (body.ok) {
            setText("");
            reload();
          } else setError(body.error === "invalid" ? body.violations.map((v) => v.message).join(" ") : body.error === "stale" ? "" : body.message);
        }}
      >
        <textarea rows={2} value={text} placeholder="Comment" onChange={(e) => setText(e.target.value)} aria-label="Comment" />
        {error && <p className="ferror">{error}</p>}
        <button type="submit" className="btn primary" disabled={saving || !text.trim()}>
          Comment
        </button>
      </form>
      {data.events.length === 0 && <p className="muted note">Nothing yet.</p>}
      <ul className="events">
        {groupEvents(data.events).map((g) => (
          <Row key={g.events[0].sequence} group={g} data={data} />
        ))}
      </ul>
    </section>
  );
}

function Row({ group, data }: { group: EventGroup; data: WorkItemPageResponse }) {
  const e = group.events[0];
  const actor = data.actors[e.actor] ?? { id: e.actor, name: e.actor };
  const names = { actors: data.actors, names: { [data.goal.id]: data.goal.summary } };
  const change = (x: ApiEvent) => `${fieldLabel(x.field)}: ${eventValue(x.old, x.field, names)} → ${eventValue(x.new, x.field, names)}`;
  return (
    <li className="erow">
      <Avatar actor={actor} mine={actor.id === data.me.id} />
      <div>
        <p className="small">
          <b>{actor.name}</b> · {when(e.timestamp)}
        </p>
        {e.field === "comment" ? (
          <Markdown text={String(e.new)} goal={data.goal.id} repos={data.githubRepos} />
        ) : group.created ? (
          <p>
            Created{e.reason && <span className="muted"> “{e.reason}”</span>}
          </p>
        ) : (
          <>
            {group.events.map((x) => (
              <p key={x.sequence}>{change(x)}</p>
            ))}
            {e.reason && <p className="muted">“{e.reason}”</p>}
          </>
        )}
      </div>
    </li>
  );
}
