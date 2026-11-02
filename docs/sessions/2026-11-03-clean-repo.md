# 2026-11-03: Clean public repo

- Created this repo from the personal IGOR app with a fresh history.
- Removed for v1: `/ideas` (trend scan), `/benchmark`, Puter.js models (browser-only sign-in, unusable for agents).
- Personal content channels replaced with free-form tags (`TagInput` / `TagFilter`, `collectTags`, `normalizeTag`).
- "Masal" mode presented as character consistency; storybook style id is now `storybook`.
- Branded lower-third strip replaced with a generic `public/strips/lower-third.png`.
- ComfyUI location configurable via `COMFYUI_DIR` / `COMFYUI_URL`; `.env.example` added.
- Monorepo with npm workspaces; Next app lives in `apps/studio`.
