import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { comfyUrl, getSetting } from "./settings";

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_FILE = path.join(DATA_DIR, "comfyui.log");
const PID_FILE = path.join(DATA_DIR, "comfyui.pid");
const STARTUP_TIMEOUT_MS = 120_000;

// Local ComfyUI needs to be running for image/video generation. Instead of
// making the user remember to start it by hand every time they reboot or
// close the terminal, both comfy-server.ts and video-server.ts call
// ensureComfyRunning() before talking to it. A module-level promise
// (established pattern in this codebase, see video-jobs.ts)
// dedupes concurrent generation requests into a single launch attempt.
let launching: Promise<void> | null = null;

function comfyDir(): string {
  return getSetting("comfyuiDir") ?? path.resolve(process.cwd(), "..", "ComfyUI");
}

/**
 * Prefer the venv's pythonw.exe. The venv python.exe is only a launcher that
 * re-executes the base interpreter, and that child gets its own console
 * window even with windowsHide (Node can't hide a grandchild's console, and
 * detached spawns ignore windowsHide on Windows). pythonw is a GUI-subsystem
 * binary, so neither process ever opens a console. Output still goes to
 * data/comfyui.log through the redirected stdio handles.
 */
function pythonPath(dir: string): string | null {
  const scripts = path.join(dir, "venv", "Scripts");
  for (const exe of ["pythonw.exe", "python.exe"]) {
    const p = path.join(scripts, exe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function isComfyUp(): Promise<boolean> {
  try {
    const res = await fetch(`${comfyUrl()}/system_stats`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function portFromUrl(): string {
  try {
    return new URL(comfyUrl()).port || "8188";
  } catch {
    return "8188";
  }
}

function spawnComfy() {
  const dir = comfyDir();
  const python = pythonPath(dir);
  if (!python || !fs.existsSync(path.join(dir, "main.py"))) {
    throw new Error(`ComfyUI bulunamadı: ${dir}. Ayarlar sayfasından ComfyUI klasörünü seç.`);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const log = fs.openSync(LOG_FILE, "a");
  const child = spawn(python, ["main.py", "--listen", "127.0.0.1", "--port", portFromUrl()], {
    cwd: dir,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  if (child.pid) fs.writeFileSync(PID_FILE, String(child.pid));
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

export type ComfyStatus = {
  running: boolean;
  dir: string;
  dirValid: boolean;
  /** True when IGOR launched the running instance and can stop it. */
  ownedByIgor: boolean;
};

export async function comfyStatus(): Promise<ComfyStatus> {
  const dir = comfyDir();
  return {
    running: await isComfyUp(),
    dir,
    dirValid: !!pythonPath(dir) && fs.existsSync(path.join(dir, "main.py")),
    ownedByIgor: fs.existsSync(PID_FILE),
  };
}

/** Stops the ComfyUI instance IGOR started (frees its RAM and VRAM). */
export async function stopComfy(): Promise<boolean> {
  let pid: string;
  try {
    pid = fs.readFileSync(PID_FILE, "utf8").trim();
  } catch {
    return false;
  }
  await new Promise<void>((resolve) => {
    const p = spawn("taskkill", ["/PID", pid, "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
  fs.rmSync(PID_FILE, { force: true });
  return true;
}
