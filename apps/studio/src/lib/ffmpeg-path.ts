import path from "path";

// ffmpeg-static's own module resolves its binary path via `__dirname` at
// import time, which Turbopack's server bundling rewrites to a virtual path
// (`\ROOT\...`) that doesn't exist on disk — `spawn ... ENOENT` under `next
// dev`/`next start` even though the same import works fine from a plain
// Node/tsx script. Resolving from `process.cwd()` (the project root any of
// these entry points run from) sidesteps the bundler entirely.
export const FFMPEG_PATH = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe");
