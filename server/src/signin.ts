import { BRAND, brandHead, escape } from "./brand.ts";

/**
 * The one page the server still builds: the answer to a page request with no verified actor (ADR 0005).
 * The React app draws every other screen (ADR 0010).
 */

/** The page for a request with no verified actor. It gives the reason, and links to the host's login route with the way back. */
export function signInPage(reason: string, signIn: string): string {
  const app = escape(BRAND.app);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${brandHead()}
<style>main{max-width:32rem;margin:15vh auto;text-align:center;font-family:system-ui,sans-serif}</style>
</head>
<body>
<main>
<h1>Sign in to ${app}</h1>
<p>${app} shows goals only to a signed-in actor.</p>
<p>Not signed in: ${escape(reason)}.</p>
<p><a href="${escape(signIn)}">Sign in</a></p>
</main>
</body>
</html>
`;
}
