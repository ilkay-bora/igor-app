import { runComfyGeneration } from "@/lib/comfy-server";
import { runGeminiGeneration } from "@/lib/gemini-server";
import { runPollinationsGeneration } from "@/lib/pollinations-server";
import { decodeImageDataUrl } from "@/lib/comfy-upload";

const START_IMAGE_CHECKPOINT = "flux1-schnell-fp8.safetensors";

function resolutionToRatio(width: number, height: number): string {
  if (width === height) return "1:1";
  return width > height ? "16:9" : "9:16";
}

// Video's start-image step runs server-side in the background job queue (no
// browser involved, keeps working after the user closes the tab), so only
// providers that work headlessly are usable here. Puter is excluded on
// purpose: its SDK opens a real puter.com sign-in popup on first use and
// only works from a live, logged-in browser tab (see providers.ts MODELS).
export async function generateStartImage(params: {
  provider: string;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  // Character-reference conditioning (masal/storybook mode) — Gemini
  // (nano-banana image editing) and the local ComfyUI FLUX path both support
  // this; Pollinations doesn't and ignores it.
  referenceImageDataUrl?: string;
  denoise?: number;
  seed?: number;
}): Promise<{ imageUrl: string }> {
  switch (params.provider) {
    case "gemini":
      return runGeminiGeneration({
        prompt: params.prompt,
        ratio: resolutionToRatio(params.width, params.height),
        referenceImageDataUrl: params.referenceImageDataUrl,
      });
    case "pollinations": {
      const { buffer, contentType } = await runPollinationsGeneration({
        prompt: params.prompt,
        width: params.width,
        height: params.height,
      });
      return { imageUrl: `data:${contentType};base64,${buffer.toString("base64")}` };
    }
    case "comfy-flux-schnell":
    default: {
      let referenceImageBuffer: Buffer | undefined;
      if (params.referenceImageDataUrl) {
        referenceImageBuffer = decodeImageDataUrl(params.referenceImageDataUrl).buffer;
      }
      return runComfyGeneration({
        prompt: params.prompt,
        width: params.width,
        height: params.height,
        steps: params.steps,
        checkpoint: START_IMAGE_CHECKPOINT,
        referenceImageBuffer,
        denoise: params.denoise,
        seed: params.seed,
      });
    }
  }
}
