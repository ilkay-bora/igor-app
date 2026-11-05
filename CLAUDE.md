@apps/studio/AGENTS.md

# IGOR (public repo)

Open-source, editor-first AI media studio with an MCP server and Electron shell. See `docs/ROADMAP.md` for scope and phases.

## Conventions

- Code, identifiers and comments in English. UI strings are written in Turkish inside `t()`; the Turkish text is the key into `apps/studio/src/lib/i18n-en.ts`. `node scripts/i18n/keys.cjs` lists missing English entries.
- Never commit generated media, `data/`, `.env*` or anything personal. This repo is public-bound.
- Do not hand-edit the LTX video workflow graph in `video-server.ts`; re-capture it from ComfyUI's `/history` after a successful run in the ComfyUI UI.
- One GPU: all generation jobs share one queue.

## Records

- Session summaries live in `notes/sessions/` as `YYYY-MM-DD-topic.md`. That folder is gitignored: local working notes, not part of the public repo. Add one after significant work (new feature, phase milestone, changed workflow).
- User-facing changes go in `CHANGELOG.md` (Unreleased section). Keep `docs/ROADMAP.md` in sync.
