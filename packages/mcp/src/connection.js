import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Finds the running IGOR studio and its sign-in token, in this order:
// 1. IGOR_URL + IGOR_TOKEN environment variables.
// 2. The desktop app's server.json (written while it runs; the port changes
//    between runs).
// 3. A dev server on http://localhost:3000 with the token from the studio's
//    data/local-token (IGOR_STUDIO_DIR, or this repo's apps/studio).

const HERE = path.dirname(fileURLToPath(import.meta.url));

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function envFileValue(file, key) {
  const text = readText(file);
  const m = text && new RegExp(`^${key}=(.*)$`, "m").exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") || null : null;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function desktopServerInfo() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const info = readJson(path.join(appData, "@igor", "desktop", "server.json"));
  if (!info?.url || !info?.token) return null;
  if (info.pid && !processAlive(info.pid)) return null;
  return { url: info.url, token: info.token, studioDir: info.studioDir ?? null, source: "desktop" };
}

export function resolveConnection() {
  if (process.env.IGOR_URL) {
    return {
      url: process.env.IGOR_URL.replace(/\/+$/, ""),
      token: process.env.IGOR_TOKEN ?? "",
      studioDir: process.env.IGOR_STUDIO_DIR ?? null,
      source: "env",
    };
  }
  const desktop = desktopServerInfo();
  if (desktop) return desktop;
  const studioDir = process.env.IGOR_STUDIO_DIR || path.resolve(HERE, "..", "..", "..", "apps", "studio");
  return {
    url: "http://localhost:3000",
    // Same precedence as the studio: APP_TOKEN from .env.local beats the
    // generated data/local-token.
    token:
      process.env.IGOR_TOKEN ||
      envFileValue(path.join(studioDir, ".env.local"), "APP_TOKEN") ||
      readText(path.join(studioDir, "data", "local-token")) ||
      "",
    studioDir: fs.existsSync(studioDir) ? studioDir : null,
    source: "dev",
  };
}

export class IgorError extends Error {}

/** Calls the studio's local API. Resolves the connection on every call, so
 *  starting IGOR after the agent needs no MCP restart. */
export async function api(method, route, body) {
  const conn = resolveConnection();
  let res;
  try {
    res = await fetch(`${conn.url}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${conn.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new IgorError(
      `IGOR is not reachable at ${conn.url}. Open the IGOR desktop app (or run \`npm run dev\` in the igor-app repo), then try again.`
    );
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401) {
    throw new IgorError(
      `IGOR rejected the token (${conn.source}). Set IGOR_TOKEN, or let the MCP server read it from the desktop app / data/local-token.`
    );
  }
  if (!res.ok) throw new IgorError(data?.error ?? `IGOR API ${method} ${route} failed with ${res.status}`);
  return { data, baseUrl: conn.url, studioDir: conn.studioDir };
}
