/**
 * Markdown text as a tree the app draws with React (issue #61). Raw HTML is never read: it stays text, and React escapes it.
 * A link keeps only an http or https address. A GitHub issue or pull request reference becomes a link (GL8).
 * The subset: paragraphs, line breaks, headings, bullet and numbered lists, quotes, fenced code, inline code, bold, italic, links.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "code"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p" | "quote"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "code"; v: string };

/** Associated repositories, each `owner/repo`, compared without case. A repeated entry is one repository. */
function associatedRepos(repos: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of repos) {
    const slash = entry.indexOf("/");
    if (slash <= 0 || slash !== entry.lastIndexOf("/")) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

const repoNameOf = (entry: string) => entry.slice(entry.indexOf("/") + 1);

/** The one associated repository with this name. Zero matches, or two, are none. */
function oneNamed(name: string, repos: string[]): string | undefined {
  const want = name.toLowerCase();
  const found = associatedRepos(repos).filter((entry) => repoNameOf(entry).toLowerCase() === want);
  return found.length === 1 ? found[0] : undefined;
}

/** The associated `owner/repo`, or none. The names compare without case. */
function namedPair(owner: string, repo: string, repos: string[]): string | undefined {
  const want = `${owner}/${repo}`.toLowerCase();
  return associatedRepos(repos).find((entry) => entry.toLowerCase() === want);
}

/** `repo#N` when that owner/repo is associated and the repository name is unique. Otherwise `owner/repo#N`. */
function refText(owner: string, repo: string, n: string, repos: string[]): string {
  const hit = namedPair(owner, repo, repos);
  if (hit !== undefined && oneNamed(repoNameOf(hit), repos) !== undefined) return `${repoNameOf(hit)}#${n}`;
  return `${owner}/${repo}#${n}`;
}

/** The owner and repository of the one associated repository with this name. */
function resolveBare(name: string, repos: string[]): { owner: string; repo: string } | undefined {
  const hit = oneNamed(name, repos);
  if (hit === undefined) return undefined;
  const slash = hit.indexOf("/");
  return { owner: hit.slice(0, slash), repo: hit.slice(slash + 1) };
}

/** The short name, then the title and open or closed. No read, or no title, stays the short name. */
export function refLabel(label: string, found: { title: string; state: "open" | "closed" } | null): string {
  if (found === null || found.title === "") return label;
  return `${label} ${found.title} ${found.state}`;
}

export type RefFound = { title: string; state: "open" | "closed" };

/** An http or https github.com issue or pull URL, as https, with no query, fragment, or trailing slash. Anything else is null. */
const CANONICAL_REF = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(issues|pull)\/(\d+)\/?(?:[?#][^\s]*)?$/i;

export function canonicalRefUrl(href: string): string | null {
  const match = CANONICAL_REF.exec(href);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined || match[4] === undefined) return null;
  return `https://github.com/${match[1]}/${match[2]}/${match[3].toLowerCase()}/${match[4]}`;
}

/** One read per goal, canonical URL, and revision. Two callers share that promise. A title stays until the revision changes. A miss does not. */
const refReads = new Map<string, Promise<RefFound | null>>();

export function refTitle(goal: string, href: string, revision: string | number, load: (path: string) => Promise<RefFound | null>): Promise<RefFound | null> {
  const url = canonicalRefUrl(href);
  if (url === null) return Promise.resolve(null);
  const mark = `\0${goal}\0${url}`;
  const key = `${revision}${mark}`;
  for (const old of refReads.keys()) {
    const cut = old.indexOf("\0");
    if (cut > 0 && old.slice(cut) === mark && old.slice(0, cut) !== String(revision)) refReads.delete(old);
  }
  const hit = refReads.get(key);
  if (hit !== undefined) return hit;
  const path = `/api/github/ref?goal=${encodeURIComponent(goal)}&url=${encodeURIComponent(url)}`;
  const pending = Promise.resolve()
    .then(() => load(path))
    .then(
      (found) => {
        if (found === null) refReads.delete(key);
        return found;
      },
      (error: unknown) => {
        refReads.delete(key);
        throw error;
      },
    );
  refReads.set(key, pending);
  return pending;
}

/** A trailing slash is the same issue or pull request. A query or a fragment is the same one. The href keeps issues or pull. */
const GH_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?(?:[?#][^\s]*)?$/;

/** Each GitHub issue or pull request named in a work item's links, once, in that order. The label is the short name. A pull request keeps its /pull/ URL. repos are the goal's associated repositories, each owner/repo. */
export function githubIssues(links: string[] | null, repos: string[] = []): { href: string; label: string }[] {
  if (!Array.isArray(links)) return [];
  const out: { href: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (typeof link !== "string") continue;
    const match = GH_URL.exec(link);
    if (match === null) continue;
    const href = `https://github.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ href, label: refText(match[1], match[2], match[4], repos) });
  }
  return out;
}

const issueUrl = (owner: string, repo: string, kind: string, n: string) => `https://github.com/${owner}/${repo}/${kind}/${n}`;

/** A link address the app may open: http or https only. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const NAME = "[A-Za-z0-9_.-]+";
const REPO = "[a-z][a-z0-9_.-]*";
// One alternative per inline form. The first match at a position wins, so code and links come before emphasis.
const INLINE = new RegExp(
  [
    "`([^`\\n]+)`", // 1 code
    "\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)", // 2 text, 3 address
    `https?://github\\.com/(${NAME})/(${NAME})/(issues|pull)/(\\d+)[^\\s<>()]*`, // 4 owner, 5 repo, 6 kind, 7 number
    "https?://[^\\s<>()]+[^\\s<>().,;:!?'\"]", // a bare address
    `(?<![\\w/.#-])(?:(${NAME})/)?(${REPO})/(issues|pull)/(\\d+)\\b`, // 8 owner?, 9 repo, 10 kind, 11 number
    `(?<![\\w/.#-])(?:(${NAME})/)?(${REPO})#(\\d+)\\b`, // 12 owner?, 13 repo, 14 number
    "\\*\\*([^*\\n]+)\\*\\*", // 15 bold
    "(?<![\\w*])\\*([^*\\n]+)\\*(?![\\w*])", // 16 italic
    "(?<![\\w_])_([^_\\n]+)_(?![\\w_])", // 17 italic
  ].join("|"),
  "g",
);

const text = (v: string): Inline[] => (v ? [{ t: "text", v }] : []);

/** One line of inline Markdown, with no line breaks in it. A bare repository name links only when repos names exactly one repository of that name. */
function line(src: string, repos: string[]): Inline[] {
  const out: Inline[] = [];
  const addText = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last !== undefined && last.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    out.push(...text(src.slice(at, m.index)));
    at = m.index + m[0].length;
    const g = m.slice(1);
    if (g[0] !== undefined) out.push({ t: "code", v: g[0] });
    else if (g[1] !== undefined) {
      const href = safeHref(g[2]);
      out.push(href ? { t: "link", href, c: line(g[1], repos) } : { t: "text", v: m[0] });
    } else if (g[3] !== undefined && g[4] !== undefined && g[6] !== undefined) out.push({ t: "link", href: m[0], c: text(refText(g[3], g[4], g[6], repos)) });
    else if (g[8] !== undefined && g[9] !== undefined && g[10] !== undefined) {
      const picked = g[7] !== undefined ? { owner: g[7], repo: g[8] } : resolveBare(g[8], repos);
      if (picked === undefined) addText(m[0]);
      else out.push({ t: "link", href: issueUrl(picked.owner, picked.repo, g[9], g[10]), c: text(refText(picked.owner, picked.repo, g[10], repos)) });
    } else if (g[12] !== undefined && g[13] !== undefined) {
      const picked = g[11] !== undefined ? { owner: g[11], repo: g[12] } : resolveBare(g[12], repos);
      if (picked === undefined) addText(m[0]);
      else out.push({ t: "link", href: issueUrl(picked.owner, picked.repo, "issues", g[13]), c: text(refText(picked.owner, picked.repo, g[13], repos)) });
    } else if (g[14] !== undefined) out.push({ t: "strong", c: line(g[14], repos) });
    else if (g[15] !== undefined || g[16] !== undefined) out.push({ t: "em", c: line((g[15] ?? g[16]) as string, repos) });
    else {
      const href = safeHref(m[0]);
      out.push(href ? { t: "link", href, c: text(m[0]) } : { t: "text", v: m[0] });
    }
  }
  addText(src.slice(at));
  return out;
}

/** Lines joined by a line break, as GitHub comments draw them. */
function lines(src: string[], repos: string[]): Inline[] {
  return src.flatMap((l, i) => (i ? [{ t: "br" } as Inline, ...line(l, repos)] : line(l, repos)));
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

/** Markdown text as blocks. repos are the goal's associated repositories, each owner/repo. No repository name is assumed. */
export function markdown(src: string, repos: string[] = []): Block[] {
  const all = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  const take = (re: RegExp) => {
    const got: string[] = [];
    for (let m = all[i]?.match(re); m; m = all[++i]?.match(re)) got.push(m[1]);
    return got;
  };
  while (i < all.length) {
    const l = all[i];
    if (!l.trim()) i++;
    else if (FENCE.test(l)) {
      const body: string[] = [];
      for (i++; i < all.length && !FENCE.test(all[i]); i++) body.push(all[i]);
      i++;
      out.push({ t: "code", v: body.join("\n") });
    } else if (HEADING.test(l)) {
      const m = l.match(HEADING)!;
      out.push({ t: "h", level: m[1].length as 1 | 2 | 3, c: line(m[2], repos) });
      i++;
    } else if (BULLET.test(l)) out.push({ t: "ul", items: take(BULLET).map((item) => line(item, repos)) });
    else if (NUMBER.test(l)) out.push({ t: "ol", items: take(NUMBER).map((item) => line(item, repos)) });
    else if (QUOTE.test(l)) out.push({ t: "quote", c: lines(take(QUOTE), repos) });
    else {
      const para: string[] = [];
      for (; i < all.length && all[i].trim() && ![FENCE, HEADING, BULLET, NUMBER, QUOTE].some((re) => re.test(all[i])); i++) para.push(all[i]);
      out.push({ t: "p", c: lines(para, repos) });
    }
  }
  return out;
}
