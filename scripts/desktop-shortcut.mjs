// Creates or refreshes an "IGOR" shortcut on the Windows desktop that starts
// the Electron shell directly (no console window). Runs automatically after
// `npm run build` (postbuild); safe to run any time: `node scripts/desktop-shortcut.mjs`.
// Does nothing on other platforms.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") process.exit(0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopApp = path.join(root, "apps", "desktop");
const icon = path.join(desktopApp, "assets", "icon.ico");

let electron;
try {
  // The electron package's main export is the path to its binary.
  electron = createRequire(path.join(desktopApp, "package.json"))("electron");
} catch {
  console.warn("[shortcut] electron is not installed, skipping desktop shortcut.");
  process.exit(0);
}
if (!fs.existsSync(electron)) process.exit(0);

// Single-quoted PowerShell strings: escape ' as ''.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const script = [
  "$desktop = [Environment]::GetFolderPath('Desktop')",
  "$link = Join-Path $desktop 'IGOR.lnk'",
  "$shell = New-Object -ComObject WScript.Shell",
  "$s = $shell.CreateShortcut($link)",
  `$s.TargetPath = ${q(electron)}`,
  `$s.Arguments = ${q(`"${desktopApp}"`)}`,
  `$s.WorkingDirectory = ${q(desktopApp)}`,
  `$s.IconLocation = ${q(`${icon},0`)}`,
  "$s.Description = 'IGOR: yerel AI video editörü ve medya stüdyosu'",
  "$s.WindowStyle = 1",
  "$s.Save()",
  "Write-Output $link",
].join("; ");

try {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  console.log(`[shortcut] ${out.trim()}`);
} catch (err) {
  // A missing shortcut must never fail the build.
  console.warn(`[shortcut] could not create desktop shortcut: ${err.message}`);
}
