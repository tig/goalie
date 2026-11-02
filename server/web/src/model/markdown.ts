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

/** The owner a bare `repo#N` or `repo/issues/N` belongs to. GOALIE's own repo is Tig's; every other is Excaliwire's. */
const OWNERS: Record<string, string> = { goalie: "tig" };
const DEFAULT_OWNER = "excaliwire";
const ownerOf = (repo: string) => OWNERS[repo] ?? DEFAULT_OWNER;

/** "factory#172" for a repo of its default owner, "someone/thing#3" for any other. */
function refText(owner: string, repo: string, n: string): string {
  return owner === ownerOf(repo) ? `${repo}#${n}` : `${owner}/${repo}#${n}`;
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

/** One line of inline Markdown, with no line breaks in it. */
function line(src: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    out.push(...text(src.slice(at, m.index)));
    at = m.index + m[0].length;
    const g = m.slice(1);
    if (g[0] !== undefined) out.push({ t: "code", v: g[0] });
    else if (g[1] !== undefined) {
      const href = safeHref(g[2]);
      out.push(href ? { t: "link", href, c: line(g[1]) } : { t: "text", v: m[0] });
    } else if (g[3] !== undefined) out.push({ t: "link", href: m[0], c: text(refText(g[3], g[4], g[6])) });
    else if (g[8] !== undefined) {
      const owner = g[7] ?? ownerOf(g[8]);
      out.push({ t: "link", href: issueUrl(owner, g[8], g[9], g[10]), c: text(refText(owner, g[8], g[10])) });
    } else if (g[12] !== undefined) {
      const owner = g[11] ?? ownerOf(g[12]);
      out.push({ t: "link", href: issueUrl(owner, g[12], "issues", g[13]), c: text(refText(owner, g[12], g[13])) });
    } else if (g[14] !== undefined) out.push({ t: "strong", c: line(g[14]) });
    else if (g[15] !== undefined || g[16] !== undefined) out.push({ t: "em", c: line(g[15] ?? g[16]) });
    else {
      const href = safeHref(m[0]);
      out.push(href ? { t: "link", href, c: text(m[0]) } : { t: "text", v: m[0] });
    }
  }
  out.push(...text(src.slice(at)));
  return out;
}

/** Lines joined by a line break, as GitHub comments draw them. */
function lines(src: string[]): Inline[] {
  return src.flatMap((l, i) => (i ? [{ t: "br" } as Inline, ...line(l)] : line(l)));
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

/** Markdown text as blocks. */
export function markdown(src: string): Block[] {
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
      out.push({ t: "h", level: m[1].length as 1 | 2 | 3, c: line(m[2]) });
      i++;
    } else if (BULLET.test(l)) out.push({ t: "ul", items: take(BULLET).map(line) });
    else if (NUMBER.test(l)) out.push({ t: "ol", items: take(NUMBER).map(line) });
    else if (QUOTE.test(l)) out.push({ t: "quote", c: lines(take(QUOTE)) });
    else {
      const para: string[] = [];
      for (; i < all.length && all[i].trim() && ![FENCE, HEADING, BULLET, NUMBER, QUOTE].some((re) => re.test(all[i])); i++) para.push(all[i]);
      out.push({ t: "p", c: lines(para) });
    }
  }
  return out;
}
