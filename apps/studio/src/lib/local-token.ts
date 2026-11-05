import crypto from "crypto";
import fs from "fs";
import path from "path";

// Sign-in token for this install. The desktop app passes its own token as
// APP_TOKEN; a plain `npm run dev` checkout has none, so one is generated on
// first start and kept in data/local-token (gitignored). The server prints a
// one-click sign-in link with it at startup, like Jupyter.

const FILE = path.join(process.cwd(), "data", "local-token");

let cached: string | null = null;

export function getAppToken(): string {
  if (process.env.APP_TOKEN) return process.env.APP_TOKEN;
  if (cached) return cached;
  try {
    const saved = fs.readFileSync(FILE, "utf8").trim();
    if (saved) return (cached = saved);
  } catch {}
  const token = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, token);
  return (cached = token);
}

/** Constant-time comparison, so the token can't be guessed byte by byte. */
export function isValidToken(candidate: string | undefined | null): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(getAppToken());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
