// Model files IGOR's ComfyUI workflows load, grouped by feature. Shared by
// the server-side presence check and the setup guide. Folder names are
// ComfyUI's own model folder keys (models/<folder>/<file>).

export type RequiredModel = { folder: string; file: string };

export type ModelGroup = {
  id: "image" | "image-hq" | "video";
  title: string;
  description: string;
  optional?: boolean;
  /** Where to get the files; see the guide for how. */
  source: { label: string; url: string }[];
  models: RequiredModel[];
};

export const MODEL_GROUPS: ModelGroup[] = [
  {
    id: "image",
    title: "Görsel: FLUX schnell",
    description: "Oluştur ve Karşılaştır sayfasındaki yerel model. Tek dosya, yaklaşık 17 GB.",
    source: [{ label: "Comfy-Org/flux1-schnell", url: "https://huggingface.co/Comfy-Org/flux1-schnell" }],
    models: [{ folder: "checkpoints", file: "flux1-schnell-fp8.safetensors" }],
  },
  {
    id: "image-hq",
    title: "Görsel: FLUX dev (kaliteli)",
    description: "Daha yavaş ama daha iyi sonuç. Lisansı kabul ederek indirilir. 32 GB RAM önerilir.",
    optional: true,
    source: [
      { label: "black-forest-labs/FLUX.1-dev", url: "https://huggingface.co/black-forest-labs/FLUX.1-dev" },
      { label: "comfyanonymous/flux_text_encoders", url: "https://huggingface.co/comfyanonymous/flux_text_encoders" },
    ],
    models: [
      { folder: "diffusion_models", file: "flux1-dev.safetensors" },
      { folder: "text_encoders", file: "t5xxl_fp16.safetensors" },
      { folder: "text_encoders", file: "clip_l.safetensors" },
      { folder: "vae", file: "ae.safetensors" },
    ],
  },
  {
    id: "video",
    title: "Video: LTX-2.3",
    description:
      "Video sayfası için. En kolay yol: ComfyUI'de Şablonlar menüsünden LTX-2.3 videosunu açmak, ComfyUI eksik dosyaları kendisi indirmeyi teklif eder.",
    optional: true,
    source: [{ label: "Lightricks (Hugging Face)", url: "https://huggingface.co/Lightricks" }],
    models: [
      { folder: "checkpoints", file: "ltx-2.3-22b-distilled-fp8.safetensors" },
      { folder: "loras", file: "ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors" },
      { folder: "latent_upscale_models", file: "ltx-2.3-spatial-upscaler-x2-1.1.safetensors" },
      { folder: "text_encoders", file: "gemma_3_12B_it_fp4_mixed.safetensors" },
      { folder: "loras", file: "gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors" },
    ],
  },
];

/** ComfyUI treats these legacy folders as aliases of the newer names. */
export const FOLDER_ALIASES: Record<string, string[]> = {
  diffusion_models: ["diffusion_models", "unet"],
  text_encoders: ["text_encoders", "clip"],
  latent_upscale_models: ["latent_upscale_models", "upscale_models"],
};
