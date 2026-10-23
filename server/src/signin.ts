/**
 * The one page the server still builds: the answer to a page request with no verified actor (ADR 0005).
 * The React app draws every other screen (ADR 0010). Host configuration serves the shared chrome at /_xw/.
 */

/** The one brand object. An organization reskins GOALIE here and in the app's :root tokens. */
export const BRAND = { app: "Goalie", chrome: "/_xw/" } as const;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The page for a request with no verified actor. It gives the reason. */
export function signInPage(reason: string): string {
  const { app, chrome } = BRAND;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escape(app)}</title>
<link rel="icon" type="image/svg+xml" href="${chrome}brand/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="${chrome}brand/favicon-32.png">
<link rel="stylesheet" href="${chrome}chrome.css">
<script src="${chrome}chrome.js" defer></script>
<meta name="xw-app" content="${escape(app)}">
<style>main{max-width:32rem;margin:15vh auto;text-align:center;font-family:system-ui,sans-serif}</style>
</head>
<body>
<main>
<h1>Sign in to ${escape(app)}</h1>
<p>${escape(app)} shows goals only to a signed-in actor.</p>
<p>Not signed in: ${escape(reason)}.</p>
</main>
</body>
</html>
`;
}
