import { comfyUrl } from "./settings";
import { ensureComfyRunning } from "./comfy-launcher";
import { uploadImageToComfy, decodeImageDataUrl } from "./comfy-upload";
import { tServer } from "@/lib/i18n-server";

const POLL_TIMEOUT_MS = 20 * 60 * 1000; // videos take several minutes on 8GB VRAM

// Verified working LTX-2.3 text-to-video graph, captured from ComfyUI's own
// history after a real successful run through the official template UI
// (hand-building this graph was unreliable — audio+video joint latents,
// two-stage upsampling, and model-specific sigma schedules are easy to get
// subtly wrong). Only the marked node inputs are meant to be overridden per
// generation; everything else mirrors the template's verified defaults.
function buildWorkflow(params: {
  prompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  seed: number;
  startImageFilename?: string;
  generateAudio?: boolean;
  motionLevel?: "normal" | "dusuk";
}) {
  const {
    prompt,
    width,
    height,
    durationSeconds,
    fps,
    seed,
    startImageFilename,
    generateAudio = true,
    motionLevel = "normal",
  } = params;
  const useImage = !!startImageFilename;
  // "dusuk" (children's-storybook preset): dial the motion-boosting LoRA
  // down further and lock the base-stage image-conditioning strength to its
  // max, so clips stay close to a held illustration instead of animating
  // freely. Tuning history (each pass judged against real generated output,
  // not just reasoning):
  //   2026-09-03 pass 1: LoRA 0.12, strength 0.97, STG 1 — still visible motion.
  //   2026-09-03 pass 2: LoRA 0.06, strength 1, STG 1.6 — motion much lower,
  //     no sparkle artifacts (verified clean on a real 9-scene run).
  //   2026-09-03 pass 3: LoRA 0, STG 2 — motion now essentially frozen
  //     (exactly what was asked for), BUT pushing STG that high introduced a
  //     *new* artifact: literal 4-point star/sparkle shapes scattered over
  //     the frame that weren't there at STG 1.6. STG over-correction, not a
  //     LoRA side effect — reverted STG to 1.6, kept LoRA at 0.
  const dynamicLoraStrength = motionLevel === "dusuk" ? 0 : 0.3;
  const baseImgToVideoStrength = motionLevel === "dusuk" ? 1 : 0.85;
  // STG (267:271) is the only artifact/particle suppressor that actually
  // works at cfg=1 (the plain negative prompt below is inert there) — raise
  // its scale for "dusuk" to lean on it harder against the floating-debris/
  // particle look seen in testing, on top of the motion-strength changes above.
  // 1.6 is the proven-clean value; don't push past it without re-verifying —
  // see pass 3 note above.
  const stgScale = motionLevel === "dusuk" ? 1.6 : 1;

  return {
    "75": {
      inputs: {
        filename_prefix: "video/igor",
        format: "auto",
        "format.codec": "auto",
        codec: "auto",
        video: ["267:242", 0],
      },
      class_type: "SaveVideo",
    },
    "267:216": { inputs: { noise_seed: 42 }, class_type: "RandomNoise" },
    "267:237": { inputs: { noise_seed: seed }, class_type: "RandomNoise" },
    "267:229": {
      inputs: { video_latent: ["267:230", 0], audio_latent: ["267:217", 1] },
      class_type: "LTXVConcatAVLatent",
    },
    "267:221": {
      inputs: { ckpt_name: "ltx-2.3-22b-distilled-fp8.safetensors" },
      class_type: "LTXVAudioVAELoader",
    },
    "267:246": { inputs: { sampler_name: "euler" }, class_type: "KSamplerSelect" },
    "267:211": { inputs: { sigmas: "0.85, 0.7250, 0.4219, 0.0" }, class_type: "ManualSigmas" },
    "267:213": {
      inputs: { cfg: 1, model: ["267:271", 0], positive: ["267:212", 0], negative: ["267:212", 1] },
      class_type: "CFGGuider",
    },
    "267:215": {
      inputs: {
        noise: ["267:237", 0],
        guider: ["267:231", 0],
        sampler: ["267:209", 0],
        sigmas: ["267:252", 0],
        latent_image: ["267:222", 0],
      },
      class_type: "SamplerCustomAdvanced",
    },
    "267:212": {
      inputs: { positive: ["267:239", 0], negative: ["267:239", 1], latent: ["267:217", 0] },
      class_type: "LTXVCropGuides",
    },
    "267:232": {
      // Lowered from 0.5: this LoRA pushes the model toward more dynamic
      // motion, which was trading off against shape/anatomy consistency on
      // moving objects (limbs and object outlines warping mid-motion).
      inputs: {
        lora_name: "ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors",
        strength_model: dynamicLoraStrength,
        model: ["267:236", 0],
      },
      class_type: "LoraLoaderModelOnly",
    },
    "267:235": {
      inputs: { longer_edge: 1536, images: ["267:238", 0] },
      class_type: "ResizeImagesByLongerEdge",
    },
    "267:253": {
      inputs: { samples: ["267:217", 0], upscale_model: ["267:233", 0], vae: ["267:236", 2] },
      class_type: "LTXVLatentUpsampler",
    },
    "267:230": {
      inputs: {
        strength: 1,
        bypass: ["267:201", 0],
        vae: ["267:236", 2],
        image: ["267:248", 0],
        latent: ["267:253", 0],
      },
      class_type: "LTXVImgToVideoInplace",
    },
    "267:248": {
      inputs: { img_compression: 18, image: ["267:235", 0] },
      class_type: "LTXVPreprocess",
    },
    "267:238": {
      inputs: {
        resize_type: "scale dimensions",
        "resize_type.width": ["267:257", 0],
        "resize_type.height": ["267:258", 0],
        "resize_type.crop": "center",
        scale_method: "lanczos",
        input: ["267:325", 0],
      },
      class_type: "ResizeImageMaskNode",
    },
    "267:209": { inputs: { sampler_name: "euler" }, class_type: "KSamplerSelect" },
    "267:256": { inputs: { expression: "a/2", "values.a": ["267:257", 0] }, class_type: "ComfyMathExpression" },
    "267:259": { inputs: { expression: "a/2", "values.a": ["267:258", 0] }, class_type: "ComfyMathExpression" },
    "267:228": {
      inputs: { width: ["267:256", 1], height: ["267:259", 1], length: ["267:277", 1], batch_size: 1 },
      class_type: "EmptyLTXVLatentVideo",
    },
    "267:249": {
      // Raised from 0.7: at 0.7 the model had 30% freedom to drift from the
      // start image over the clip, which showed up as anime eyes/mouths
      // warping mid-motion (fine facial detail is the most sensitive to this).
      // Higher = stays closer to the reference image throughout, at the cost
      // of less motion.
      inputs: {
        strength: baseImgToVideoStrength,
        bypass: ["267:201", 0],
        vae: ["267:236", 2],
        image: ["267:248", 0],
        latent: ["267:228", 0],
      },
      class_type: "LTXVImgToVideoInplace",
    },
    "267:220": {
      inputs: { samples: ["267:218", 1], audio_vae: ["267:221", 0] },
      class_type: "LTXVAudioVAEDecode",
    },
    "267:261": { inputs: { expression: "a", "values.a": ["267:260", 0] }, class_type: "ComfyMathExpression" },
    "267:258": { inputs: { value: height }, class_type: "PrimitiveInt" },
    "267:260": { inputs: { value: fps }, class_type: "PrimitiveInt" },
    "267:225": { inputs: { value: durationSeconds }, class_type: "PrimitiveInt" },
    // true = bypass the image conditioning (pure text-to-video). When a start
    // image is supplied we flip this so LTXVImgToVideoInplace actually uses it —
    // starting from a real generated frame preserves stylized looks (anime,
    // illustration, etc.) far better than describing the style in text alone.
    "267:201": { inputs: { value: !useImage }, class_type: "PrimitiveBoolean" },
    "267:240": {
      inputs: { text: ["267:329", 0], clip: ["267:243", 0] },
      class_type: "CLIPTextEncode",
    },
    "267:239": {
      inputs: { frame_rate: ["267:261", 0], positive: ["267:240", 0], negative: ["267:247", 0] },
      class_type: "LTXVConditioning",
    },
    "267:214": {
      inputs: {
        frames_number: ["267:277", 1],
        frame_rate: ["267:261", 1],
        batch_size: 1,
        audio_vae: ["267:221", 0],
      },
      class_type: "LTXVEmptyLatentAudio",
    },
    "267:252": {
      inputs: { sigmas: "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0" },
      class_type: "ManualSigmas",
    },
    "267:217": { inputs: { av_latent: ["267:215", 0] }, class_type: "LTXVSeparateAVLatent" },
    "267:219": {
      inputs: {
        noise: ["267:216", 0],
        guider: ["267:213", 0],
        sampler: ["267:246", 0],
        sigmas: ["267:211", 0],
        latent_image: ["267:229", 0],
      },
      class_type: "SamplerCustomAdvanced",
    },
    "267:218": { inputs: { av_latent: ["267:219", 0] }, class_type: "LTXVSeparateAVLatent" },
    "267:242": {
      inputs: {
        fps: ["267:261", 0],
        bit_depth: "auto",
        color_space: "sRGB",
        images: ["267:251", 0],
        // Audio is still generated as part of the joint AV latent (LTX-2.3
        // samples video+audio together — there's no cheaper way to skip it),
        // but when the user doesn't want a soundtrack we just don't attach
        // the decoded audio to the final container, so SaveVideo writes a
        // silent clip instead.
        ...(generateAudio ? { audio: ["267:220", 0] } : {}),
      },
      class_type: "CreateVideo",
    },
    "267:233": {
      inputs: { model_name: "ltx-2.3-spatial-upscaler-x2-1.1.safetensors" },
      class_type: "LatentUpscaleModelLoader",
    },
    "267:257": { inputs: { value: width }, class_type: "PrimitiveInt" },
    "267:247": {
      // Template default negative said "cartoon, childish" — actively fights the
      // stylized/animated look we default to now, so dropped those two terms.
      // Added text/particle-explosion terms: LTX tends to hallucinate garbled
      // text/logos (esp. when prompts mention "poster") and to escalate any
      // "drifting particles" phrasing into a chaotic debris swarm by the end
      // of the clip — both observed directly in generated output.
      inputs: {
        text: "pc game, console game, video game, low quality, ugly, text, watermark, logo, letters, writing, subtitles, caption, particle explosion, confetti, debris swarm, flying objects, chaotic motion",
        clip: ["267:243", 0],
      },
      class_type: "CLIPTextEncode",
    },
    "267:231": {
      inputs: { cfg: 1, model: ["267:271", 0], positive: ["267:239", 0], negative: ["267:239", 1] },
      class_type: "CFGGuider",
    },
    // Negative-prompt terms below are inert at cfg=1 (standard CFG formula
    // collapses to pure positive conditioning when cfg=1) — plain CFGGuider
    // never actually applied our debris/text-artifact suppression terms.
    // STG perturbs self-attention in a chosen block and guides away from that,
    // which works independently of cfg and specifically targets spatial
    // detail / motion coherence — exactly the tail-of-clip debris pattern
    // observed in generated output. Feeds both CFGGuiders (267:213, 267:231).
    "267:271": {
      inputs: {
        model: ["267:232", 0],
        scale: stgScale,
        blocks: "29",
        start_percent: 0,
        end_percent: 1,
      },
      class_type: "LTXVSpatioTemporalGuidance",
    },
    "267:251": {
      inputs: {
        tile_size: 768,
        overlap: 64,
        temporal_size: 4096,
        temporal_overlap: 4,
        samples: ["267:218", 0],
        vae: ["267:236", 2],
      },
      class_type: "VAEDecodeTiled",
    },
    "267:236": {
      inputs: { ckpt_name: "ltx-2.3-22b-distilled-fp8.safetensors" },
      class_type: "CheckpointLoaderSimple",
    },
    "267:243": {
      inputs: {
        text_encoder: "gemma_3_12B_it_fp4_mixed.safetensors",
        ckpt_name: "ltx-2.3-22b-distilled-fp8.safetensors",
        device: "default",
      },
      class_type: "LTXAVTextEncoderLoader",
    },
    "267:266": { inputs: { value: prompt }, class_type: "PrimitiveStringMultiline" },
    "267:222": {
      inputs: { video_latent: ["267:249", 0], audio_latent: ["267:214", 0] },
      class_type: "LTXVConcatAVLatent",
    },
    "267:277": {
      inputs: { expression: "a * b + 1", "values.a": ["267:225", 0], "values.b": ["267:260", 0] },
      class_type: "ComfyMathExpression",
    },
    "267:325": useImage
      ? { inputs: { image: startImageFilename }, class_type: "LoadImage" }
      : { inputs: { width: 512, height: 512, batch_size: 1, color: 0 }, class_type: "EmptyImage" },
    "267:326": {
      inputs: {
        lora_name: "gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors",
        strength_model: 1,
        strength_clip: 1,
        model: ["267:232", 0],
        clip: ["267:243", 0],
      },
      class_type: "LoraLoader",
    },
    "267:327": {
      inputs: {
        prompt: ["267:266", 0],
        max_length: 2048,
        sampling_mode: "on",
        "sampling_mode.temperature": 0.7,
        "sampling_mode.top_k": 64,
        "sampling_mode.top_p": 0.95,
        "sampling_mode.min_p": 0.05,
        "sampling_mode.repetition_penalty": 1.05,
        "sampling_mode.seed": 0,
        "sampling_mode.presence_penalty": 0,
        thinking: false,
        use_default_template: true,
        clip: ["267:326", 1],
      },
      class_type: "TextGenerateLTX2Prompt",
    },
    "267:328": { inputs: { source: ["267:329", 0] }, class_type: "PreviewAny" },
    "267:329": {
      inputs: { switch: ["267:330", 0], on_false: ["267:266", 0], on_true: ["267:327", 0] },
      class_type: "ComfySwitchNode",
    },
    // "Prompt enhance" (267:327 TextGenerateLTX2Prompt) rewrites the prompt via
    // the Gemma text encoder before generation — its default template leans
    // toward photorealistic/cinematic phrasing regardless of the style we
    // actually asked for. Disabled so the raw prompt goes straight through.
    "267:330": { inputs: { value: false }, class_type: "PrimitiveBoolean" },
  };
}

