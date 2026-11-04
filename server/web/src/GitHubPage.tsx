import type { GitHubStatusResponse } from "../../src/api.ts";
import { useJson } from "./data.ts";

/**
 * The GitHub page. The GOALIE owner sees whether the repository is configured, the last update, and the last signed notice.
 * It reads GET /api/github/status. It has no input and no button that writes.
 */
export function GitHubPage() {
  const [loaded] = useJson<GitHubStatusResponse>("/api/github/status");
  return (
    <main className="githubpage">
      <h1>GitHub</h1>
      {loaded.state === "loading" && <div className="skel skel-row" />}
      {loaded.state === "refused" && <p className="note">{loaded.reason}</p>}
      {loaded.state === "ok" && <Status data={loaded.data} />}
    </main>
  );
}

function Status({ data }: { data: GitHubStatusResponse }) {
  return (
    <section className="card">
      <div className="lbl">Repository</div>
      <p>{data.repository ?? "none"}</p>
      <div className="lbl">Configured</div>
      <p>{data.configured ? "Configured." : "Not configured."}</p>
      <div className="lbl">Last update</div>
      <p>{data.outbound ? data.outbound.detail : "none"}</p>
      <div className="lbl">Last signed notice</div>
      <p>{data.inbound ? data.inbound.detail : "none"}</p>
    </section>
  );
}
