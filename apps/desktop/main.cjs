// IGOR desktop shell: starts the studio's Next.js server as a child process,
// signs the window in with a per-install local token, and keeps running in
// the tray so generation/render queues survive closing the window.
const { app, BrowserWindow, Tray, Menu, shell, session, nativeImage, dialog } = require("electron");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const STUDIO_DIR = path.resolve(__dirname, "..", "studio");
const ICON = path.join(__dirname, "assets", "icon.ico");
const TRAY_ICON = path.join(__dirname, "assets", "tray.png");
const DEV = process.env.IGOR_DEV === "1" || !fs.existsSync(path.join(STUDIO_DIR, ".next", "BUILD_ID"));

let server = null;
let port = 0;
let mainWindow = null;
let splash = null;
let tray = null;
let quitting = false;

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
    if (server && server.exitCode !== null) throw new Error("Studio sunucusu başlarken kapandı.");
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Studio sunucusu zamanında açılmadı.");
}

function startServer(token) {
  const nextBin = require.resolve("next/dist/bin/next", { paths: [STUDIO_DIR] });
  const args = [nextBin, DEV ? "dev" : "start", "-p", String(port), "-H", "127.0.0.1"];
  const logFile = fs.createWriteStream(path.join(app.getPath("userData"), "studio.log"), { flags: "a" });
  // Electron's own binary doubles as Node when ELECTRON_RUN_AS_NODE is set,
  // so no separate Node install is needed once packaged.
  server = spawn(process.execPath, args, {
    cwd: STUDIO_DIR,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", APP_TOKEN: token, IGOR_DESKTOP: "1" },
    windowsHide: true,
  });
  server.stdout.pipe(logFile);
  server.stderr.pipe(logFile);
  server.on("exit", (code) => {
    if (!quitting) {
      dialog.showErrorBox("IGOR", `Studio sunucusu beklenmedik şekilde kapandı (kod ${code}). Uygulama kapanacak.`);
      quitApp();
    }
  });
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
  splash.loadFile(path.join(__dirname, "splash.html"));
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
  // Closing the window keeps IGOR in the tray so queued jobs keep running.
  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    tray?.displayBalloon?.({
      title: "IGOR arka planda çalışıyor",
      content: "Kuyruktaki işler devam ediyor. Kapatmak için tepsi simgesinden Çıkış'ı seç.",
      iconType: "info",
    });
  });
  mainWindow.loadURL(url);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip("IGOR");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "IGOR'u aç", click: showMain },
      { label: "Editör", click: () => openPath("/video/editor") },
      { type: "separator" },
      { label: "Günlük dosyasını aç", click: () => shell.openPath(path.join(app.getPath("userData"), "studio.log")) },
      { type: "separator" },
      { label: "Çıkış", click: quitApp },
    ])
  );
  tray.on("double-click", showMain);
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function openPath(p) {
  if (!mainWindow) return;
  mainWindow.loadURL(`http://127.0.0.1:${port}${p}`);
  showMain();
}

async function quitApp() {
  if (quitting) return;
  quitting = true;
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
  await waitForServer(`${base}/login`, DEV ? 180_000 : 60_000);
  await session.defaultSession.cookies.set({
    url: base,
    name: "igor_token",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  });
  createTray();
  createMainWindow(`${base}/`);
}

function fail(err) {
  dialog.showErrorBox("IGOR açılamadı", String(err?.message ?? err));
  quitApp();
}

app.on("window-all-closed", () => {
  // stay alive in the tray
});
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  if (server && server.exitCode === null) {
    try {
      execFile("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
    } catch {
      // already gone
    }
  }
});
