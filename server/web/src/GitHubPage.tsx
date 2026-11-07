import { useState } from "react";
import type { GitHubStatusResponse } from "../../src/api.ts";
import { postGitHubSettings, useJson } from "./data.ts";

/**
 * The GitHub page. The GOALIE owner sees the repositories in github_repos, whether GitHub is configured, the last update, and the last signed notice.
 * The owner sets the app id, the installation id, the private key, and the public URL. The page accepts the private key and does not show it again.
 * The owner adds and removes the repositories on this page. An entry is owner/repo or owner/*. An empty list stays empty.
 */
export function GitHubPage() {
  const [loaded] = useJson<GitHubStatusResponse>("/api/github/status");
  return (
    <main className="githubpage">
      <h1>GitHub</h1>
      {loaded.state === "loading" && <div className="skel skel-row" />}
      {loaded.state === "refused" && <p className="note">{loaded.reason}</p>}
      {loaded.state === "ok" && <Settings initial={loaded.data} />}
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <section className="card">
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
      <Status data={view} saving={saving} error={error} onChange={(repositories) => save(repositories)} />
    </>
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
