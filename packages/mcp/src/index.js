#!/usr/bin/env node
// IGOR MCP server (stdio). Every tool is a thin call to the running studio's
// local API, so the desktop app's queues, gallery and editor stay the single
// source of truth: whatever an agent builds here shows up in the IGOR UI.
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, IgorError } from "./connection.js";

const server = new McpServer({ name: "igor", version: "0.1.0" });

const RESOLUTIONS = ["1280x720", "720x1280", "1024x1024"];
const TRANSITIONS = [
  "cut",
  "fade",
  "fadeblack",
  "dissolve",
  "slideleft",
  "slideright",
  "wipeleft",
  "wiperight",
  "circleopen",
  "radial",
];
const RENDER_POLL_MS = 3000;

function ok(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function localFile(studioDir, url) {
  return studioDir && url ? path.join(studioDir, "public", ...url.replace(/^\//, "").split("/")) : undefined;
}

// A cold ComfyUI start plus the first FLUX load takes over a minute, longer
// than some clients' default request timeout. Clients that send a progress
// token get a heartbeat, which lets them keep waiting (resetTimeoutOnProgress).
const HEARTBEAT_MS = 10_000;

/** Runs a tool body, turning IGOR errors into tool errors the agent can read. */
function tool(handler) {
  return async (args, extra) => {
    const progressToken = extra?._meta?.progressToken;
    let beats = 0;
    const heartbeat =
      progressToken !== undefined
        ? setInterval(() => {
            beats += 1;
            extra
              .sendNotification({
                method: "notifications/progress",
                params: { progressToken, progress: beats, message: `working (${(beats * HEARTBEAT_MS) / 1000}s)` },
              })
              .catch(() => {});
          }, HEARTBEAT_MS)
        : null;
    try {
      return ok(await handler(args));
    } catch (err) {
      const message = err instanceof IgorError ? err.message : `Unexpected error: ${err?.message ?? err}`;
      return { content: [{ type: "text", text: message }], isError: true };
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  };
}

server.registerTool(
  "generate_image",
  {
    title: "Generate image",
    description:
      "Generate an image and save it to the IGOR gallery. Returns the gallery record; pass its `url` to add_clip as source_url. " +
      "flux-schnell (local, ~15-30 s) is the default; flux-dev (local) is higher quality but can take several minutes; gemini needs a Gemini key in IGOR settings.",
    inputSchema: {
      prompt: z.string().min(1).describe("What to draw. English prompts work best for FLUX."),
      model: z.enum(["flux-schnell", "flux-dev", "gemini"]).default("flux-schnell"),
      ratio: z.enum(["16:9", "9:16", "1:1", "4:3"]).default("16:9").describe("Match the project: 16:9 for 1280x720, 9:16 for 720x1280."),
      steps: z.number().int().min(1).max(60).optional().describe("FLUX sampling steps (schnell default 4, dev 28)."),
      seed: z.number().int().optional().describe("Reuse a seed for consistent variations."),
      tag: z.string().max(40).optional().describe("Gallery tag to group this image with others."),
    },
  },
  tool(async (args) => {
    const { data, baseUrl, studioDir } = await api("POST", "/api/images", args);
    return { ...data, file: localFile(studioDir, data.url), viewUrl: `${baseUrl}${data.url}` };
  })
);

server.registerTool(
  "list_media",
  {
    title: "List media",
    description: "List images in the IGOR gallery (newest first). Their `url` values can be used as add_clip source_url.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).default(20),
      tag: z.string().optional(),
    },
  },
  tool(async ({ limit, tag }) => {
    const { data } = await api("GET", "/api/images");
    return data.filter((g) => !tag || g.tag === tag).slice(0, limit);
  })
);

server.registerTool(
  "list_projects",
  {
    title: "List projects",
    description: "List saved IGOR editor projects (newest first) with clip count and total duration.",
    inputSchema: {},
  },
  tool(async () => (await api("GET", "/api/projects")).data)
);

server.registerTool(
  "create_project",
  {
    title: "Create project",
    description: "Create an empty editor project. Returns its id for add_clip, add_text, render_project and open_in_editor.",
    inputSchema: {
      name: z.string().max(120).describe("Project name shown in IGOR."),
      resolution: z.enum(RESOLUTIONS).default("1280x720").describe("1280x720 landscape, 720x1280 vertical (Reels/TikTok), 1024x1024 square."),
    },
  },
  tool(async (args) => {
    const { data } = await api("POST", "/api/projects", args);
    return { id: data.id, name: data.name, resolution: data.draft.resolution };
  })
);

server.registerTool(
  "get_project",
  {
    title: "Get project",
    description: "Full project document: timeline clips (with keys, trims, transitions), text overlays and other layers.",
    inputSchema: { project_id: z.string() },
  },
  tool(async ({ project_id }) => (await api("GET", `/api/projects/${encodeURIComponent(project_id)}`)).data)
);

server.registerTool(
  "add_clip",
  {
    title: "Add clip",
    description:
      "Append a clip to the project's timeline (or insert at `position`). source_url is a gallery image (/generated/...) or a video (/videos/...). " +
      "Images are held for `duration` seconds (default 4). Videos play from trim_start to trim_end (defaults: whole clip). " +
      "transition_after is the transition into the next clip.",
    inputSchema: {
      project_id: z.string(),
      source_url: z.string().describe("e.g. /generated/1730000000-a-cat.png or /videos/<id>.mp4"),
      duration: z.number().positive().max(600).optional().describe("Seconds to show an image clip."),
      trim_start: z.number().min(0).optional(),
      trim_end: z.number().positive().optional(),
      transition_after: z.enum(TRANSITIONS).default("cut"),
      mute_original: z.boolean().optional().describe("Mute the video's own audio."),
      volume: z.number().min(0).max(2).optional(),
      position: z.number().int().min(0).optional().describe("0-based timeline index; default appends."),
      label: z.string().max(120).optional(),
    },
  },
  tool(async ({ project_id, source_url, trim_start, trim_end, transition_after, mute_original, ...rest }) => {
    const { data } = await api("POST", `/api/projects/${encodeURIComponent(project_id)}/clips`, {
      sourceUrl: source_url,
      trimStart: trim_start,
      trimEnd: trim_end,
      transitionAfter: transition_after,
      muteOriginal: mute_original,
      ...rest,
    });
    return data;
  })
);

server.registerTool(
  "remove_clip",
  {
    title: "Remove clip",
    description: "Remove a clip from the timeline by its key (from add_clip or get_project).",
    inputSchema: { project_id: z.string(), clip_key: z.string() },
  },
  tool(async ({ project_id, clip_key }) =>
    (await api("DELETE", `/api/projects/${encodeURIComponent(project_id)}/clips?key=${encodeURIComponent(clip_key)}`)).data
  )
);

server.registerTool(
  "add_text",
  {
    title: "Add text",
    description: "Add a text overlay shown from start_time to end_time (seconds on the project timeline).",
    inputSchema: {
      project_id: z.string(),
      text: z.string().min(1).max(500),
      start_time: z.number().min(0),
      end_time: z.number().positive(),
      position: z.enum(["top", "center", "bottom"]).default("center"),
      font_size: z.number().int().min(8).max(300).default(48).describe("Pixels at the project resolution."),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
      motion: z.enum(["none", "sway", "spin", "spinin", "marquee"]).default("none"),
    },
  },
  tool(async ({ project_id, start_time, end_time, font_size, ...rest }) => {
    const { data } = await api("POST", `/api/projects/${encodeURIComponent(project_id)}/texts`, {
      startTime: start_time,
      endTime: end_time,
      fontSize: font_size,
      ...rest,
    });
    return data;
  })
);

async function renderStatus(renderId) {
  const { data, baseUrl, studioDir } = await api("GET", `/api/editor-projects/${encodeURIComponent(renderId)}`);
  return {
    renderId: data.id,
    status: data.status,
    ...(data.error ? { error: data.error } : {}),
    ...(data.finalUrl
      ? { url: data.finalUrl, file: localFile(studioDir, data.finalUrl), viewUrl: `${baseUrl}${data.finalUrl}` }
      : {}),
  };
}

server.registerTool(
  "render_project",
  {
    title: "Render project",
    description:
      "Render the project to MP4 on IGOR's render queue (also visible in the editor's Render'lar tab). " +
      "With wait=true (default) this returns when the render is done, with the MP4's local file path; otherwise poll get_render.",
    inputSchema: {
      project_id: z.string(),
      wait: z.boolean().default(true),
      timeout_seconds: z.number().int().min(10).max(3600).default(600),
    },
  },
  tool(async ({ project_id, wait, timeout_seconds }) => {
    const { data } = await api("POST", `/api/projects/${encodeURIComponent(project_id)}/render`);
    if (!wait) return data;
    const until = Date.now() + timeout_seconds * 1000;
    while (Date.now() < until) {
      const status = await renderStatus(data.renderId);
      if (status.status === "done" || status.status === "error") return status;
      await new Promise((r) => setTimeout(r, RENDER_POLL_MS));
    }
    return { ...(await renderStatus(data.renderId)), note: "Still rendering; poll get_render." };
  })
);

server.registerTool(
  "get_render",
  {
    title: "Get render",
    description: "Status of a render started by render_project: queued, running, done (with file path) or error.",
    inputSchema: { render_id: z.string() },
  },
  tool(async ({ render_id }) => renderStatus(render_id))
);

server.registerTool(
  "open_in_editor",
  {
    title: "Open in editor",
    description:
      "Get the link that opens the project in IGOR's timeline editor so the user can polish it. Give the link to the user. " +
      "The editor asks before replacing an unsaved draft.",
    inputSchema: { project_id: z.string() },
  },
  tool(async ({ project_id }) => {
    const { data, baseUrl } = await api("GET", `/api/projects/${encodeURIComponent(project_id)}`);
    return { name: data.name, editorUrl: `${baseUrl}/video/editor?project=${data.id}` };
  })
);

await server.connect(new StdioServerTransport());
