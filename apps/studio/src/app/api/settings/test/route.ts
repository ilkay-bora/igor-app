import { getSetting } from "@/lib/settings";

// Checks a Gemini key without spending quota: listing models is a free,
// read-only call.
export async function POST(request: Request) {
  const { key } = (await request.json()) as { key?: string };
  const apiKey = key?.trim() || getSetting("geminiApiKey");
  if (!apiKey) return Response.json({ ok: false, message: "Anahtar girilmemiş." });
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return Response.json({ ok: true, message: "Anahtar çalışıyor." });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return Response.json({ ok: false, message: "Anahtar geçersiz görünüyor." });
    }
    return Response.json({ ok: false, message: `Doğrulanamadı (HTTP ${res.status}).` });
  } catch {
    return Response.json({ ok: false, message: "Google'a ulaşılamadı. İnternet bağlantını kontrol et." });
  }
}
