import { runGeminiGeneration } from "@/lib/gemini-server";

export async function POST(request: Request) {
  const { prompt, ratio, referenceImageDataUrl } = await request.json();
  if (!prompt) {
    return Response.json({ error: "prompt gerekli" }, { status: 400 });
  }

  try {
    const result = await runGeminiGeneration({ prompt, ratio, referenceImageDataUrl });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
