import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const COMFY_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";
const COMFY_DIR = process.env.COMFYUI_DIR ?? path.resolve(process.cwd(), "..", "ComfyUI");
const PYTHON = path.join(COMFY_DIR, "venv", "Scripts", "python.exe");
const LOG_FILE = path.join(process.cwd(), "data", "comfyui.log");
const STARTUP_TIMEOUT_MS = 120_000;

// Local ComfyUI needs to be running for image/video generation. Instead of
// making the user remember to start it by hand every time they reboot or
// close the terminal, both comfy-server.ts and video-server.ts call
// ensureComfyRunning() before talking to it. A module-level promise
// (established pattern in this codebase, see video-jobs.ts)
// dedupes concurrent generation requests into a single launch attempt.
let launching: Promise<void> | null = null;

async function isComfyUp(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnComfy() {
  const log = fs.openSync(LOG_FILE, "a");
  const child = spawn(PYTHON, ["main.py", "--listen", "127.0.0.1", "--port", "8188"], {
    cwd: COMFY_DIR,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  // detached + unref so the ComfyUI process outlives this Node process
  // (dev server restarts, Turbopack HMR reloads of this module, etc.)
  child.unref();
}

export async function ensureComfyRunning(): Promise<void> {
  if (await isComfyUp()) return;

  if (!launching) {
    launching = (async () => {
      spawnComfy();
      const start = Date.now();
      while (Date.now() - start < STARTUP_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await isComfyUp()) return;
      }
      throw new Error(
        "ComfyUI otomatik başlatıldı ama 2 dakika içinde ayağa kalkmadı. Log: data/comfyui.log"
      );
    })().finally(() => {
      launching = null;
    });
  }

  await launching;
}
