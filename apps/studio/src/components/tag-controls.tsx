"use client";

import { useId } from "react";
import { normalizeTag } from "@/lib/providers";

/** Free-text tag field with suggestions from tags already in use. */
export function TagInput({
  value,
  onChange,
  suggestions,
  label = "Etiket",
  compact,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  label?: string;
  /** Toolbar variant: no label above, "#" prefix inside, same h-9 as buttons. */
  compact?: boolean;
}) {
  const listId = useId();
  const datalist = (
    <datalist id={listId}>
      {suggestions.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
  if (compact) {
    return (
      <label className="border-input focus-within:border-ring hover:bg-input/20 flex h-9 w-36 items-center gap-1 rounded-md border px-2.5 text-sm transition-colors">
        <span className="text-muted-foreground">#</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeTag(e.target.value))}
          list={listId}
          aria-label={label}
          placeholder="etiket"
          maxLength={40}
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none"
        />
        {datalist}
      </label>
    );
  }
  return (
    <label className="min-w-40 space-y-1.5">
      <span className="text-muted-foreground block text-xs">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(normalizeTag(e.target.value))}
        list={listId}
        placeholder="opsiyonel"
        maxLength={40}
        className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
      />
      {datalist}
    </label>
  );
}

/** "All" chip plus one chip per tag in use. Renders nothing when no tags exist. */
export function TagFilter({
  tags,
  active,
  onChange,
}: {
  tags: string[];
  active: string | null;
  onChange: (tag: string | null) => void;
}) {
  if (tags.length === 0) return null;
  const chip = (selected: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onChange(null)} className={chip(active === null)}>
        Tümü
      </button>
      {tags.map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)} className={chip(active === t)}>
          #{t}
        </button>
      ))}
    </div>
  );
}
