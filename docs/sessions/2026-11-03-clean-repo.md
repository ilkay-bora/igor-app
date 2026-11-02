# 2026-11-03: Clean public repo

- Created this repo from the personal IGOR app with a fresh history.
- Removed for v1: `/ideas` (trend scan), `/benchmark`, Puter.js models (browser-only sign-in, unusable for agents).
- Personal content channels replaced with free-form tags (`TagInput` / `TagFilter`, `collectTags`, `normalizeTag`).
- "Masal" mode presented as character consistency; storybook style id is now `storybook`.
- Branded lower-third strip replaced with a generic `public/strips/lower-third.png`.
- ComfyUI location configurable via `COMFYUI_DIR` / `COMFYUI_URL`; `.env.example` added.
- Monorepo with npm workspaces; Next app lives in `apps/studio`.

## Desktop shell (same day, pulled forward from phase 3)

- `apps/desktop`: Electron 45 main process (`main.cjs`) + splash screen + generated icon.
- Spawns `next start` (or `next dev` if no build / `IGOR_DEV=1`) using Electron's binary as Node, on a free port from 3020.
- Per-install random token in `%APPDATA%/@igor/desktop/config.json`, passed as `APP_TOKEN` and set as the `igor_token` cookie, so no login screen.
- Closing the window hides to tray; tray menu has open, editor, log file, quit. Quit kills the server tree.
- Server log: `%APPDATA%/@igor/desktop/studio.log`.
- Scripts: `npm run desktop`, `npm run desktop:build`.

## Editor + branding pass (same day)

- Brand is now a pure wordmark: "IGOR" in Gabarito Black (OFL), in the nav, favicon, window/taskbar icon and tray. The image-glyph icon is gone.
- Editor draft moved from browser IndexedDB to `data/editor-draft.json` via `/api/editor-draft` (survives desktop port changes; ready for MCP edits).
- Runtime media (`/videos`, `/generated`, `/voices`) served by route handlers with Range support, because `next start` only serves public/ files that existed at build time.
- ffmpeg path also resolves the workspace-hoisted `node_modules` (renders were broken in the monorepo).
- Fixed the editor's "Hizala" switch (thumb was positioned off the track).
- New `RatioPicker` (drawn aspect frames) replaces the ratio/resolution dropdowns on Create, Video and Editor.
- Pages use the full window width (max 1800px) instead of 4xl/6xl columns; gallery goes up to 6 columns.

## Single-screen editor (same day)

- Editor fills exactly one window, no page scroll: slim toolbar (title, clip count, compact ratio picker, save status, new/render buttons), then library | preview | inspector columns, then the full-width timeline (max 44% height, scrolls inside).
- Preview is sized by a ResizeObserver to the largest frame that fits its column, for any output ratio.
- Render list ("Düzenlemeler") moved into a "Render'lar" tab next to the library.
- Fixed: preview time could read -0.0s right after a load, hiding every layer that starts at 0.
