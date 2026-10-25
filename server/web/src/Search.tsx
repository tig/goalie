import { useState } from "react";
import type { Health } from "../../src/api.ts";
import { healthWord } from "./model/labels.ts";
import { HealthDot } from "./parts.tsx";

type Props = {
  q?: string;
  /** The health filter in force, drawn as a chip at the start of the box (rule 25a). */
  health?: Exclude<Health, null>;
  onSearch: (q: string) => void;
  /** Show all: the chip's x. */
  onClear: () => void;
};

/** The search box, in the toolbar in every view. It matches goal summaries as you type and keeps the text in the URL query. */
export function Search({ q, health, onSearch, onClear }: Props) {
  const [text, setText] = useState(q ?? "");
  const [seen, setSeen] = useState(q);
  if (seen !== q) {
    // A change from outside, such as Show all or Back, rewrites the box.
    setSeen(q);
    if (text.replace(/\s+/g, " ").trim() !== (q ?? "")) setText(q ?? "");
  }
  return (
    <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5" />
        <path d="m11 11 3.5 3.5" />
      </svg>
      {health && (
        <span className={`chip-filter ${health}`}>
          <HealthDot health={health} word="beside" />
          {healthWord(health)}
          <button
            type="button"
            className="chip-x"
            aria-label="Show all"
            onClick={(e) => {
              // Focus stays in the search box, not on the page body, when the chip goes.
              (e.currentTarget.closest("form")?.querySelector("input") as HTMLInputElement | null)?.focus();
              onClear();
            }}
          >
            ×
          </button>
        </span>
      )}
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
