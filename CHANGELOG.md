# Changelog

Notable changes to IGOR. The project is pre-release; versions start with the first public build.

## Unreleased

### Added
- MCP server (`packages/mcp`, `igor-mcp`): agents generate images, build, render and open editor projects. Saved projects API under `/api/projects`.
- English UI next to Turkish, switchable from the top bar or Settings (defaults to the system language).
- Desktop app (Electron): window, tray, local-token sign-in, desktop shortcut on build.
- First-run setup screen and an in-app ComfyUI setup guide with a live model checklist.
- Bundled Inter font for rendered captions; local sign-in token for dev runs without `APP_TOKEN`.

### Changed
- Closing the window quits IGOR when nothing is running. With running jobs it frees the window, waits in the tray and quits once they finish.
- Quitting stops the ComfyUI instance IGOR started; it also stops after 10 idle minutes. The studio server exits if the desktop shell disappears.