export async function runLTXVideoGeneration(params: {
  prompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  startImageDataUrl?: string;
  generateAudio?: boolean;
  motionLevel?: "normal" | "dusuk";
  // Pinning this (masal mode) lets a "clean" (particle-free) roll be found
  // and reused across scenes/reruns instead of a fresh random gamble every
  // time — LTX's own motion/artifact behavior varies noticeably by seed even
  // with identical prompt/strength/STG settings.
  seed?: number;
}): Promise<{ videoBuffer: Buffer; ms: number }> {
  await ensureComfyRunning();

  const clientId = crypto.randomUUID();
  const seed = params.seed ?? Math.floor(Math.random() * 1e15);

  let startImageFilename: string | undefined;
  if (params.startImageDataUrl) {
    const { buffer, ext } = decodeImageDataUrl(params.startImageDataUrl);
    startImageFilename = await uploadImageToComfy(buffer, `igor_start_${clientId}.${ext}`);
  }

  const workflow = buildWorkflow({ ...params, seed, startImageFilename });

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

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 5000));
    const histRes = await fetch(`${comfyUrl()}/history/${promptId}`);
    const hist = await histRes.json();
    const entry = hist[promptId];

    if (entry?.status?.status_str === "error") {
      throw new Error(tServer("ComfyUI hatası: {v1}", { v1: JSON.stringify(entry.status.messages ?? entry.status) }));
    }

    if (entry?.status?.completed) {
      const video = entry.outputs?.["75"]?.images?.[0];
      if (!video) throw new Error(tServer("Video üretilemedi (çıktı boş)"));

      const viewParams = new URLSearchParams({
        filename: video.filename,
        subfolder: video.subfolder ?? "",
        type: video.type ?? "output",
      });
      const videoRes = await fetch(`${comfyUrl()}/view?${viewParams.toString()}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      return { videoBuffer, ms: Date.now() - start };
    }
  }

  throw new Error(tServer("ComfyUI zaman aşımı (20 dakika)"));
}
