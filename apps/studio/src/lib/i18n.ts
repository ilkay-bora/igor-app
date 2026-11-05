import { EN } from "@/lib/i18n-en";

// UI language. Turkish is the source language: every UI string is written in
// Turkish and wrapped in t(), and that Turkish text is the lookup key into the
// English table (i18n-en.ts). A missing translation falls back to Turkish, so
// nothing ever renders empty. Placeholders use {name}: t("{n} klip", { n: 3 }).
//
// The language is an install-wide setting (data/settings.json), not a
// per-request value: the root layout reads it and LanguageProvider sets it
// here before any child renders, so t() can be called anywhere at render or
// event time without a hook. Changing it reloads the page. Module-level
// constants (labels in providers.ts) stay Turkish and are translated where
// they are displayed.

export type Lang = "tr" | "en";
export const LANGS: { value: Lang; label: string }[] = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "English" },
];

let current: Lang = "tr";

export function setCurrentLang(lang: Lang) {
  current = lang;
}

export function currentLang(): Lang {
  return current;
}

export function translate(lang: Lang, text: string, vars?: Record<string, string | number | null | undefined>): string {
  let out = lang === "en" ? (EN[text] ?? text) : text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v ?? ""));
  }
  return out;
}

export function t(text: string | null | undefined, vars?: Record<string, string | number | null | undefined>): string {
  return text ? translate(current, text, vars) : "";
}

/** Locale for number/date formatting in the current language. */
export function locale(): string {
  return current === "en" ? "en-US" : "tr-TR";
}

export function isLang(value: unknown): value is Lang {
  return value === "tr" || value === "en";
}
