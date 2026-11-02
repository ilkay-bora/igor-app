import { promises as fs } from "fs";
import path from "path";
import {
  renderTimeline,
  type EditorClipInput,
  type EditorOverlayInput,
  type EditorStripInput,
} from "@/lib/editor-render";
import type { ImageCrop, MotionType } from "@/lib/editor-motion";

const STATE_PATH = path.join(process.cwd(), "data", "editor-projects.json");
const VIDEOS_DIR = path.join(process.cwd(), "public", "videos");

export type EditorAudioLayer = {
  // A /videos/ or /voices/ URL; from the client, an upload's data URL also.
  src: string;
  filename?: string;
  start: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  loop?: boolean;
};

export type EditorImageLayer = {
  // A /strips/ URL; from the client, an upload's data URL also.
  src: string;
  filename?: string;
  startTime: number;
  endTime: number;
  cx: number;
  cy: number;
  widthPct: number;
  rotation: number;
  motion: MotionType;
  crop?: ImageCrop;
};

export type EditorProject = {
  id: string;
  clips: EditorClipInput[];
  width: number;
  height: number;
  fps: number;
  musicUrl?: string;
  musicVolume: number;
  voiceUrl?: string;
  voiceVolume: number;
  voiceStartTime: number;
  overlays: EditorOverlayInput[];
  audioLayers?: EditorAudioLayer[];
  strips?: EditorStripInput[];
  imageLayers?: EditorImageLayer[];
  status: "queued" | "running" | "done" | "error";
  finalUrl?: string;
  error?: string;
  createdAt: string;
};

let projects: EditorProject[] | null = null;
let processing = false;

async function load(): Promise<EditorProject[]> {
  if (projects) return projects;
  try {
    projects = JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    projects = [];
  }
  return projects!;
}

async function persist() {
  if (!projects) return;
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(projects, null, 2));
}

export async function getEditorProjects(): Promise<EditorProject[]> {
  return load();
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Geçersiz ses verisi");
  // Keep the browser-supplied extension out of the data URL itself — MIME
  // type alone doesn't reliably map to an extension ffmpeg needs, so callers
  // pass the filename's extension separately.
  return { buffer: Buffer.from(match[1], "base64"), ext: "audio" };
}

async function saveAudioFile(id: string, dataUrl: string, filename: string, kind: string): Promise<string> {
  const { buffer } = decodeDataUrl(dataUrl);
  const ext = path.extname(filename).slice(1) || "mp3";
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  const outFilename = `${id}-${kind}.${ext}`;
  await fs.writeFile(path.join(VIDEOS_DIR, outFilename), buffer);
  return `/videos/${outFilename}`;
}

