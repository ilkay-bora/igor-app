"use client";

import { setCurrentLang, type Lang } from "@/lib/i18n";

// Sets the UI language before any child renders (see lib/i18n.ts). Rendered
// first in the root layout, on the server and in the browser.
export function LanguageProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  setCurrentLang(lang);
  return <>{children}</>;
}

export async function changeLanguage(lang: Lang) {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: lang }),
  });
  window.location.reload();
}
