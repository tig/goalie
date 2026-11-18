import { useState } from "react";
import type { GitHubStatusResponse } from "../../src/api.ts";
import { postGitHubSettings, postGitHubSetup, postManifestToGitHub, useJson } from "./data.ts";
import { backPath } from "./model/route.ts";
import { homeSearch, Link } from "./router.tsx";

/**
 * The GitHub page. The GOALIE owner sees the repositories in github_repos, whether GitHub is configured, the last update, and the last signed notice.
 * The owner sets the app id, the installation id, the private key, and the public URL. The page accepts the private key and does not show it again.
 * The owner adds and removes the repositories on this page. An entry is owner/repo or owner/*. An empty list stays empty.
 * Create GitHub App makes and stores the App with GitHub's App Manifest flow, so no key is pasted (issue #109). The four fields stay under Use an existing App.
 */
export function GitHubPage() {
  const [loaded] = useJson<GitHubStatusResponse>("/api/github/status");
  return (
    <main className="githubpage">
      <h1>GitHub</h1>
      {loaded.state === "loading" && <div className="skel skel-row" />}
      {loaded.state === "refused" &&
        (loaded.status === 403 ? (
          <p className="note">
            Only the GOALIE owner can see the GitHub page. Go to <Link to={backPath(homeSearch())}>Home</Link>.
          </p>
        ) : (
          <p className="note">{loaded.reason}</p>
        ))}
      {loaded.state === "ok" && (
        <>
          <Connect data={loaded.data} />
          <Settings initial={loaded.data} />
        </>
      )}
    </main>
  );
}

function Settings({ initial }: { initial: GitHubStatusResponse }) {
  const [view, setView] = useState(initial);
  const [appId, setAppId] = useState(initial.appId ?? "");
  const [installationId, setInstallationId] = useState(initial.installationId ?? "");
  const [publicUrl, setPublicUrl] = useState(initial.publicUrl ?? "");
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(repositories?: string[]): Promise<boolean> {
    setSaving(true);
    setError("");
    const saved = await postGitHubSettings({ appId, installationId, publicUrl, privateKey, ...(repositories === undefined ? {} : { repositories }) });
    setSaving(false);
    if (!saved.ok) {
      setError(saved.reason);
      return false;
    }
    setView(saved.data);
    setAppId(saved.data.appId ?? "");
    setInstallationId(saved.data.installationId ?? "");
    setPublicUrl(saved.data.publicUrl ?? "");
    setPrivateKey("");
    return true;
  }
  return (
    <>
      <details className="card existing" open={initial.appId !== null && initial.appSlug === null}>
        <summary>Use an existing App</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <section>
          <label className="field">
            <span className="flabel">App id</span>
            <input value={appId} onChange={(event) => setAppId(event.target.value)} autoComplete="off" inputMode="numeric" />
          </label>
          <label className="field">
            <span className="flabel">Installation id</span>
            <input value={installationId} onChange={(event) => setInstallationId(event.target.value)} autoComplete="off" inputMode="numeric" />
          </label>
          <label className="field">
            <span className="flabel">Private key</span>
            <textarea value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder={view.privateKeySet ? "Paste a new key to replace it" : "Paste the private key"} />
            {view.privateKeySet && <p className="small">A key is saved.</p>}
          </label>
          <label className="field">
            <span className="flabel">Public URL</span>
            <input value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} autoComplete="off" />
          </label>
          {error !== "" && <p className="ferror">{error}</p>}
          <div className="pactions">
            <button type="submit" className="btn primary" disabled={saving}>Save</button>
          </div>
        </section>
      </form>
      </details>
      <Status data={view} saving={saving} error={error} onChange={(repositories) => save(repositories)} />
    </>
  );
}

/** A host GitHub cannot reach, so the Public URL is not filled with it. The server refuses these and more. */
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$|\.localhost$/i;

/** Create GitHub App, then Install on GitHub, then Connected. GitHub sends the browser back to this page after each step. */
function Connect({ data }: { data: GitHubStatusResponse }) {
  const [publicUrl, setPublicUrl] = useState(data.publicUrl ?? (LOCAL.test(window.location.hostname) ? "" : window.location.origin));
  const [org, setOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    const started = await postGitHubSetup({ org, publicUrl });
    if (!started.ok) {
      setBusy(false);
      setError(started.reason);
      return;
    }
    postManifestToGitHub(started.data);
  }
  return (
    <section className="card connect">
      {data.setupError !== null && <p className="ferror">{data.setupError}</p>}
      {data.installUrl !== null ? (
        <>
          <p>
            GitHub made the App <strong>{data.appSlug}</strong>. Install it on the repositories GOALIE uses.
          </p>
          <div className="pactions">
            <a className="btn primary" href={data.installUrl}>Install on GitHub</a>
          </div>
        </>
      ) : data.configured ? (
        <p>{data.appSlug !== null ? <>Connected to GitHub as <strong>{data.appSlug}</strong>.</> : "Connected to GitHub."}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p>GOALIE makes its own GitHub App. You approve it on GitHub, then pick the repositories. No key to copy.</p>
          <label className="field">
            <span className="flabel">Public URL</span>
            <input value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} autoComplete="off" placeholder="https://goalie.example.com" />
            <span className="small">Where GitHub sends notices. It must be reachable from the internet.</span>
          </label>
          <label className="field">
            <span className="flabel">Organization</span>
            <input value={org} onChange={(event) => setOrg(event.target.value)} autoComplete="off" placeholder="Leave blank for your own account" />
          </label>
          {error !== "" && <p className="ferror">{error}</p>}
          <div className="pactions">
            <button type="submit" className="btn primary" disabled={busy}>Create GitHub App</button>
          </div>
        </form>
      )}
    </section>
  );
}

function Status({ data, saving, error, onChange }: { data: GitHubStatusResponse; saving: boolean; error: string; onChange: (repositories: string[]) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  function add() {
    const text = draft.trim();
    if (text === "" || saving) return;
    void onChange([...data.repositories, text]).then((ok) => {
      if (ok) setDraft("");
    });
  }
  return (
    <section className="card">
      <div className="lbl">Repositories</div>
      {data.repositories.length === 0 ? <p>none</p> : data.repositories.map((name, index) => (
        <p key={`${name}-${index}`}>
          {name} <button type="button" className="btn" disabled={saving} onClick={() => void onChange(data.repositories.filter((repo) => repo !== name))}>Remove</button>
        </p>
      ))}
      <label className="field">
        <span className="flabel">Repository</span>
        <input value={draft} aria-label="Repository" placeholder="owner/repo" autoComplete="off" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      </label>
      {error !== "" && <p className="ferror">{error}</p>}
      <div className="pactions">
        <button type="button" className="btn" disabled={saving} onClick={add}>Add</button>
      </div>
      <div className="lbl">Configured</div>
      <p>{data.configured ? "Configured." : "Not configured."}</p>
      <div className="lbl">Last update</div>
      <p>{data.outbound ? data.outbound.detail : "none"}</p>
      <div className="lbl">Last signed notice</div>
      <p>{data.inbound ? data.inbound.detail : "none"}</p>
    </section>
  );
}
