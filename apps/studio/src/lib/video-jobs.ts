import { promises as fs } from "fs";
import path from "path";
import { runLTXVideoGeneration } from "@/lib/video-server";
import { generateStartImage } from "@/lib/start-image";
import { logErrorServer } from "@/lib/error-log-server";
import { decodeImageDataUrl } from "@/lib/comfy-upload";
import { tServer } from "@/lib/i18n-server";

const STATE_PATH = path.join(process.cwd(), "data", "videos.json");
const VIDEOS_DIR = path.join(process.cwd(), "public", "videos");
const DEFAULT_START_IMAGE_STEPS = 8;

export type VideoJob = {
  id: string;
  prompt: string;
  // Masal mode: short visual-only prompt for the scene's start image, kept
  // separate from `prompt` (the video-motion prompt, often full narrative
  // text) — see VideoSceneInput.imagePrompt in providers.ts.
  imagePrompt?: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  useStartImage?: boolean;
  startImageUrl?: string;
  startImageSteps?: number;
  startImageProvider?: string;
  generateAudio?: boolean;
  projectId?: string;
  sceneIndex?: number;
  // Masal/storybook mode: same reference image + seed reused across every
  // scene of a project so the generated character/style stays consistent.
  referenceImageDataUrl?: string;
  referenceDenoise?: number;
  seed?: number;
  // Pins the LTX video generation's own seed (separate from `seed` above,
  // which is the start-image seed) — lets a known-clean, low-artifact roll
  // be reused across scenes/reruns instead of a fresh random one each time.
  videoSeed?: number;
  motionLevel?: "normal" | "dusuk";
  // Set when useStartImage was requested but generateStartImage threw — the
  // job still ran (as pure text-to-video) rather than failing outright, but
  // the UI should surface this so a silent image/video mismatch is visible.
  startImageFallback?: boolean;
  status: "queued" | "running" | "done" | "error";
  url?: string;
  ms?: number;
  error?: string;
  createdAt: string;
};

let jobs: VideoJob[] | null = null;
let processing = false;

async function load(): Promise<VideoJob[]> {
  if (jobs) return jobs;
  try {
    jobs = JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    jobs = [];
  }
  return jobs!;
}

async function persist() {
  if (!jobs) return;
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(jobs, null, 2));
}

export async function getJobs(): Promise<VideoJob[]> {
  return load();
}

async function saveReferenceImage(jobId: string, dataUrl: string): Promise<string> {
  const { buffer, ext } = decodeImageDataUrl(dataUrl);
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  const filename = `${jobId}-ref.${ext}`;
  await fs.writeFile(path.join(VIDEOS_DIR, filename), buffer);
  return `/videos/${filename}`;
}

