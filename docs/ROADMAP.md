# Roadmap

IGOR is moving from a personal web tool to an open-source desktop app with an MCP server. Positioning: **the agent drafts the edit, you polish it.**

## v1 scope

- Timeline editor (headline feature), image, video and TTS generation.
- MCP server + local REST API, so agents can create and edit projects and run generation jobs.
- Electron desktop app for Windows + NVIDIA.
- Turkish and English UI, selectable.
- Cloud providers are bring-your-own-key.

Out of scope for v1: trend/idea scanning, model benchmarking, macOS/AMD.

## Phases

1. **Core extraction**: move logic out of Next routes into `packages/core`; single GPU job queue; SQLite instead of JSON files; settings file instead of `.env` (DONE: `data/settings.json`, env as fallback); versioned editor project schema; split the editor page into components; i18n (TR/EN); bundled open-license font.
2. **Local API + MCP**: REST API with a local token; MCP tools for generation (`generate_image`, `generate_video`, `text_to_speech`, `get_job`) and editing (`create_project`, `add_clip`, `add_text`, `set_audio`, `set_transition`, `render_project`, `open_in_editor`); live sync so open editors update when an agent changes a project.
3. **Desktop shell**: basic shell DONE early (2026-11-03): Electron window + tray, spawns the studio server with Electron-as-Node, local-token auto sign-in, opens on the create page, desktop shortcut refreshed on every build. ComfyUI start/stop lives in Ayarlar (windowless launch via pythonw). Remaining: ComfyUI start/stop from tray, live job panel, one-click MCP setup for Claude Code / Cursor / Claude Desktop, Next standalone output for packaging.
4. **Setup wizard**: first-run setup screen + Ayarlar page DONE (keys, ComfyUI folder/URL, Gemini key test); ComfyUI guide with live model checklist DONE; existing ComfyUI detection covers venv, .venv and the portable release. Remaining: GPU/VRAM detection, one-click portable install, resumable model downloads with license prompts.
5. **Packaging**: NSIS installer, code signing, auto-update via GitHub Releases.
6. **Launch**: MCP registries, community posts, demo video.

## Known issues to fix before release

- Video job polling does not always honor its timeout when ComfyUI finishes but the job stays `running`.
- Editor text rendering uses `C:/Windows/Fonts/arial.ttf`; replace with a bundled font.
- Auth is a single shared `APP_TOKEN`; replace with a generated local token.

## Before going public (agreed 2026-11-03, start 2026-11-04)

Audit on 2026-11-03: full git history is clean (no keys, `.env`, `data/`, generated media or personal content), so flipping visibility leaks nothing. Repo stays **private** until these are done, then visibility and announcement go together:

1. Small MCP server MVP: `generate_image`, `create_project`, `add_clip`, `render_project` (the headline promise in the repo description).
2. English UI option (TR/EN switch, start of phase 1 i18n).
3. README: 2-3 screenshots and a short demo GIF.
4. Quick fixes: `npm run dev` can't sign in without `APP_TOKEN` in `.env.local` (README now calls `.env` optional); editor text render hardcodes `C:/Windows/Fonts/arial.ttf`, switch to a bundled open-license font.
