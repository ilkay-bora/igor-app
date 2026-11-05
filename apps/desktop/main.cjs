// IGOR desktop shell: starts the studio's Next.js server as a child process,
// signs the window in with a per-install local token. Closing the window
// quits IGOR when nothing is running; with queued work it stays in the tray
// (window freed) and quits by itself once the work is done.
const { app, BrowserWindow, Tray, Menu, shell, session, nativeImage, dialog } = require("electron");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const STUDIO_DIR = path.resolve(__dirname, "..", "studio");
const ICON = path.join(__dirname, "assets", "icon.ico");
const TRAY_ICON = path.join(__dirname, "assets", "tray.png");

// Shell strings follow the studio's language setting (data/settings.json),
// else the system locale, like the studio itself.
const STRINGS = {
  serverExited: ["Studio sunucusu başlarken kapandı.", "The studio server exited while starting."],
  serverTimeout: ["Studio sunucusu zamanında açılmadı.", "The studio server did not start in time."],
  serverCrashed: [
    "Studio sunucusu beklenmedik şekilde kapandı (kod {code}). Uygulama kapanacak.",
    "The studio server stopped unexpectedly (code {code}). IGOR will close.",
  ],
  trayTitle: ["IGOR işleri bitirince kapanacak", "IGOR will close when its jobs finish"],
  trayContent: [
    "{n} iş devam ediyor. Bitince IGOR kendiliğinden kapanır, tepsi simgesinden tekrar açabilirsin.",
    "{n} job(s) still running. IGOR quits by itself when they finish; reopen it from the tray icon.",
  ],
  busyQuitTitle: ["Devam eden işler var", "Jobs are still running"],
  busyQuitMessage: [
    "{n} iş henüz bitmedi. Şimdi çıkarsan yarım kalırlar.",
    "{n} job(s) have not finished. Quitting now cuts them off.",
  ],
  quitNow: ["Yine de çık", "Quit anyway"],
  quitWhenDone: ["Bitince kapat", "Quit when done"],
  cancel: ["Vazgeç", "Cancel"],
  open: ["IGOR'u aç", "Open IGOR"],
  editor: ["Editör", "Editor"],
  log: ["Günlük dosyasını aç", "Open log file"],
  quit: ["Çıkış", "Quit"],
  failed: ["IGOR açılamadı", "IGOR could not start"],
};

function lang() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(STUDIO_DIR, "data", "settings.json"), "utf8")).language;
    if (saved === "tr" || saved === "en") return saved;
  } catch {
    // no settings yet
  }
  return app.getLocale().toLowerCase().startsWith("tr") ? "tr" : "en";
}

function tr(key, vars = {}) {
  let text = STRINGS[key][lang() === "en" ? 1 : 0];
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}
const DEV = process.env.IGOR_DEV === "1" || !fs.existsSync(path.join(STUDIO_DIR, ".next", "BUILD_ID"));

let server = null;
let port = 0;
let mainWindow = null;
let splash = null;
let tray = null;
let quitting = false;
let baseUrl = "";
let appToken = "";
let autoQuitTimer = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMain);
  app.whenReady().then(start).catch(fail);
}

function loadToken() {
  const file = path.join(app.getPath("userData"), "config.json");
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // first run or unreadable config: regenerate below
  }
  if (!config.localToken) {
    config.localToken = crypto.randomBytes(24).toString("hex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
  }
  return config.localToken;
}

function freePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => {
      const fallback = net.createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const p = fallback.address().port;
        fallback.close(() => resolve(p));
      });
    });
    srv.listen(preferred, "127.0.0.1", () => srv.close(() => resolve(preferred)));
  });
}

async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server && server.exitCode !== null) throw new Error(tr("serverExited"));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(tr("serverTimeout"));
}

function startServer(token) {
  const nextBin = require.resolve("next/dist/bin/next", { paths: [STUDIO_DIR] });
  const args = [nextBin, DEV ? "dev" : "start", "-p", String(port), "-H", "127.0.0.1"];
  const logFile = fs.createWriteStream(path.join(app.getPath("userData"), "studio.log"), { flags: "a" });
  // Electron's own binary doubles as Node when ELECTRON_RUN_AS_NODE is set,
  // so no separate Node install is needed once packaged.
  server = spawn(process.execPath, args, {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      APP_TOKEN: token,
      IGOR_DESKTOP: "1",
      // The server exits on its own if this process disappears.
      IGOR_PARENT_PID: String(process.pid),
    },
    windowsHide: true,
  });
  server.stdout.pipe(logFile);
  server.stderr.pipe(logFile);
  server.on("exit", (code) => {
    if (!quitting) {
      dialog.showErrorBox("IGOR", tr("serverCrashed", { code }));
      quitApp();
    }
  });
}

// Number of jobs the studio is still working on (0 when it can't be reached).
async function activeJobs() {
  try {
    const res = await fetch(`${baseUrl}/api/activity`, {
      headers: { authorization: `Bearer ${appToken}` },
      signal: AbortSignal.timeout(3000),
    });
    const a = await res.json();
    return a.busy ? a.videoJobs + a.renders + a.merges + a.generations || 1 : 0;
  } catch {
    return 0;
  }
}

