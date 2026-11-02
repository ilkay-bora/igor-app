import { runComfyGeneration } from "@/lib/comfy-server";
import { decodeImageDataUrl } from "@/lib/comfy-upload";

export async function POST(request: Request) {
  const {
    prompt,
    width = 1024,
    height = 1024,
    steps = 4,
    checkpoint,
    seed,
    referenceImageDataUrl,
    denoise,
  } = await request.json();

  if (!prompt || !checkpoint) {
    return Response.json({ error: "prompt ve checkpoint gerekli" }, { status: 400 });
  }

  const referenceImageBuffer = referenceImageDataUrl
    ? decodeImageDataUrl(referenceImageDataUrl).buffer
    : undefined;

  try {
    const result = await runComfyGeneration({
      prompt,
      width,
      height,
      steps,
      checkpoint,
      seed,
      referenceImageBuffer,
      denoise,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
