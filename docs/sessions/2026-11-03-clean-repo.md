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
