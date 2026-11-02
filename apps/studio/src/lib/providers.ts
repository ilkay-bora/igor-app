import type { ImageCrop, MotionType } from "@/lib/editor-motion";
// Free-form tags group images and voice clips however the user likes
// (per project, per social account, per client). Stored as plain strings.
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 40);
}

/** Unique, sorted tags present on a list of items, for filter chips/suggestions. */
export function collectTags(items: { tag?: string }[]): string[] {
  return [...new Set(items.map((i) => i.tag).filter((t): t is string => !!t))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export type Ratio = "1:1" | "16:9" | "9:16" | "4:3";

export const RATIOS: { value: Ratio; label: string }[] = [
  { value: "1:1", label: "1:1 (kare)" },
  { value: "16:9", label: "16:9 (yatay)" },
  { value: "9:16", label: "9:16 (dikey)" },
  { value: "4:3", label: "4:3" },
];

export const RATIO_DIMENSIONS: Record<Ratio, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1024, 768],
};

// Some SDKs reject with a plain object instead of an
// Error, which stringifies to the useless "[object Object]". Pull a real
// message out of whatever shape shows up.
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    const nested = obj.error;
    if (nested && typeof nested === "object") {
      const nestedMessage = (nested as Record<string, unknown>).message;
      if (typeof nestedMessage === "string") return nestedMessage;
    }
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    return withRetry(fn, retries - 1);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generatePollinationsImage(prompt: string, ratio: Ratio): Promise<string> {
  return withRetry(async () => {
    const [w, h] = RATIO_DIMENSIONS[ratio];
    const params = new URLSearchParams({
      prompt,
      width: String(w),
      height: String(h),
      seed: String(Date.now()),
    });

    const res = await fetch(`/api/pollinations?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Pollinations hatası (${res.status})`);
    }
    return blobToDataUrl(await res.blob());
  });
}

export async function generateComfyImage(params: {
  prompt: string;
  ratio: Ratio;
  checkpoint: string;
  steps: number;
  seed?: number;
}): Promise<{ url: string; ms: number }> {
  return withRetry(async () => {
    const [w, h] = RATIO_DIMENSIONS[params.ratio];
    const res = await fetch("/api/comfy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: params.prompt,
        width: w,
        height: h,
        steps: params.steps,
        checkpoint: params.checkpoint,
        seed: params.seed,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `ComfyUI hatası (${res.status})`);
    return { url: data.imageUrl as string, ms: data.ms as number };
  }, 0); // local generation failures are usually config errors, not transient — don't retry
}

function resolutionToRatio(width: number, height: number): Ratio {
  if (width === height) return "1:1";
  return width > height ? "16:9" : "9:16";
}

// Masal/storybook mode character-reference generation — one-off, no
// image-to-image yet (there's no prior reference to condition on). Routes to
// whichever provider will also generate the per-scene images later, so both
// calls go through the same model.
export async function generateStorybookReference(params: {
  prompt: string;
  width: number;
  height: number;
  provider: "gemini" | "comfy-flux-schnell" | "comfy-flux-dev";
  steps?: number;
  seed?: number;
}): Promise<{ url: string; ms?: number }> {
  if (params.provider === "gemini") {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: params.prompt,
        ratio: resolutionToRatio(params.width, params.height),
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Gemini hatası (${res.status})`);
    return { url: data.imageUrl as string };
  }

  const checkpoint = MODELS.find((m) => m.id === params.provider)?.checkpoint ?? params.provider;
  const res = await fetch("/api/comfy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: params.prompt,
      width: params.width,
      height: params.height,
      steps: params.steps ?? 8,
      checkpoint,
      seed: params.seed,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `ComfyUI hatası (${res.status})`);
  return { url: data.imageUrl as string, ms: data.ms as number };
}

export async function generateGeminiImage(prompt: string, ratio: Ratio) {
  return withRetry(async () => {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ratio }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Gemini hatası (${res.status})`);
    return data.imageUrl as string;
  });
}

export type SavedGeneration = {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: Ratio;
  url: string;
  createdAt: string;
  tag?: string;
};

export async function persistImage(params: {
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: Ratio;
  dataUrl?: string;
  sourceUrl?: string;
  tag?: string;
}): Promise<SavedGeneration> {
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Görsel kaydedilemedi");
  return data as SavedGeneration;
}