export async function enqueueEditorProject(params: {
  clips: EditorClipInput[];
  width: number;
  height: number;
  fps: number;
  musicDataUrl?: string;
  musicFilename?: string;
  musicVolume: number;
  voiceDataUrl?: string;
  voiceFilename?: string;
  voiceVolume?: number;
  voiceStartTime?: number;
  overlays: EditorOverlayInput[];
  audioLayers?: EditorAudioLayer[];
  strips?: EditorStripInput[];
  imageLayers?: EditorImageLayer[];
}): Promise<EditorProject> {
  if (params.clips.length === 0) {
    throw new Error("En az 1 klip gerekli");
  }

  const list = await load();
  const id = crypto.randomUUID();

  let musicUrl: string | undefined;
  if (params.musicDataUrl) {
    musicUrl = await saveAudioFile(id, params.musicDataUrl, params.musicFilename ?? "music.mp3", "music");
  }

  let voiceUrl: string | undefined;
  if (params.voiceDataUrl) {
    voiceUrl = await saveAudioFile(id, params.voiceDataUrl, params.voiceFilename ?? "voice.mp3", "voice");
  }

  const audioLayers: EditorAudioLayer[] = [];
  for (const [i, layer] of (params.audioLayers ?? []).entries()) {
    if (layer.src.startsWith("data:")) {
      const src = await saveAudioFile(id, layer.src, layer.filename ?? "audio.mp3", `layer${i}`);
      audioLayers.push({ ...layer, src });
    } else if (/^\/(videos|voices)\/[^/\\]+$/.test(layer.src)) {
      audioLayers.push(layer);
    } else {
      throw new Error("Geçersiz ses katmanı kaynağı");
    }
  }

  const imageLayers: EditorImageLayer[] = [];
  for (const [i, layer] of (params.imageLayers ?? []).entries()) {
    if (layer.src.startsWith("data:")) {
      const src = await saveAudioFile(id, layer.src, layer.filename ?? "image.png", `image${i}`);
      imageLayers.push({ ...layer, src });
    } else if (/^\/(strips|videos)\/[^/\\]+$/.test(layer.src)) {
      imageLayers.push(layer);
    } else {
      throw new Error("Geçersiz görsel katmanı kaynağı");
    }
  }

  const project: EditorProject = {
    id,
    clips: params.clips,
    width: params.width,
    height: params.height,
    fps: params.fps,
    musicUrl,
    musicVolume: params.musicVolume,
    voiceUrl,
    voiceVolume: params.voiceVolume ?? 1,
    voiceStartTime: params.voiceStartTime ?? 0,
    overlays: params.overlays,
    audioLayers,
    strips: params.strips ?? [],
    imageLayers,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  list.unshift(project);
  await persist();

  if (!processing) void processQueue();
  return project;
}

export async function deleteEditorProject(id: string): Promise<void> {
  const list = await load();
  const project = list.find((p) => p.id === id);
  if (!project) return;
  if (project.finalUrl) {
    await fs
      .unlink(path.join(process.cwd(), "public", project.finalUrl.replace(/^\//, "")))
      .catch(() => undefined);
  }
  if (project.musicUrl) {
    await fs
      .unlink(path.join(process.cwd(), "public", project.musicUrl.replace(/^\//, "")))
      .catch(() => undefined);
  }
  if (project.voiceUrl) {
    await fs
      .unlink(path.join(process.cwd(), "public", project.voiceUrl.replace(/^\//, "")))
      .catch(() => undefined);
  }
  // Only uploads belong to a project; extracted layers point at source clips.
  // A revised project reuses its original's uploads, so they go with the last
  // project that references them.
  const usedElsewhere = new Set(
    list.filter((p) => p.id !== id).flatMap((p) => [...(p.audioLayers ?? []), ...(p.imageLayers ?? [])].map((l) => l.src))
  );
  for (const layer of [...(project.audioLayers ?? []), ...(project.imageLayers ?? [])]) {
    if (!/^\/videos\/[0-9a-f-]{36}-(layer|image)\d+\./.test(layer.src) || usedElsewhere.has(layer.src)) continue;
    await fs
      .unlink(path.join(process.cwd(), "public", layer.src.replace(/^\//, "")))
      .catch(() => undefined);
  }
  projects = list.filter((p) => p.id !== id);
  await persist();
}

async function processQueue() {
  processing = true;
  const list = await load();

  while (true) {
    const next = [...list].reverse().find((p) => p.status === "queued");
    if (!next) break;

    next.status = "running";
    await persist();

    try {
      const clips = next.clips.map((c) => ({
        ...c,
        sourcePath: path.join(process.cwd(), "public", c.sourcePath.replace(/^\//, "")),
      }));
      const musicPath = next.musicUrl
        ? path.join(process.cwd(), "public", next.musicUrl.replace(/^\//, ""))
        : undefined;
      const voicePath = next.voiceUrl
        ? path.join(process.cwd(), "public", next.voiceUrl.replace(/^\//, ""))
        : undefined;

      next.finalUrl = await renderTimeline({
        id: next.id,
        clips,
        width: next.width,
        height: next.height,
        fps: next.fps,
        musicPath,
        musicVolume: next.musicVolume,
        voicePath,
        voiceVolume: next.voiceVolume,
        voiceStartTime: next.voiceStartTime,
        overlays: next.overlays,
        audioLayers: (next.audioLayers ?? []).map(({ src, start, trimStart, trimEnd, volume, loop }) => ({
          sourcePath: path.join(process.cwd(), "public", src.replace(/^\//, "")),
          start,
          trimStart,
          trimEnd,
          volume,
          loop,
        })),
        strips: next.strips,
        imageLayers: (next.imageLayers ?? []).map(({ src, ...layer }) => ({
          ...layer,
          sourcePath: path.join(process.cwd(), "public", src.replace(/^\//, "")),
        })),
      });
      next.status = "done";
    } catch (err) {
      next.status = "error";
      next.error = err instanceof Error ? err.message : String(err);
    }
    await persist();
  }

  processing = false;
}