export async function enqueueJob(params: {
  prompt: string;
  imagePrompt?: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  useStartImage?: boolean;
  startImageDataUrl?: string;
  startImageSteps?: number;
  startImageProvider?: string;
  generateAudio?: boolean;
  projectId?: string;
  sceneIndex?: number;
  referenceImageDataUrl?: string;
  referenceDenoise?: number;
  seed?: number;
  videoSeed?: number;
  motionLevel?: "normal" | "dusuk";
}): Promise<VideoJob> {
  const list = await load();
  const id = crypto.randomUUID();

  let startImageUrl: string | undefined;
  if (params.startImageDataUrl) {
    startImageUrl = await saveReferenceImage(id, params.startImageDataUrl);
  }

  const job: VideoJob = {
    id,
    prompt: params.prompt,
    imagePrompt: params.imagePrompt,
    width: params.width,
    height: params.height,
    durationSeconds: params.durationSeconds,
    fps: params.fps,
    useStartImage: params.useStartImage ?? !!startImageUrl,
    startImageUrl,
    startImageSteps: params.startImageSteps ?? DEFAULT_START_IMAGE_STEPS,
    startImageProvider: params.startImageProvider,
    generateAudio: params.generateAudio ?? true,
    projectId: params.projectId,
    sceneIndex: params.sceneIndex,
    referenceImageDataUrl: params.referenceImageDataUrl,
    referenceDenoise: params.referenceDenoise,
    seed: params.seed,
    videoSeed: params.videoSeed,
    motionLevel: params.motionLevel,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  list.unshift(job);
  await persist();

  if (!processing) void processQueue();
  return job;
}

export async function deleteJob(id: string): Promise<void> {
  const list = await load();
  const job = list.find((j) => j.id === id);
  if (!job) return;
  if (job.url) {
    await fs.unlink(path.join(process.cwd(), "public", job.url.replace(/^\//, ""))).catch(() => undefined);
  }
  if (job.startImageUrl) {
    await fs
      .unlink(path.join(process.cwd(), "public", job.startImageUrl.replace(/^\//, "")))
      .catch(() => undefined);
  }
  jobs = list.filter((j) => j.id !== id);
  await persist();
}

async function processQueue() {
  processing = true;
  const list = await load();

  while (true) {
    const next = [...list].reverse().find((j) => j.status === "queued");
    if (!next) break;

    next.status = "running";
    await persist();

    try {
      let startImageDataUrl: string | undefined;

      if (next.startImageUrl) {
        // Reference image was already provided (user upload) and saved at enqueue time.
        const buffer = await fs.readFile(
          path.join(process.cwd(), "public", next.startImageUrl.replace(/^\//, ""))
        );
        const ext = path.extname(next.startImageUrl).slice(1) || "png";
        startImageDataUrl = `data:image/${ext};base64,${buffer.toString("base64")}`;
      } else if (next.useStartImage) {
        try {
          const { imageUrl } = await generateStartImage({
            provider: next.startImageProvider ?? "comfy-flux-schnell",
            prompt: next.imagePrompt ?? next.prompt,
            width: next.width,
            height: next.height,
            steps: next.startImageSteps ?? DEFAULT_START_IMAGE_STEPS,
            referenceImageDataUrl: next.referenceImageDataUrl,
            denoise: next.referenceDenoise,
            seed: next.seed,
          });
          startImageDataUrl = imageUrl;
          next.startImageUrl = await saveReferenceImage(next.id, imageUrl);
          await persist();
        } catch (err) {
          // Fall back to plain text-to-video rather than losing the whole job
          // over a failed starting-frame generation — but flag it so the UI
          // can surface that this clip has no real image/video connection.
          next.startImageFallback = true;
          await logErrorServer({
            prompt: next.prompt,
            modelId: next.startImageProvider ?? "comfy-flux-schnell",
            modelLabel: tServer("Video başlangıç görseli"),
            message: err instanceof Error ? err.message : String(err),
          }).catch(() => undefined);
        }
      }

      const { videoBuffer, ms } = await runLTXVideoGeneration({
        prompt: next.prompt,
        width: next.width,
        height: next.height,
        motionLevel: next.motionLevel,
        durationSeconds: next.durationSeconds,
        fps: next.fps,
        startImageDataUrl,
        generateAudio: next.generateAudio,
        seed: next.videoSeed,
      });
      await fs.mkdir(VIDEOS_DIR, { recursive: true });
      const filename = `${next.id}.mp4`;
      await fs.writeFile(path.join(VIDEOS_DIR, filename), videoBuffer);
      next.status = "done";
      next.url = `/videos/${filename}`;
      next.ms = ms;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      next.status = "error";
      next.error = message;
      await logErrorServer({
        prompt: next.prompt,
        modelId: "ltx-2.3-video",
        modelLabel: "LTX-2.3 (Yerel Video)",
        ratio: "1:1",
        message,
      }).catch(() => undefined);
    }
    await persist();

    if (next.projectId) {
      // Dynamic import avoids a circular import at module-load time
      // (video-projects.ts imports enqueueJob from this same file).
      const { onSceneJobSettled } = await import("@/lib/video-projects");
      await onSceneJobSettled(next.projectId).catch(() => undefined);
    }
  }

  processing = false;
}
