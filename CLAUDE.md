@apps/studio/AGENTS.md

# IGOR (public repo)

Open-source, editor-first AI media studio with an MCP server and Electron shell. See `docs/ROADMAP.md` for scope and phases.

## Conventions

- Code, identifiers and comments in English. UI strings are Turkish today and move to `locales/` (TR/EN) in phase 1.
- Never commit generated media, `data/`, `.env*` or anything personal. This repo is public-bound.
- Do not hand-edit the LTX video workflow graph in `video-server.ts`; re-capture it from ComfyUI's `/history` after a successful run in the ComfyUI UI.
- One GPU: all generation jobs share one queue.

## Records

Session summaries live in `docs/sessions/` as `YYYY-MM-DD-topic.md`. Add one after significant work (new feature, phase milestone, changed workflow) and keep `docs/ROADMAP.md` in sync.