// Stops the ComfyUI instance the studio started, so quitting IGOR frees its RAM/VRAM.
async function stopComfy() {
  try {
    await fetch(`${baseUrl}/api/settings/comfy`, {
      method: "POST",
      headers: { authorization: `Bearer ${appToken}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // server already gone
  }
}

function stopServer() {
  if (!server || server.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    // Kill the whole tree: next spawns worker processes of its own.
    execFile("taskkill", ["/pid", String(server.pid), "/T", "/F"], () => resolve());
  });
}

function createSplash() {
  splash = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    resizable: false,
    backgroundColor: "#0a0a0a",
    icon: ICON,
    show: true,
  });
  splash.loadFile(path.join(__dirname, "splash.html"), { query: { lang: lang() } });
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: "IGOR",
    icon: ICON,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => {
    splash?.destroy();
    splash = null;
    mainWindow.maximize();
    mainWindow.show();
  });
  // Closing the window quits IGOR, unless jobs are still running: then the
  // window is destroyed (its renderer is the biggest process) and IGOR waits
  // in the tray until the work is done.
  mainWindow.on("close", async (e) => {
    if (quitting) return;
    e.preventDefault();
    const n = await activeJobs();
    if (!n) return quitApp();
    mainWindow?.destroy();
    tray?.displayBalloon?.({ title: tr("trayTitle"), content: tr("trayContent", { n }), iconType: "info" });
    scheduleAutoQuit();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(url);
}

// While the window is closed, quit as soon as the studio has nothing left to do.
function scheduleAutoQuit() {
  if (autoQuitTimer) return;
  autoQuitTimer = setInterval(async () => {
    if (mainWindow) return cancelAutoQuit();
    if (!(await activeJobs())) quitApp();
  }, 15_000);
}

function cancelAutoQuit() {
  clearInterval(autoQuitTimer);
  autoQuitTimer = null;
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip("IGOR");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: tr("open"), click: showMain },
      { label: tr("editor"), click: () => openPath("/video/editor") },
      { type: "separator" },
      { label: tr("log"), click: () => shell.openPath(path.join(app.getPath("userData"), "studio.log")) },
      { type: "separator" },
      { label: tr("quit"), click: confirmQuit },
    ])
  );
  tray.on("double-click", showMain);
}

function showMain() {
  if (!baseUrl) return;
  if (!mainWindow) {
    cancelAutoQuit();
    createMainWindow(`${baseUrl}/`);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function openPath(p) {
  if (!baseUrl) return;
  if (!mainWindow) {
    cancelAutoQuit();
    createMainWindow(`${baseUrl}${p}`);
    return;
  }
  mainWindow.loadURL(`${baseUrl}${p}`);
  showMain();
}

// Tray "Quit": ask first when that would cut running jobs off.
async function confirmQuit() {
  const n = await activeJobs();
  if (!n) return quitApp();
  const { response } = await dialog.showMessageBox({
    type: "warning",
    title: "IGOR",
    message: tr("busyQuitTitle"),
    detail: tr("busyQuitMessage", { n }),
    buttons: [tr("quitWhenDone"), tr("quitNow"), tr("cancel")],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 1) return quitApp();
  if (response === 0) {
    mainWindow?.destroy();
    scheduleAutoQuit();
  }
}

async function quitApp() {
  if (quitting) return;
  quitting = true;
  cancelAutoQuit();
  tray?.destroy();
  mainWindow?.destroy();
  if (baseUrl) await stopComfy();
  await stopServer();
  app.quit();
}

async function start() {
  app.setAppUserModelId("com.ilkaybora.igor");
  createSplash();
  const token = loadToken();
  port = await freePort(3020);
  startServer(token);
  const base = `http://127.0.0.1:${port}`;
  appToken = token;
  await waitForServer(`${base}/login`, DEV ? 180_000 : 60_000);
  baseUrl = base;
  await session.defaultSession.cookies.set({
    url: base,
    name: "igor_token",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  });
  writeServerInfo(base, token);
  createTray();
  createMainWindow(`${base}/`);
}

// The MCP server (packages/mcp) reads this to find the running studio: the
// port changes between runs, the token doesn't.
function serverInfoFile() {
  return path.join(app.getPath("userData"), "server.json");
}

function writeServerInfo(url, token) {
  fs.writeFileSync(serverInfoFile(), JSON.stringify({ url, token, pid: process.pid, studioDir: STUDIO_DIR }, null, 2));
}

function removeServerInfo() {
  try {
    fs.rmSync(serverInfoFile(), { force: true });
  } catch {
    // nothing to clean up
  }
}

function fail(err) {
  dialog.showErrorBox(tr("failed"), String(err?.message ?? err));
  quitApp();
}

app.on("window-all-closed", () => {
  // stay alive in the tray
});
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  removeServerInfo();
  if (server && server.exitCode === null) {
    try {
      execFile("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
    } catch {
      // already gone
    }
  }
});
