import { generateVoiceClip, getVoiceClips } from "@/lib/tts-server";
import { logErrorServer } from "@/lib/error-log-server";

export async function GET() {
  return Response.json(await getVoiceClips());
}

export async function POST(request: Request) {
  const { text, voice, tag } = await request.json();
  if (!text || typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Metin gerekli" }, { status: 400 });
  }
  if (!voice) {
    return Response.json({ error: "Ses seçimi gerekli" }, { status: 400 });
  }

  try {
    const clip = await generateVoiceClip({ text, voice, tag });
    return Response.json(clip);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logErrorServer({
      prompt: text,
      modelId: "gemini-tts",
      modelLabel: "Gemini (Seslendirme)",
      message,
    }).catch(() => undefined);
    return Response.json({ error: message }, { status: 502 });
  }
}
