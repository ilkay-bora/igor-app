// Example: what an agent does through the IGOR MCP server. Generates six
// images with local FLUX schnell, builds a 1280x720 project with transitions
// and captions, renders it and prints the editor link. This is how the README
// demo was made. Needs IGOR running (desktop app or `npm run dev`) and ComfyUI.
//
//   node packages/mcp/examples/demo-project.mjs
//
// IGOR_URL / IGOR_TOKEN work as for the server itself.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const c = new Client({ name: "demo", version: "0" });
const server = fileURLToPath(new URL("../src/index.js", import.meta.url));
await c.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env } }));
const call = async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args }, undefined, { timeout: 900000, resetTimeoutOnProgress: true, onprogress: () => {} });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
};
const look = "stylized 3D animation look, soft global illumination, cinematic wide shot";
const prompts = [
  "a small lighthouse on a rocky island at dawn, pastel sky, calm sea",
  "a red paper boat sailing on gentle sea waves at golden hour",
  "a hot air balloon drifting over green rolling hills, morning mist",
  "a curious orange fox sitting in tall golden grass at sunset",
  "a cozy wooden cabin in a snowy pine forest at night, warm glowing windows",
  "a tiny friendly robot watering a plant on a sunny windowsill",
];
const urls = [];
for (const p of prompts) {
  const t0 = Date.now();
  const img = await call("generate_image", { prompt: `${p}, ${look}`, ratio: "16:9", steps: 8, tag: "demo" });
  urls.push(img.url);
  console.log("image", img.url, ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
const proj = await call("create_project", { name: "Little journeys", resolution: "1280x720" });
const transitions = ["dissolve", "fade", "slideleft", "circleopen", "fadeblack", "cut"];
for (let i = 0; i < urls.length; i++) await call("add_clip", { project_id: proj.id, source_url: urls[i], duration: 3, transition_after: transitions[i] });
await call("add_text", { project_id: proj.id, text: "Little journeys", start_time: 0.3, end_time: 2.6, position: "center", font_size: 72 });
await call("add_text", { project_id: proj.id, text: "Drafted by an agent, polished by you", start_time: 12, end_time: 15, position: "bottom", font_size: 40, color: "#ffe7a3" });
const r = await call("render_project", { project_id: proj.id });
console.log("render", r.status, r.file);
console.log("open in editor:", (await call("open_in_editor", { project_id: proj.id })).editorUrl);
await c.close();
