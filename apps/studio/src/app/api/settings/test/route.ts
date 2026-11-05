import { getSetting } from "@/lib/settings";
import { tServer } from "@/lib/i18n-server";

// Checks a Gemini key without spending quota: listing models is a free,
// read-only call.
export async function POST(request: Request) {
  const { key } = (await request.json()) as { key?: string };
  const apiKey = key?.trim() || getSetting("geminiApiKey");
  if (!apiKey) return Response.json({ ok: false, message: tServer("Anahtar girilmemiş.") });
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return Response.json({ ok: true, message: tServer("Anahtar çalışıyor.") });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return Response.json({ ok: false, message: tServer("Anahtar geçersiz görünüyor.") });
    }
    return Response.json({ ok: false, message: tServer("Doğrulanamadı (HTTP {status}).", { status: res.status }) });
  } catch {
    return Response.json({ ok: false, message: tServer("Google'a ulaşılamadı. İnternet bağlantını kontrol et.") });
  }
}
