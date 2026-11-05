import { readSettings } from "@/lib/settings";
import { translate, type Lang } from "@/lib/i18n";

// Server side of i18n: the saved language, else the machine's locale (IGOR
// runs locally, so the server's locale is the user's). Route handlers and
// server libs use tServer() for messages that reach the UI.

export function serverLang(): Lang {
  const saved = readSettings().language;
  if (saved) return saved;
  const sys = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  return sys.startsWith("tr") ? "tr" : "en";
}

export function tServer(text: string, vars?: Record<string, string | number | null | undefined>): string {
  return translate(serverLang(), text, vars);
}
