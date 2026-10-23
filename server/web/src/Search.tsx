import { useState } from "react";

/** The search box. It matches goal summaries as you type and keeps the text in the URL query. */
export function Search({ q, onSearch }: { q?: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(q ?? "");
  const [seen, setSeen] = useState(q);
  if (seen !== q) {
    // A change from outside, such as Show all or Back, rewrites the box.
    setSeen(q);
    if (text.trim() !== (q ?? "")) setText(q ?? "");
  }
  return (
    <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5" />
        <path d="m11 11 3.5 3.5" />
      </svg>
      <input
        type="search"
        value={text}
        placeholder="Search goals"
        aria-label="Search goals"
        onChange={(e) => {
          setText(e.target.value);
          onSearch(e.target.value);
        }}
      />
    </form>
  );
}
