import { runComfyGeneration } from "@/lib/comfy-server";
import { runGeminiGeneration } from "@/lib/gemini-server";
import { decodeImage, readGenerations, saveGeneration } from "@/lib/generations";
import { MODELS, RATIO_DIMENSIONS, type Ratio } from "@/lib/providers";

// One-call image generation for agents (MCP generate_image): generates,
// saves to the gallery and returns the gallery record, whose `url` can go
// straight into a project with add_clip. The create page keeps its own
// two-step flow (/api/comfy etc., then /api/save).

const MODEL_ALIASES: Record<string, string> = {
  "flux-schnell": "comfy-flux-schnell",
  "flux-dev": "comfy-flux-dev",
  gemini: "gemini",
};

export async function GET() {
  return Response.json(await readGenerations());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const ratio: Ratio = body.ratio ?? "16:9";
  const modelId = MODEL_ALIASES[body.model ?? "flux-schnell"];
  const model = MODELS.find((m) => m.id === modelId);

  if (!prompt) return Response.json({ error: "prompt gerekli" }, { status: 400 });
  if (!model) {
    return Response.json({ error: `model şunlardan biri olmalı: ${Object.keys(MODEL_ALIASES).join(", ")}` }, { status: 400 });
  }
  if (!(ratio in RATIO_DIMENSIONS)) {
    return Response.json({ error: `ratio şunlardan biri olmalı: ${Object.keys(RATIO_DIMENSIONS).join(", ")}` }, { status: 400 });
  }

  try {
    let imageUrl: string;
    if (model.kind === "comfy") {
      const [width, height] = RATIO_DIMENSIONS[ratio];
      const steps = Number.isInteger(body.steps) ? Math.min(60, Math.max(1, body.steps)) : (model.steps ?? 4);
      ({ imageUrl } = await runComfyGeneration({
        prompt,
        width,
        height,
        steps,
        checkpoint: model.checkpoint!,
        seed: Number.isInteger(body.seed) ? body.seed : undefined,
      }));
    } else {
      ({ imageUrl } = await runGeminiGeneration({ prompt, ratio }));
    }
    const decoded = decodeImage(imageUrl);
    if (!decoded) throw new Error("Model geçerli bir görsel döndürmedi");
    const record = await saveGeneration({
      prompt,
      ...decoded,
      modelId: model.id,
      modelLabel: model.label,
      ratio,
      tag: body.tag,
    });
    return Response.json(record);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
