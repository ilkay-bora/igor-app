import { promises as fs } from "fs";
import path from "path";
import { enqueueJob, getJobs, type VideoJob } from "@/lib/video-jobs";
import { renderTimeline, type EditorClipInput } from "@/lib/editor-render";
import { tServer } from "@/lib/i18n-server";

const STATE_PATH = path.join(process.cwd(), "data", "video-projects.json");

export type VideoProject = {
  id: string;
  sceneCount: number;
  sceneJobIds: string[];
  status: "running" | "done" | "error";
  finalUrl?: string;
  error?: string;
  createdAt: string;
};

let projects: VideoProject[] | null = null;

async function load(): Promise<VideoProject[]> {
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

export async function getProjects(): Promise<VideoProject[]> {
  return load();
}

export type SceneInput = {
  prompt: string;
  imagePrompt?: string;
  durationSeconds: number;
  useStartImage?: boolean;
  startImageDataUrl?: string;
  startImageProvider?: string;
  startImageSteps?: number;
  generateAudio?: boolean;
};

// A "project" is just several existing VideoJobs (each scene reuses the
// normal single-clip pipeline in video-jobs.ts) tagged with the same
// projectId, run through the same sequential queue. Once every scene job
// settles, onSceneJobSettled stitches the finished clips into one video via
// the same xfade/acrossfade timeline renderer the manual editor uses
// (editor-render.ts) — gives real crossfade transitions between scenes
// instead of a hard cut, and re-encodes (unlike the old ffmpeg concat
// `-c copy` approach) since xfade needs decoded frames to blend.
export async function enqueueProject(params: {
  width: number;
  height: number;
  fps: number;
  scenes: SceneInput[];
  // Masal/storybook mode: one character-reference image + one fixed seed,
  // reused by every scene's start-image generation (image-to-image
  // conditioning — Gemini nano-banana editing or ComfyUI FLUX img2img) so the
  // character/style stays the same across the whole project instead of a
  // fresh random design per scene. referenceProvider must be whichever
  // provider actually supports image-to-image and was used to generate the
  // reference itself (gemini or comfy-flux-schnell/dev).
  referenceImageDataUrl?: string;
  referenceProvider?: string;
  referenceDenoise?: number;
  seed?: number;
  // Pins every scene's LTX video generation to the same seed (separate
  // concern from `seed` above, which is the start-image seed) — lets a
  // known-clean roll be reused across the whole project instead of a fresh
  // random gamble per scene.
  videoSeed?: number;
  motionLevel?: "normal" | "dusuk";
}): Promise<VideoProject> {
  if (params.scenes.length < 2) {
    throw new Error(tServer("Bir proje en az 2 sahne içermeli"));
  }

  const list = await load();
  const id = crypto.randomUUID();

  const sceneJobIds: string[] = [];
  for (let i = 0; i < params.scenes.length; i++) {
    const scene = params.scenes[i];
    const job = await enqueueJob({
      prompt: scene.prompt,
      imagePrompt: scene.imagePrompt,
      width: params.width,
      height: params.height,
      durationSeconds: scene.durationSeconds,
      fps: params.fps,
      useStartImage: scene.useStartImage,
      startImageDataUrl: scene.startImageDataUrl,
      // A shared reference forces image-to-image conditioning — override
      // whatever provider the scene form had selected with the one that
      // actually generated the reference, so masal mode always gets real
      // character consistency.
      startImageProvider: params.referenceImageDataUrl
        ? (params.referenceProvider ?? "comfy-flux-schnell")
        : scene.startImageProvider,
      startImageSteps: scene.startImageSteps,
      generateAudio: scene.generateAudio,
      projectId: id,
      sceneIndex: i,
      referenceImageDataUrl: params.referenceImageDataUrl,
      referenceDenoise: params.referenceDenoise,
      seed: params.seed,
      videoSeed: params.videoSeed,
      motionLevel: params.motionLevel,
    });
    sceneJobIds.push(job.id);
  }

  const project: VideoProject = {
    id,
    sceneCount: params.scenes.length,
    sceneJobIds,
    status: "running",
    createdAt: new Date().toISOString(),
  };
  list.unshift(project);
  await persist();
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  const list = await load();
  const project = list.find((p) => p.id === id);
  if (!project) return;
  if (project.finalUrl) {
    await fs
      .unlink(path.join(process.cwd(), "public", project.finalUrl.replace(/^\//, "")))
      .catch(() => undefined);
  }
  projects = list.filter((p) => p.id !== id);
  await persist();
}

export async function onSceneJobSettled(projectId: string): Promise<void> {
  const list = await load();
  const project = list.find((p) => p.id === projectId);
  if (!project || project.status !== "running") return;

  const allJobs = await getJobs();
  const sceneJobs = project.sceneJobIds
    .map((jid) => allJobs.find((j) => j.id === jid))
    .filter((j): j is VideoJob => !!j);

  if (sceneJobs.some((j) => j.status === "queued" || j.status === "running")) return;

  const failedIndex = sceneJobs.findIndex((j) => j.status === "error");
  if (failedIndex !== -1) {
    project.status = "error";
    project.error = tServer("Sahne {v1} üretilemedi: {v2}", { v1: failedIndex + 1, v2: sceneJobs[failedIndex].error });
    await persist();
    return;
  }

  try {
    project.finalUrl = await stitchScenes(project.id, sceneJobs);
    project.status = "done";
  } catch (err) {
    project.status = "error";
    project.error = err instanceof Error ? err.message : String(err);
  }
  await persist();
}

async function stitchScenes(projectId: string, sceneJobs: VideoJob[]): Promise<string> {
  const ordered = [...sceneJobs].sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));

  const clips: EditorClipInput[] = ordered.map((j) => ({
    sourcePath: path.join(process.cwd(), "public", j.url!.replace(/^\//, "")),
    trimStart: 0,
    trimEnd: j.durationSeconds,
    // "fade" (plain crossfade) as the auto-stitch default — a gentle,
    // universally-safe transition. The user can re-pick per-pair transitions
    // (dissolve/wipe/slide/etc.) by opening this project's scenes in
    // /video/editor, since each scene is a separately-picked clip there.
    transitionAfter: "fade",
    muteOriginal: !j.generateAudio,
  }));

  const first = ordered[0];
  return renderTimeline({
    id: projectId,
    clips,
    width: first.width,
    height: first.height,
    fps: first.fps,
    musicVolume: 1,
    voiceVolume: 1,
    voiceStartTime: 0,
    overlays: [],
  });
}