export async function deleteGeneration(id: string): Promise<void> {
  const res = await fetch(`/api/generations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Görsel silinemedi");
  }
}

export type ErrorEntry = {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: Ratio;
  message: string;
  createdAt: string;
};

export function logError(entry: {
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: Ratio;
  message: string;
}) {
  fetch("/api/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch((err) => console.error("Hata loglanamadı:", err));
}

export async function fetchErrors(): Promise<ErrorEntry[]> {
  const res = await fetch("/api/errors");
  if (!res.ok) return [];
  return res.json();
}

export async function clearErrors(): Promise<void> {
  await fetch("/api/errors", { method: "DELETE" });
}

export type PromptEntry = { id: string; text: string; createdAt: string };

export function logPrompt(prompt: string) {
  fetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  }).catch((err) => console.error("Prompt kaydedilemedi:", err));
}

export async function fetchRecentPrompts(): Promise<PromptEntry[]> {
  const res = await fetch("/api/prompts");
  if (!res.ok) return [];
  return res.json();
}

export type ModelKind = "gemini" | "pollinations" | "comfy";

export type ModelOption = {
  id: string;
  label: string;
  badge: string;
  kind: ModelKind;
  checkpoint?: string;
  steps?: number;
};

export const MODELS: ModelOption[] = [
  { id: "gemini", label: "Gemini — Nano Banana", badge: "API key gerekli", kind: "gemini" },
  {
    id: "comfy-flux-schnell",
    label: "ComfyUI (Yerel) — FLUX schnell",
    badge: "Yerel, limitsiz",
    kind: "comfy",
    checkpoint: "flux1-schnell-fp8.safetensors",
    steps: 4,
  },
  {
    id: "comfy-flux-dev",
    label: "ComfyUI (Yerel) — FLUX dev",
    badge: "Yerel, limitsiz, daha yavaş/kaliteli",
    kind: "comfy",
    checkpoint: "flux1-dev.safetensors",
    steps: 28,
  },
  { id: "pollinations", label: "Pollinations.ai", badge: "API key gerekli", kind: "pollinations" },
];

export const PRESET_PROMPTS: string[] = [
  "A candid photo of a couple laughing together at golden hour, warm light, photorealistic, shallow depth of field",
  "Realistic portrait of a person smiling naturally, soft studio lighting, shallow depth of field",
  "Modern minimalist product photo on a plain white background, soft studio lighting",
  "Cozy coffee shop poster, warm tones, minimalist typography",
  "Top-down photo of a restaurant food spread on a wooden table, natural light",
  "Clean vector logo design, flat colors, modern startup style",
];

// Hyper-realistic prompts make current AI-video artifacts (faces, texture) far
// more obvious. Stylized/animated looks read as intentional rather than "fake",
// so presets lean that way by default.
export const VIDEO_PRESET_PROMPTS: string[] = [
  "A hand-painted ink illustration of a cat walking slowly across a sunlit windowsill, gentle camera pan, visible brush strokes, painterly",
  "A stop-motion claymation cup of coffee with steam rising, slow push-in shot, visible clay texture, cozy handcrafted look",
  "Ocean waves rolling onto a sandy beach at sunset, wide cinematic shot, painterly color grading",
  "A couple walking hand in hand down a city street at night, neon lights reflecting on wet pavement, anime style",
  "Autumn leaves falling in a forest, soft breeze, warm golden light, slow motion, watercolor illustration style",
  "A futuristic city skyline at night, camera slowly flying forward, neon glow, 3D animated style",
];

export type VideoStyle = { id: string; label: string; suffix: string };

export const VIDEO_STYLES: VideoStyle[] = [
  { id: "none", label: "Yok", suffix: "" },
  { id: "claymation", label: "Kil animasyon", suffix: "stop-motion claymation style, visible clay texture and fingerprints, whimsical handcrafted look" },
  { id: "illustration", label: "Boyalı illüstrasyon", suffix: "hand-painted ink wash illustration, visible brush strokes, painterly texture" },
  { id: "anime", label: "Anime", suffix: "anime style, vibrant colors, dynamic motion, cel shading" },
  { id: "pixar3d", label: "3D animasyon", suffix: "3D animated style, stylized rendering, soft global illumination, Pixar-like character design" },
  { id: "cinematic", label: "Sinematik", suffix: "cinematic lighting, dramatic camera movement, film grain, shallow depth of field" },
  { id: "vintage", label: "Vintage film", suffix: "vintage film look, grainy texture, warm faded tones, retro" },
  {
    id: "storybook",
    label: "Masal Kitabı (az hareket)",
    // Deliberately avoids the literal words "storybook"/"picture-book"/"held
    // illustration" in this VIDEO suffix: in testing, LTX-2.3 render an actual picture-book prop into the scene when
    // those words were present, even though the same wording was harmless in
    // the still-image STORYBOOK_IMAGE_STYLE_SUFFIX below. "Children's
    // illustration style" gets the same look without the literal object.
    suffix:
      "gentle watercolor and gouache children's illustration style, soft painterly texture, static locked camera, no camera movement, character stays mostly still with only gentle subtle motion, no particle effects, no sparkles",
  },
];

// Children's-storybook still-image style, for the character-consistency
// reference and every per-scene image generated against it. Front-loaded
// onto the prompt (not appended) since earlier tokens get more weight, and explicitly rules out the
// comic-panel/speech-bubble output real scene scripts triggered when their
// full narrative text was sent to the image model as-is.
// The "no sparkles/light dots/bokeh" terms matter: image models tend to add
// small floating dots on their own, and img2video conditioning then animates
// them into unwanted particle effects.
export const STORYBOOK_IMAGE_STYLE_SUFFIX =
  "flat vector illustration, modern flat design for a children's book, bold simple shapes, " +
  "limited warm color palette, clean crisp lines, no gradients, simple clean background, " +
  "single character, one continuous illustration, no text, no letters, " +
  "no words, no speech bubbles, no dialogue, no comic panels, no captions, no sparkles, no glitter, " +
  "no floating light dots, no bokeh, no magic dust, no particle effects";

export function buildStorybookImagePrompt(characterDescription: string, sceneVisual: string): string {
  const scene = sceneVisual.trim() || characterDescription;
  return `${STORYBOOK_IMAGE_STYLE_SUFFIX}, ${characterDescription.trim()}, ${scene}`;
}

export const VIDEO_RESOLUTIONS = [
  { value: "1280x720", label: "1280x720 (yatay)" },
  { value: "720x1280", label: "720x1280 (dikey)" },
  { value: "1024x1024", label: "1024x1024 (kare)" },
];

export const VIDEO_DURATIONS = [3, 5, 8];

// Steps for the local FLUX schnell start-image generation (video's only image
// model right now — FLUX schnell).
// Higher = better detail/less mushiness, slower. Video page defaults to 8
// (previously hardcoded to 4, which was too rough for a lot of prompts).
export const START_IMAGE_STEP_OPTIONS = [
  { value: 4, label: "Hızlı (4 adım)" },
  { value: 8, label: "Dengeli (8 adım)" },
  { value: 12, label: "Kaliteli (12 adım)" },
];

export type VideoGenParams = {
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  useStartImage?: boolean;
  startImageDataUrl?: string;
  startImageSteps?: number;
  startImageProvider?: string;
  generateAudio?: boolean;
  motionLevel?: "normal" | "dusuk";
  videoSeed?: number;
};

export async function enqueueVideoJob(params: { prompt: string } & VideoGenParams) {
  const res = await fetch("/api/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Video kuyruğa eklenemedi");
  }
  return res.json();
}

// Every model runs server-side, so the video start-image step can use all of them.
export const SERVER_IMAGE_MODELS: ModelOption[] = MODELS;

export type VideoSceneInput = {
  prompt: string;
  // Masal mode: a short visual-only description used as the scene's image
  // prompt (via buildStorybookImagePrompt) instead of the full narrative
  // `prompt` text above, which is often full of dialogue/narration that made
  // the image model draw a comic panel with speech bubbles instead of a
  // single storybook illustration.
  imagePrompt?: string;
  durationSeconds: number;
  useStartImage?: boolean;
  startImageDataUrl?: string;
  startImageProvider?: string;
  startImageSteps?: number;
  generateAudio?: boolean;
};

export type VideoProject = {
  id: string;
  sceneCount: number;
  sceneJobIds: string[];
  status: "running" | "done" | "error";
  finalUrl?: string;
  error?: string;
  createdAt: string;
};

export async function enqueueVideoProject(params: {
  width: number;
  height: number;
  fps: number;
  scenes: VideoSceneInput[];
  referenceImageDataUrl?: string;
  referenceProvider?: string;
  referenceDenoise?: number;
  seed?: number;
  videoSeed?: number;
  motionLevel?: "normal" | "dusuk";
}): Promise<VideoProject> {
  const res = await fetch("/api/video-projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Proje kuyruğa eklenemedi");
  return data;
}

export async function fetchVideoProjects(): Promise<VideoProject[]> {
  const res = await fetch("/api/video-projects");
  if (!res.ok) return [];
  return res.json();
}

export async function deleteVideoProject(id: string): Promise<void> {
  await fetch(`/api/video-projects/${id}`, { method: "DELETE" });
}

// --- Editor (clip trim/reorder/transitions/music/text — "CapCut lite") ---

export type TransitionType =
  | "cut"
  | "fade"
  | "fadeblack"
  | "dissolve"
  | "slideleft"
  | "slideright"
  | "wipeleft"
  | "wiperight"
  | "circleopen"
  | "radial";

export const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "cut", label: "Kesme" },
  { value: "fade", label: "Yumuşak geçiş" },
  { value: "fadeblack", label: "Siyaha geçiş" },
  { value: "dissolve", label: "Erime" },
  { value: "slideleft", label: "Kaydır (sol)" },
  { value: "slideright", label: "Kaydır (sağ)" },
  { value: "wipeleft", label: "Silme (sol)" },
  { value: "wiperight", label: "Silme (sağ)" },
  { value: "circleopen", label: "Daire açılma" },
  { value: "radial", label: "Radyal" },
];

export type EditorClipInput = {
  sourcePath: string;
  trimStart: number;
  trimEnd: number;
  transitionAfter: TransitionType;
  muteOriginal?: boolean;
  volume?: number;
};

export type EditorOverlayInput = {
  text: string;
  startTime: number;
  endTime: number;
  cx: number;
  cy: number;
  motion?: MotionType;
  fontSize?: number;
  color?: string;
};

export type EditorAudioLayerInput = {
  src: string;
  filename?: string;
  start: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  loop?: boolean;
};

export type EditorStripInput = {
  text: string;
  startTime: number;
  endTime: number;
  yPct: number;
};

export type EditorImageLayerInput = {
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
  audioLayers?: EditorAudioLayerInput[];
  strips?: EditorStripInput[];
  imageLayers?: EditorImageLayerInput[];
  status: "queued" | "running" | "done" | "error";
  finalUrl?: string;
  error?: string;
  createdAt: string;
};

export async function enqueueEditorProject(params: {
  clips: EditorClipInput[];
  width: number;
  height: number;
  fps: number;
  overlays: EditorOverlayInput[];
  audioLayers: EditorAudioLayerInput[];
  strips: EditorStripInput[];
  imageLayers: EditorImageLayerInput[];
}): Promise<EditorProject> {
  const res = await fetch("/api/editor-projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Düzenleme kuyruğa eklenemedi");
  return data;
}

export async function fetchEditorProjects(): Promise<EditorProject[]> {
  const res = await fetch("/api/editor-projects");
  if (!res.ok) return [];
  return res.json();
}

export async function deleteEditorProject(id: string): Promise<void> {
  await fetch(`/api/editor-projects/${id}`, { method: "DELETE" });
}

// Gemini TTS's 30 prebuilt voices (Aug 2026), with Google's own official
// gender + one-word tone characteristic for each (ai.google.dev voice
// options table + cloud.google.com gender column) — tone translated to
// Turkish for display.
export const TTS_VOICE_INFO: { name: string; gender: "kadın" | "erkek"; tone: string }[] = [
  { name: "Zephyr", gender: "kadın", tone: "Parlak" },
  { name: "Puck", gender: "erkek", tone: "Neşeli" },
  { name: "Charon", gender: "erkek", tone: "Bilgilendirici" },
  { name: "Kore", gender: "kadın", tone: "Kararlı" },
  { name: "Fenrir", gender: "erkek", tone: "Coşkulu" },
  { name: "Leda", gender: "kadın", tone: "Genç" },
  { name: "Orus", gender: "erkek", tone: "Kararlı" },
  { name: "Aoede", gender: "kadın", tone: "Hafif" },
  { name: "Callirrhoe", gender: "kadın", tone: "Uyumlu" },
  { name: "Autonoe", gender: "kadın", tone: "Parlak" },
  { name: "Enceladus", gender: "erkek", tone: "Nefesli" },
  { name: "Iapetus", gender: "erkek", tone: "Net" },
  { name: "Umbriel", gender: "erkek", tone: "Uyumlu" },
  { name: "Algieba", gender: "erkek", tone: "Akıcı" },
  { name: "Despina", gender: "kadın", tone: "Akıcı" },
  { name: "Erinome", gender: "kadın", tone: "Net" },
  { name: "Algenib", gender: "erkek", tone: "Boğuk" },
  { name: "Rasalgethi", gender: "erkek", tone: "Bilgilendirici" },
  { name: "Laomedeia", gender: "kadın", tone: "Neşeli" },
  { name: "Achernar", gender: "kadın", tone: "Yumuşak" },
  { name: "Alnilam", gender: "erkek", tone: "Kararlı" },
  { name: "Schedar", gender: "erkek", tone: "Dengeli" },
  { name: "Gacrux", gender: "kadın", tone: "Olgun" },
  { name: "Pulcherrima", gender: "kadın", tone: "Girişken" },
  { name: "Achird", gender: "erkek", tone: "Dostane" },
  { name: "Zubenelgenubi", gender: "erkek", tone: "Gündelik" },
  { name: "Vindemiatrix", gender: "kadın", tone: "Nazik" },
  { name: "Sadachbia", gender: "erkek", tone: "Canlı" },
  { name: "Sadaltager", gender: "erkek", tone: "Bilgili" },
  { name: "Sulafat", gender: "kadın", tone: "Sıcak" },
];

export const TTS_VOICES = TTS_VOICE_INFO.map((v) => v.name);

// Quick-fill style instructions — Gemini TTS has no pitch/speed sliders,
// tone/pace/emotion are steered entirely through natural-language
// instructions bundled with the text (see handleGenerate in /voice).
export const VOICE_STYLE_PRESETS = [
  { id: "ciddi", label: "Ciddi", instruction: "Ciddi ve resmi bir tonda konuş" },
  { id: "nese", label: "Neşeli", instruction: "Neşeli ve enerjik bir tonda konuş" },
  { id: "sakin", label: "Sakin", instruction: "Yavaş ve sakin bir tonda konuş" },
  { id: "heyecan", label: "Heyecanlı", instruction: "Heyecanlı ve hızlı bir tonda konuş" },
  { id: "samimi", label: "Samimi", instruction: "Sıcak ve samimi bir tonda konuş" },
  { id: "dramatik", label: "Dramatik", instruction: "Dramatik ve vurgulu bir tonda konuş" },
  { id: "fisilti", label: "Fısıltı", instruction: "Fısıldayarak konuş" },
  { id: "resmi", label: "Resmi/Haber sunucusu", instruction: "Bir haber sunucusu gibi net ve resmi bir tonda konuş" },
];

export type VoiceClip = {
  id: string;
  text: string;
  voice: string;
  url: string;
  tag?: string;
  createdAt: string;
};

export async function generateVoiceClip(params: {
  text: string;
  voice: string;
  tag?: string;
}): Promise<VoiceClip> {
  const res = await fetch("/api/voices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ses üretilemedi");
  return data as VoiceClip;
}

export async function fetchVoiceClips(): Promise<VoiceClip[]> {
  const res = await fetch("/api/voices");
  if (!res.ok) return [];
  return res.json();
}

export async function deleteVoiceClip(id: string): Promise<void> {
  await fetch(`/api/voices/${id}`, { method: "DELETE" });
}

// Google's documented hard limit for a single Gemini TTS request.
export const TTS_MAX_BYTES = 4000;

export async function fetchVoicePreviewUrl(voice: string): Promise<string> {
  const res = await fetch(`/api/voices/preview?voice=${encodeURIComponent(voice)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ses örneği üretilemedi");
  return data.url as string;
}
