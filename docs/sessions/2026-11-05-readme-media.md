# 2026-11-05: README screenshots and demo GIF

Item 3 of "Before going public" in the roadmap. With items 1, 2 and 4 done the same day, the pre-public checklist is complete; making the repo public is the owner's call.

- The media was made on an isolated copy of the studio (own empty `data/` and `public/`, port 3030, English UI, Next dev badge off), so no personal content from the real install appears. The copy was deleted afterwards.
- Content came from the MCP server itself: `packages/mcp/examples/demo-project.mjs` generated six stylized 16:9 images with local FLUX schnell (8 steps, ~27 s each warm, ~80 s cold), built the "Little journeys" project with transitions and two captions, and rendered it.
- Screenshots (`docs/images/`): `editor.png` (project open, title layer selected), `create.png`, `gallery.png`, `comfyui-guide.png`. Captured with headless Playwright at 1440x900.
- `editor-demo.gif`: Playwright screen recording of opening the project and playing the preview, converted with ffmpeg (12 fps, 960 px, 160-color palette), 2.8 MB.
- Found on the way: the editor's empty-library sentence read badly in English ("Generate some on the page."); fixed to "Go to the Video page to generate some."

To refresh the media later: run the studio with an empty data folder, run the example script, then screenshot and record the same pages.
