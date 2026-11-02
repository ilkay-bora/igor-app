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

## Tighter radius, button pass, centered create composer (same day)

- Global `--radius` 0.9rem to 0.5rem; pill shapes (nav, chips, tabs, badges, tile overlays) moved to `rounded-md`/`rounded-sm`. Round stays only on toggles, dots and slider thumbs.
- Buttons: one height scale (sm h-8, default h-9, lg h-10), primary gets a subtle inset highlight. Select trigger matches at h-9, so toolbars line up.
- Create page: single composer card (borderless textarea + one toolbar row: model, compact ratio, compact `#etiket` field, Oluştur). Enter submits, Shift+Enter new line.
- Hero mode: composer is vertically centered with a title until the first generation of the visit, then glides to the top (min-height transition) and the gallery takes over.
- Motion: generating tile has a pulsing glow, shimmer sweep and indeterminate bar (`igor-*` keyframes in globals.css, disabled under reduced motion); a freshly generated image reveals blur-to-sharp once (`fresh` flag, history images do not animate).
- `TagInput` and `RatioPicker` gained compact toolbar variants.

## Settings, first-run setup, windowless ComfyUI, nav (same day)

- ComfyUI console window fixed: the venv `python.exe` is only a launcher that re-executes the base interpreter, and that grandchild got its own console (Node can't hide it, and detached spawns ignore windowsHide). The launcher now prefers `venv\Scripts\pythonw.exe`; verified no conhost under either process. It writes `data/comfyui.pid` so IGOR can stop the instance it started.
- Settings layer `src/lib/settings.ts`: `data/settings.json` (gitignored), resolution order saved value, then env var, then default. Gemini, Pollinations, TTS, ComfyUI dir/URL all read through it at call time (`getSetting`, `comfyUrl()`).
- `/api/settings` (GET masked view: set/source/last 4 chars, POST patch), `/api/settings/test` (Gemini model list, free), `/api/settings/comfy` (start/stop).
- `/setup` first-run screen and `/settings` page share `SettingsForm`. `SetupGate` in the root layout sends an install without `setupDone` to `/setup` once.
- Nav rebuilt at a fixed h-14: Oluştur, Editör, Video, Seslendirme, Karşılaştır with icons and a red underline for the active page; Hatalar and Ayarlar as icon buttons on the right. Editor and create-page height calcs updated to 3.5rem.
- Testing note: don't open `/video/editor` from a headless browser, its autosave writes `data/editor-draft.json`.
