import fs from "fs";
import path from "path";

// User-editable app settings (API keys, local ComfyUI location). Entered in
// the first-run setup screen and changeable later on /settings. Stored in
// data/settings.json, which is gitignored and never leaves this machine.
// Environment variables (.env.local) still work as a fallback, so a dev
// checkout keeps running without going through setup.

export type Settings = {
  geminiApiKey?: string;
  pollinationsApiKey?: string;
  comfyuiDir?: string;
  comfyuiUrl?: string;
  setupDone?: boolean;
  language?: "tr" | "en";
};

export type SettingKey = Exclude<keyof Settings, "setupDone" | "language">;

const FILE = path.join(process.cwd(), "data", "settings.json");

const ENV_FALLBACK: Record<SettingKey, string> = {
  geminiApiKey: "GEMINI_API_KEY",
  pollinationsApiKey: "POLLINATIONS_API_KEY",
  comfyuiDir: "COMFYUI_DIR",
  comfyuiUrl: "COMFYUI_URL",
};

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  comfyuiUrl: "http://127.0.0.1:8188",
  comfyuiDir: path.resolve(process.cwd(), "..", "ComfyUI"),
};

// Cached by mtime so hot paths (every generation request) don't re-parse.
let cache: { mtimeMs: number; data: Settings } | null = null;

export function readSettings(): Settings {
  try {
    const { mtimeMs } = fs.statSync(FILE);
    if (cache && cache.mtimeMs === mtimeMs) return cache.data;
    const data = JSON.parse(fs.readFileSync(FILE, "utf8")) as Settings;
    cache = { mtimeMs, data };
    return data;
  } catch {
    return {};
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...readSettings() };
  for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
    if (v === undefined) continue;
    if (v === "" || v === null) delete next[k];
    else (next as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  cache = null;
  return next;
}

export type SettingSource = "saved" | "env" | "default" | "none";

export function settingSource(key: SettingKey): SettingSource {
  if (readSettings()[key]) return "saved";
  if (process.env[ENV_FALLBACK[key]]) return "env";
  if (DEFAULTS[key]) return "default";
  return "none";
}

/** Saved value, else the env var, else the built-in default. */
export function getSetting(key: SettingKey): string | undefined {
  return readSettings()[key] || process.env[ENV_FALLBACK[key]] || DEFAULTS[key];
}

export function comfyUrl(): string {
  return (getSetting("comfyuiUrl") ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
}
