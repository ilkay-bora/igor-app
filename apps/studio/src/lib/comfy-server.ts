import { comfyUrl } from "./settings";
import { ensureComfyRunning } from "./comfy-launcher";
import { trackActivity } from "./activity";
import { uploadImageToComfy } from "./comfy-upload";
import { tServer } from "@/lib/i18n-server";


type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

// FLUX dev ships as separate UNET/CLIP/VAE files (no all-in-one checkpoint),
// unlike schnell-fp8's bundled checkpoint — needs its own loader graph plus
// FluxGuidance (dev is guidance-distilled, schnell is step-distilled).
const FLUX_DEV_CHECKPOINT = "flux1-dev.safetensors";
// Full fp16 t5xxl, not the fp8 one — measurably better quality (prompt
// adherence/fine detail) and the 4060's slower cold-load is an acceptable
// tradeoff since output quality matters more than generation time here.
const FLUX_DEV_CLIP_T5 = "t5xxl_fp16.safetensors";
const FLUX_DEV_CLIP_L = "clip_l.safetensors";
const FLUX_DEV_VAE = "ae.safetensors";
const FLUX_DEV_GUIDANCE = 3.5;

// Default denoise for image-to-image (character-reference) conditioning —
// low enough to keep the reference's design/colors/composition, high enough
// to let the sampler actually respond to a new scene-specific prompt. A
// first-pass value like the video graph's LoRA/strength constants — expect
// to tune by eye once real output is seen.
const DEFAULT_REFERENCE_DENOISE = 0.45;

function buildWorkflow(params: {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
  checkpoint: string;
  referenceImageFilename?: string;
  denoise?: number;
}): Workflow {
  const { prompt, width, height, steps, seed, checkpoint, referenceImageFilename, denoise } = params;

  // When a reference image is supplied, swap the empty-latent start for a
  // VAE-encoded version of that image and drop denoise below 1 — this is
  // what actually conditions the new generation on the reference's
  // character/style instead of generating from scratch each time.
  const refNodes: Workflow = referenceImageFilename
    ? {
        refimg: { class_type: "LoadImage", inputs: { image: referenceImageFilename } },
        refscale: {
          class_type: "ImageScale",
          inputs: {
            image: ["refimg", 0],
            width,
            height,
            upscale_method: "lanczos",
            crop: "disabled",
          },
        },
      }
    : {};
  const effectiveDenoise = referenceImageFilename ? (denoise ?? DEFAULT_REFERENCE_DENOISE) : 1;

  if (checkpoint === FLUX_DEV_CHECKPOINT) {
    return {
      "1": { class_type: "UNETLoader", inputs: { unet_name: checkpoint, weight_dtype: "default" } },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: { clip_name1: FLUX_DEV_CLIP_T5, clip_name2: FLUX_DEV_CLIP_L, type: "flux" },
      },
      "3": { class_type: "VAELoader", inputs: { vae_name: FLUX_DEV_VAE } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
      "5": { class_type: "FluxGuidance", inputs: { conditioning: ["4", 0], guidance: FLUX_DEV_GUIDANCE } },
      "6": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      "7": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
      ...refNodes,
      ...(referenceImageFilename
        ? { refencode: { class_type: "VAEEncode", inputs: { pixels: ["refscale", 0], vae: ["3", 0] } } }
        : {}),
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["1", 0],
          positive: ["5", 0],
          negative: ["6", 0],
          latent_image: referenceImageFilename ? ["refencode", 0] : ["7", 0],
          seed,
          steps,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: effectiveDenoise,
        },
      },
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      save: { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "igor" } },
    };
  }

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["2", 0] } },
    "4": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
    ...refNodes,
    ...(referenceImageFilename
      ? { refencode: { class_type: "VAEEncode", inputs: { pixels: ["refscale", 0], vae: ["1", 2] } } }
      : {}),
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: referenceImageFilename ? ["refencode", 0] : ["4", 0],
        seed,
        steps,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: effectiveDenoise,
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    save: { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "igor" } },
  };
}

export function runComfyGeneration(params: Parameters<typeof generate>[0]): ReturnType<typeof generate> {
  return trackActivity(() => generate(params));
}

async function generate(params: {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  checkpoint: string;
  referenceImageBuffer?: Buffer;
  denoise?: number;
  seed?: number;
}): Promise<{ imageUrl: string; ms: number }> {
  await ensureComfyRunning();

  const { checkpoint } = params;
  const clientId = crypto.randomUUID();

  let referenceImageFilename: string | undefined;
  if (params.referenceImageBuffer) {
    referenceImageFilename = await uploadImageToComfy(
      params.referenceImageBuffer,
      `igor_ref_${clientId}.png`
    );
  }

  const workflow = buildWorkflow({
    ...params,
    referenceImageFilename,
    seed: params.seed ?? Math.floor(Math.random() * 1e9),
  });

  let queueRes: Response;
  try {
    queueRes = await fetch(`${comfyUrl()}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
  } catch {
    throw new Error(tServer("ComfyUI'a bağlanılamadı. Yerel sunucu çalışıyor mu? ({v1})", { v1: comfyUrl() }));
  }

  const queueData = await queueRes.json();
  if (!queueRes.ok) {
    throw new Error(queueData.error?.message || JSON.stringify(queueData));
  }

  const promptId = queueData.prompt_id;
  const start = Date.now();

  // Full fp16 FLUX dev (unet+t5xxl, ~31GB, doesn't fit the 4060's 8GB VRAM)
  // measured at ~410s end-to-end for a 28-step image — chosen deliberately
  // over fp8 for quality, so the timeout has to cover it with real margin.
  const timeoutMs = checkpoint === FLUX_DEV_CHECKPOINT ? 600000 : 120000;
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    const histRes = await fetch(`${comfyUrl()}/history/${promptId}`);
    const hist = await histRes.json();
    const entry = hist[promptId];

    if (entry?.status?.status_str === "error") {
      throw new Error(tServer("ComfyUI hatası: {v1}", { v1: JSON.stringify(entry.status.messages ?? entry.status) }));
    }

    if (entry?.status?.completed) {
      const image = entry.outputs?.save?.images?.[0];
      if (!image) throw new Error(tServer("Görsel üretilemedi (çıktı boş)"));

      const viewParams = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
      });
      const imgRes = await fetch(`${comfyUrl()}/view?${viewParams.toString()}`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/png";
      return {
        imageUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
        ms: Date.now() - start,
      };
    }
  }

  throw new Error(tServer("ComfyUI zaman aşımı ({v1}s)", { v1: timeoutMs / 1000 }));
}
