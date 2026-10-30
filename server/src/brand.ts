/**
 * The one brand source (review E4). An organization reskins GOALIE here and in the app's :root tokens.
 * The server writes brandHead() into the sign-in page and into the built index.html at BRAND_SLOT.
 * Host configuration serves the shared chrome at `chrome`.
 */
export const BRAND = { app: "Goalie", mark: "G", chrome: "/_xw/" } as const;

/** The comment in web/index.html that the server replaces with brandHead(). */
export const BRAND_SLOT = "<!--goalie:brand-->";

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The head tags every page carries: title, icons, the shared chrome, and the brand the app reads from #goalie-brand. */
export function brandHead(): string {
  const { app, mark, chrome } = BRAND;
  const data = JSON.stringify({ app, mark }).replace(/</g, "\\u003c");
  return `<title>${escape(app)}</title>
<link rel="icon" type="image/svg+xml" href="${chrome}brand/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="${chrome}brand/favicon-32.png">
<link rel="stylesheet" href="${chrome}chrome.css">
<script src="${chrome}chrome.js" defer></script>
<meta name="xw-app" content="${escape(app)}">
<script id="goalie-brand" type="application/json">${data}</script>`;
}
