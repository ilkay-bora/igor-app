import crypto from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { FFMPEG_PATH } from "@/lib/ffmpeg-path";
import { TEXT_POSITION_Y, type MotionType } from "@/lib/editor-motion";
import {
  DEFAULT_RESOLUTION,
  draftDuration,
  emptyDraft,
  RENDER_FPS,
  type EditorDraft,
  type OverlayForm,
  type TimelineClip,
} from "@/lib/editor-schema";
import type { TransitionType } from "@/lib/providers";

// Saved editor projects, one JSON file each under data/projects/. Agents build
// these through the local API / MCP server; the editor opens one into its
// draft with /video/editor?project=<id>. The payload is the editor's own
// draft shape, so nothing gets translated on the way in or out.

const DIR = path.join(process.cwd(), "data", "projects");
const PUBLIC_DIR = path.join(process.cwd(), "public");
export const PROJECT_VERSION = 1;
// Stills have no length of their own; agents get a default that suits
// slideshows and can pass their own. They become clips, see stillToClip.
const IMAGE_CLIP_SECONDS = 4;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SOURCE_URL = /^\/(videos|generated)\/[^/\\]+$/;
const ID = /^[0-9a-f-]{36}$/;

export const RESOLUTIONS = ["1280x720", "720x1280", "1024x1024"] as const;
export const TRANSITION_TYPES: TransitionType[] = [
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
export const MOTION_TYPES: MotionType[] = ["none", "spin", "sway", "spinin", "marquee"];

export type Project = {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  draft: EditorDraft;
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  resolution: string;
  clips: number;
  duration: number;
};

export class ProjectError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function fileFor(id: string): string {
  if (!ID.test(id)) throw new ProjectError("Geçersiz proje id", 404);
  return path.join(DIR, `${id}.json`);
}

async function write(project: Project): Promise<Project> {
  await fs.mkdir(DIR, { recursive: true });
  const file = fileFor(project.id);
  // Write-then-rename so a crash mid-write never leaves a half-written file.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2), "utf8");
  await fs.rename(tmp, file);
  return project;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    resolution: p.draft.resolution,
    clips: p.draft.timeline.length,
    duration: round(draftDuration(p.draft)),
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(DIR)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const n of names) {
    try {
      out.push(summarize(JSON.parse(await fs.readFile(path.join(DIR, n), "utf8"))));
    } catch {
      // unreadable file: skip it rather than fail the whole list
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project> {
  const file = fileFor(id);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Project;
  } catch {
    throw new ProjectError("Proje bulunamadı", 404);
  }
}

export async function createProject(params: { name?: string; resolution?: string }): Promise<Project> {
  const resolution = params.resolution ?? DEFAULT_RESOLUTION;
  if (!(RESOLUTIONS as readonly string[]).includes(resolution)) {
    throw new ProjectError(`Çözünürlük şunlardan biri olmalı: ${RESOLUTIONS.join(", ")}`);
  }
  const now = new Date().toISOString();
  return write({
    id: crypto.randomUUID(),
    name: params.name?.trim().slice(0, 120) || "Adsız proje",
    version: PROJECT_VERSION,
    createdAt: now,
    updatedAt: now,
    draft: emptyDraft(resolution),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await fs.rm(fileFor(id), { force: true });
}

async function update(id: string, change: (p: Project) => void): Promise<Project> {
  const project = await getProject(id);
  change(project);
  project.updatedAt = new Date().toISOString();
  return write(project);
}

export async function renameProject(id: string, name: string): Promise<Project> {
  return update(id, (p) => {
    p.name = name.trim().slice(0, 120) || p.name;
  });
}

/** Seconds of a media file, read from ffmpeg's own probe output. */
function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_PATH, ["-hide_banner", "-i", filePath]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => {
      const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    });
    proc.on("error", () => resolve(null));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg hatası (kod ${code}): ${stderr.slice(-500)}`))
    );
    proc.on("error", reject);
  });
}

// The editor previews its timeline on a <video> element, so a still goes in
// as a short clip: fitted to the project frame, with a silent audio track.
async function stillToClip(imagePath: string, resolution: string, seconds: number): Promise<string> {
  const [w, h] = resolution.split("x").map(Number);
  const filename = `still-${crypto.randomUUID()}.mp4`;
  await fs.mkdir(path.join(PUBLIC_DIR, "videos"), { recursive: true });
  await runFfmpeg([
    "-y",
    "-loop", "1",
    "-framerate", String(RENDER_FPS),
    "-t", String(seconds),
    "-i", imagePath,
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    "-map", "0:v",
    "-map", "1:a",
    "-shortest",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "18",
    "-c:a", "aac",
    "-movflags", "+faststart",
    path.join(PUBLIC_DIR, "videos", filename),
  ]);
  return `/videos/${filename}`;
}

async function resolveSource(sourceUrl: string): Promise<{ isImage: boolean; duration: number | null }> {
  if (!SOURCE_URL.test(sourceUrl)) {
    throw new ProjectError("Kaynak /videos/ ya da /generated/ altında bir dosya olmalı");
  }
  const filePath = path.join(PUBLIC_DIR, sourceUrl.slice(1));
  try {
    await fs.access(filePath);
  } catch {
    throw new ProjectError(`Kaynak dosya yok: ${sourceUrl}`, 404);
  }
  const isImage = IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  return { isImage, duration: isImage ? null : await probeDuration(filePath) };
}

export async function addClip(
  id: string,
  params: {
    sourceUrl: string;
    label?: string;
    duration?: number;
    trimStart?: number;
    trimEnd?: number;
    transitionAfter?: TransitionType;
    muteOriginal?: boolean;
    volume?: number;
    position?: number;
  }
): Promise<{ project: Project; clip: TimelineClip }> {
  const { draft } = await getProject(id);
  const { isImage, duration: probed } = await resolveSource(params.sourceUrl);
  if (params.transitionAfter && !TRANSITION_TYPES.includes(params.transitionAfter)) {
    throw new ProjectError(`Geçiş şunlardan biri olmalı: ${TRANSITION_TYPES.join(", ")}`);
  }
  let sourceUrl = params.sourceUrl;
  let knownDuration: number;
  let trimStart: number;
  let trimEnd: number;
  if (isImage) {
    knownDuration = round(Math.min(600, Math.max(0.2, params.duration ?? IMAGE_CLIP_SECONDS)));
    sourceUrl = await stillToClip(path.join(PUBLIC_DIR, params.sourceUrl.slice(1)), draft.resolution, knownDuration);
    trimStart = 0;
    trimEnd = knownDuration;
  } else {
    // A video can't play past its own end.
    knownDuration = probed ?? params.duration ?? 10;
    trimStart = Math.min(Math.max(0, params.trimStart ?? 0), knownDuration - 0.2);
    trimEnd = Math.min(knownDuration, Math.max(trimStart + 0.2, params.trimEnd ?? knownDuration));
  }
  const clip: TimelineClip = {
    key: crypto.randomUUID(),
    sourceUrl,
    label: params.label?.trim().slice(0, 120) || path.basename(params.sourceUrl),
    knownDuration: round(knownDuration),
    trimStart: round(trimStart),
    trimEnd: round(trimEnd),
    transitionAfter: params.transitionAfter ?? "cut",
    muteOriginal: params.muteOriginal ?? false,
    ...(params.volume !== undefined ? { volume: Math.min(2, Math.max(0, params.volume)) } : {}),
  };
  const project = await update(id, (p) => {
    const at = params.position ?? p.draft.timeline.length;
    p.draft.timeline.splice(Math.min(Math.max(0, at), p.draft.timeline.length), 0, clip);
  });
  return { project, clip };
}

export async function removeClip(id: string, clipKey: string): Promise<Project> {
  return update(id, (p) => {
    const before = p.draft.timeline.length;
    p.draft.timeline = p.draft.timeline.filter((c) => c.key !== clipKey);
    if (p.draft.timeline.length === before) throw new ProjectError("Klip bulunamadı", 404);
  });
}

export async function addText(
  id: string,
  params: {
    text: string;
    startTime: number;
    endTime: number;
    position?: keyof typeof TEXT_POSITION_Y;
    cx?: number;
    cy?: number;
    fontSize?: number;
    color?: string;
    motion?: MotionType;
  }
): Promise<{ project: Project; overlay: OverlayForm }> {
  if (typeof params.text !== "string" || !params.text.trim()) throw new ProjectError("Metin boş olamaz");
  if (!(params.startTime >= 0) || !(params.endTime > params.startTime)) {
    throw new ProjectError("startTime >= 0 ve endTime > startTime olmalı (saniye)");
  }
  if (params.motion && !MOTION_TYPES.includes(params.motion)) {
    throw new ProjectError(`Hareket şunlardan biri olmalı: ${MOTION_TYPES.join(", ")}`);
  }
  if (params.color && !/^#[0-9a-fA-F]{6}$/.test(params.color)) {
    throw new ProjectError("Renk #rrggbb biçiminde olmalı");
  }
  if (params.position && !(params.position in TEXT_POSITION_Y)) {
    throw new ProjectError("Konum top, center ya da bottom olmalı");
  }
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const overlay: OverlayForm = {
    key: crypto.randomUUID(),
    text: params.text.slice(0, 500),
    startTime: round(params.startTime),
    endTime: round(params.endTime),
    cx: clamp01(params.cx ?? 0.5),
    cy: clamp01(params.cy ?? TEXT_POSITION_Y[params.position ?? "center"]),
    motion: params.motion ?? "none",
    fontSize: Math.min(300, Math.max(8, Math.round(params.fontSize ?? 48))),
    color: params.color ?? "#ffffff",
  };
  const project = await update(id, (p) => {
    p.draft.overlays.push(overlay);
  });
  return { project, overlay };
}
