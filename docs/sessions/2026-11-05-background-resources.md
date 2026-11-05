# 2026-11-05: Less background resource use

Problem: closing the IGOR window only hid it. The shell, its renderer, the
studio server and any ComfyUI IGOR had started kept running in the tray
(about 670 MB without ComfyUI, ComfyUI adds about 1 GB RAM plus VRAM).

## What changed

- **Closing the window quits IGOR** when nothing is running. With running
  work (video jobs, editor renders, merges, ComfyUI generations) the window
  is destroyed (frees the renderer), a tray balloon says IGOR will close when
  the jobs finish, and the shell polls `/api/activity` every 15 s and quits
  when idle. Opening IGOR from the tray recreates the window and cancels the
  auto-quit.
- **Tray Quit while busy** asks: quit when done / quit anyway / cancel.
- **Quitting stops the ComfyUI instance IGOR started** (`POST /api/settings/comfy stop`).
  A ComfyUI the user started by hand is never touched.
- **ComfyUI idle stop**: the studio stops its own ComfyUI after 10 minutes
  without use (`startComfyIdleWatcher` in `lib/comfy-launcher.ts`, started
  from `instrumentation.ts`, also in plain `npm run dev`).
- **No orphan server**: the shell passes `IGOR_PARENT_PID`; the studio checks
  it every 5 s and exits (stopping its ComfyUI) if the shell is gone.
- `lib/activity.ts` + `GET /api/activity`: busy summary from the queue state
  files. Entries created before the current server started are ignored (the
  queues don't resume after a restart, so those are stale).

## Verified

- Idle close: 5 processes to 0, server.json removed.
- Shell killed from Task Manager style (`Stop-Process -Force`): server gone within 8 s.
- Close during an 8-clip 720p render: renderer freed at once, IGOR quit by
  itself 181 s later, render finished as `done`. Test project and render deleted,
  `data/editor-projects.json` byte-identical to its backup.
- ComfyUI started from IGOR (969 MB), window closed: IGOR and ComfyUI both gone.
- Not verified live: the 10 minute idle stop (logic only).
