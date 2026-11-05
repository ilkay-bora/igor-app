import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { comfyUrl, getSetting } from "./settings";
import { tServer } from "@/lib/i18n-server";
import { getActivity, lastActive, markActive } from "@/lib/activity";

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

export function comfyDir(): string {
  return getSetting("comfyuiDir") ?? path.resolve(process.cwd(), "..", "ComfyUI");
}

type ComfyLayout = {
  /** Folder that holds main.py (its models/ folder lives here too). */
  appDir: string;
  python: string;
  cwd: string;
  args: string[];
};

function pickPython(scripts: string): string | null {
  // Prefer pythonw.exe. A venv python.exe is only a launcher that
  // re-executes the base interpreter, and that child gets its own console
  // window even with windowsHide (Node can't hide a grandchild's console, and
  // detached spawns ignore windowsHide on Windows). pythonw is a
  // GUI-subsystem binary, so no process ever opens a console. Output still
  // goes to data/comfyui.log through the redirected stdio handles.
  for (const exe of ["pythonw.exe", "python.exe"]) {
    const p = path.join(scripts, exe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Understands the three common Windows installs: a git clone with venv/ or
 * .venv/, and the portable release from GitHub (python_embeded/ next to a
 * ComfyUI/ folder), given either the portable root or its inner ComfyUI/.
 */
export function detectComfyLayout(dir: string): ComfyLayout | null {
  for (const venv of ["venv", ".venv"]) {
    const python = pickPython(path.join(dir, venv, "Scripts"));
    if (python && fs.existsSync(path.join(dir, "main.py"))) {
      return { appDir: dir, python, cwd: dir, args: ["main.py"] };
    }
  }
  for (const root of [dir, path.dirname(dir)]) {
    const python = pickPython(path.join(root, "python_embeded"));
    const app = path.join(root, "ComfyUI");
    if (python && fs.existsSync(path.join(app, "main.py"))) {
      return {
        appDir: app,
        python,
        cwd: root,
        args: ["-s", path.join("ComfyUI", "main.py"), "--windows-standalone-build"],
      };
    }
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
  const layout = detectComfyLayout(dir);
  if (!layout) {
    throw new Error(tServer("ComfyUI bulunamadı: {dir}. Ayarlar sayfasından ComfyUI klasörünü seç.", { dir }));
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const log = fs.openSync(LOG_FILE, "a");
  const child = spawn(layout.python, [...layout.args, "--listen", "127.0.0.1", "--port", portFromUrl()], {
    cwd: layout.cwd,
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
  markActive();
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
        tServer("ComfyUI otomatik başlatıldı ama 2 dakika içinde ayağa kalkmadı. Log: data/comfyui.log")
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
    dirValid: !!detectComfyLayout(dir),
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

// ComfyUI holds gigabytes of RAM and VRAM while it is up. When IGOR started
// it and nothing has used it for a while, stop it; the next generation
// starts it again (about a minute with large models).
const IDLE_STOP_MS = 10 * 60_000;
const IDLE_CHECK_MS = 30_000;

export function startComfyIdleWatcher() {
  const g = globalThis as unknown as { __igorComfyWatcher?: NodeJS.Timeout };
  if (g.__igorComfyWatcher) return;
  g.__igorComfyWatcher = setInterval(async () => {
    if (launching || !fs.existsSync(PID_FILE)) return;
    if ((await getActivity()).busy) return;
    if (Date.now() - lastActive() < IDLE_STOP_MS) return;
    if (await isComfyUp()) await stopComfy();
    else fs.rmSync(PID_FILE, { force: true });
  }, IDLE_CHECK_MS);
  g.__igorComfyWatcher.unref();
}
