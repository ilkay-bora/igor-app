import fs from "fs";
import path from "path";

// ffmpeg-static's own module resolves its binary path via `__dirname` at
// import time, which Turbopack's server bundling rewrites to a virtual path
// (`\ROOT\...`) that doesn't exist on disk, so `spawn` fails with ENOENT under
// `next dev`/`next start`. Resolve from `process.cwd()` instead. npm
// workspaces hoist the package to the repo root, so check there too.
// IGOR_FFMPEG_PATH overrides both (used by packaged desktop builds).
function resolveFfmpeg(): string {
  const candidates = [
    process.env.IGOR_FFMPEG_PATH,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(process.cwd(), "..", "..", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[candidates.length - 1];
}

export const FFMPEG_PATH = resolveFfmpeg();
