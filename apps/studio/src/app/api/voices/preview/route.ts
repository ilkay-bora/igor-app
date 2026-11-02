import { getOrCreateVoicePreview } from "@/lib/tts-server";

export async function GET(request: Request) {
  const voice = new URL(request.url).searchParams.get("voice");
  if (!voice) {
    return Response.json({ error: "voice gerekli" }, { status: 400 });
  }

  try {
    const url = await getOrCreateVoicePreview(voice);
    return Response.json({ url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
