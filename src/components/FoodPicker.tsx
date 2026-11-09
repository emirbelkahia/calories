"use client";

import { useEffect, useId, useRef, useState } from "react";
import { filterFoodChoices, type FoodChoice } from "@/lib/food-choices";

interface Props {
  value: string;
  saved: FoodChoice[];
  staples: FoodChoice[];
  savedLabel: string;
  stapleLabel: string;
  searchLabel: string;
  placeholder: string;
  emptyHint: string;
  noMatch: string;
  onChange: (value: string) => void;
}

export function FoodPicker({
  value,
  saved,
  staples,
  savedLabel,
  stapleLabel,
  searchLabel,
  placeholder,
  emptyHint,
  noMatch,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected =
    saved.find((item) => item.value === value) ??
    staples.find((item) => item.value === value);
  const results = filterFoodChoices(query, saved, staples);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="food-picker" ref={rootRef}>
      <button
        type="button"
        className="food-picker-trigger"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="food-picker-value">
          {selected?.name ?? placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="food-picker-panel panel">
          <input
            autoFocus
            aria-label={searchLabel}
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div id={listId} role="listbox" className="food-picker-list">
            {results.saved.length > 0 && (
              <p className="food-picker-group">{savedLabel}</p>
            )}
            {results.saved.map((item) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                className="food-picker-option"
                onClick={() => choose(item.value)}
              >
                {item.name}
              </button>
            ))}
            {query.trim() && results.staples.length > 0 && (
              <p className="food-picker-group">{stapleLabel}</p>
            )}
            {results.staples.map((item) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                className="food-picker-option"
                onClick={() => choose(item.value)}
              >
                {item.name}
              </button>
            ))}
            {!query.trim() && (
              <p className="food-picker-hint">{emptyHint}</p>
            )}
            {query.trim() &&
              results.saved.length === 0 &&
              results.staples.length === 0 && (
                <p className="food-picker-hint">{noMatch}</p>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
