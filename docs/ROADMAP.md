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

1. **Core extraction**: move logic out of Next routes into `packages/core`; single GPU job queue; SQLite instead of JSON files; settings file instead of `.env`; versioned editor project schema; split the editor page into components; i18n (TR/EN); bundled open-license font.
2. **Local API + MCP**: REST API with a local token; MCP tools for generation (`generate_image`, `generate_video`, `text_to_speech`, `get_job`) and editing (`create_project`, `add_clip`, `add_text`, `set_audio`, `set_transition`, `render_project`, `open_in_editor`); live sync so open editors update when an agent changes a project.
3. **Desktop shell**: basic shell DONE early (2026-11-03): Electron window + tray, spawns the studio server with Electron-as-Node, local-token auto sign-in, opens on the editor. Remaining: ComfyUI start/stop from tray, live job panel, one-click MCP setup for Claude Code / Cursor / Claude Desktop, Next standalone output for packaging.
4. **Setup wizard**: GPU/VRAM detection, use existing ComfyUI or install a portable one, resumable model downloads with license prompts.
5. **Packaging**: NSIS installer, code signing, auto-update via GitHub Releases.
6. **Launch**: MCP registries, community posts, demo video.

## Known issues to fix before release

- Video job polling does not always honor its timeout when ComfyUI finishes but the job stays `running`.
- Editor text rendering uses `C:/Windows/Fonts/arial.ttf`; replace with a bundled font.
- Auth is a single shared `APP_TOKEN`; replace with a generated local token.
