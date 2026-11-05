import { getSetting } from "./settings";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { FFMPEG_PATH } from "@/lib/ffmpeg-path";
import { tServer } from "@/lib/i18n-server";

const MODEL = "gemini-3.1-flash-tts-preview";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// The 30 prebuilt Gemini TTS voices (Aug 2026) — just names for validation
// here; the gender/tone metadata for display lives in providers.ts
// (TTS_VOICE_INFO), sourced from Google's own voice options docs.
export const TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;

const VOICES_DIR = path.join(process.cwd(), "public", "voices");
const MANIFEST_PATH = path.join(process.cwd(), "data", "voices.json");

export type VoiceClip = {
  id: string;
  text: string;
  voice: string;
  url: string;
  tag?: string;
  createdAt: string;
};

async function readManifest(): Promise<VoiceClip[]> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function writeManifest(clips: VoiceClip[]) {
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(clips, null, 2));
}

export async function getVoiceClips(): Promise<VoiceClip[]> {
  return readManifest();
}

export async function deleteVoiceClip(id: string): Promise<void> {
  const clips = await readManifest();
  const clip = clips.find((c) => c.id === id);
  if (clip) {
    await fs.unlink(path.join(process.cwd(), "public", clip.url.replace(/^\//, ""))).catch(() => undefined);
  }
  await writeManifest(clips.filter((c) => c.id !== id));
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(tServer("ffmpeg hatası (kod {code}): {v1}", { code, v1: stderr.slice(-500) })));
    });
    proc.on("error", reject);
  });
}

function assertValidVoice(voice: string) {
  if (!(TTS_VOICES as readonly string[]).includes(voice)) {
    throw new Error(tServer("Geçersiz ses"));
  }
}

// Google's documented hard limit for a single Gemini TTS request.
export const TTS_MAX_BYTES = 4000;

type InlineData = { mimeType?: string; mime_type?: string; data: string };
type GeminiPart = { text?: string; inlineData?: InlineData; inline_data?: InlineData };

// Fetches one generateContent TTS call and returns the raw parts, or throws
// with as much diagnostic detail as the response actually carries.
async function callGeminiTts(text: string, voice: string, apiKey: string): Promise<GeminiPart[]> {
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || tServer("Gemini TTS hatası ({status})", { status: res.status }));
  }

  const candidate = data?.candidates?.[0];
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData || p.inline_data);
  if (!audioPart) {
    // No audio came back — surface whatever Google's response actually said
    // instead of a bare "no audio", so this is debuggable without guessing.
    const blockReason = data?.promptFeedback?.blockReason;
    const finishReason = candidate?.finishReason;
    const textPart = parts.find((p) => typeof p.text === "string")?.text;
    const bytes = Buffer.byteLength(text, "utf8");
    const reasons: string[] = [];
    if (blockReason) reasons.push(`engellendi (${blockReason})`);
    if (finishReason && finishReason !== "STOP") reasons.push(`finishReason=${finishReason}`);
    if (textPart) reasons.push(tServer("ses yerine metin döndü: \"{v1}\"", { v1: textPart.slice(0, 200) }));
    if (bytes > TTS_MAX_BYTES) {
      reasons.push(
        tServer("metin {bytes} bayt — Gemini TTS'in tek istekteki {TTS_MAX_BYTES} bayt sınırını aşıyor, muhtemel sebep bu", { bytes, TTS_MAX_BYTES })
      );
    }
    if (reasons.length === 0) {
      reasons.push(tServer("Google rastgele küçük bir yüzdede sesi bulunmayan bir yanıt döndürebiliyor, tekrar denemek genelde çözer"));
    }
    throw new Error(tServer("Gemini ses döndürmedi: {v1}", { v1: reasons.join("; ") }));
  }
  return parts;
}

// Calls Gemini TTS and writes the result as an mp3 at `outPath`. Shared by
// real clip generation and the cached voice-preview endpoint. Retries once
// on failure (Google's own docs note the API occasionally returns a
// text-only response instead of audio for a small fraction of requests).
async function synthesizeToFile(text: string, voice: string, outPath: string): Promise<void> {
  const apiKey = getSetting("geminiApiKey");
  if (!apiKey) {
    throw new Error(tServer("Gemini API anahtarı girilmemiş. Ayarlar sayfasından ekleyebilirsin."));
  }
  if (!text.trim()) {
    throw new Error("Metin gerekli");
  }
  assertValidVoice(voice);

  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > TTS_MAX_BYTES) {
    throw new Error(
      tServer("Metin çok uzun ({bytes} bayt). Gemini TTS tek istekte en fazla {TTS_MAX_BYTES} bayt (~700-800 kelime) kabul ediyor. Metni kısalt ya da birden fazla parçaya bölüp ayrı ayrı üret.", { bytes, TTS_MAX_BYTES })
    );
  }

  let parts: GeminiPart[];
  try {
    parts = await callGeminiTts(text, voice, apiKey);
  } catch (err) {
    // One retry for the known-random text-instead-of-audio glitch.
    parts = await callGeminiTts(text, voice, apiKey).catch(() => {
      throw err;
    });
  }

  const audioPart = parts.find((p) => p.inlineData || p.inline_data)!;
  const inline = audioPart.inlineData ?? audioPart.inline_data!;
  const mimeType = inline.mimeType ?? inline.mime_type ?? "audio/L16;rate=24000";
  // Gemini TTS always returns raw 16-bit PCM; only the sample rate varies,
  // carried in the mimeType string (e.g. "audio/L16;rate=24000").
  const rateMatch = /rate=(\d+)/.exec(mimeType);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const pcmBuffer = Buffer.from(inline.data, "base64");

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const pcmPath = `${outPath}.pcm`;
  try {
    await fs.writeFile(pcmPath, pcmBuffer);
    await runFfmpeg([
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-i",
      pcmPath,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outPath,
    ]);
  } finally {
    await fs.unlink(pcmPath).catch(() => undefined);
  }
}

const PREVIEW_TEXT = "Merhaba, bu örnek bir seslendirmedir.";
const PREVIEWS_DIR = path.join(VOICES_DIR, "previews");

// Cached per-voice sample so picking a voice doesn't cost an API call every
// time — generated once on first request, reused after.
export async function getOrCreateVoicePreview(voice: string): Promise<string> {
  assertValidVoice(voice);
  const filename = `${voice}.mp3`;
  const outPath = path.join(PREVIEWS_DIR, filename);
  const url = `/voices/previews/${filename}`;

  const exists = await fs
    .access(outPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await synthesizeToFile(PREVIEW_TEXT, voice, outPath);
  }
  return url;
}

export async function generateVoiceClip(params: {
  text: string;
  voice: string;
  tag?: string;
}): Promise<VoiceClip> {
  assertValidVoice(params.voice);
  await fs.mkdir(VOICES_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const mp3Filename = `${id}.mp3`;
  const mp3Path = path.join(VOICES_DIR, mp3Filename);

  await synthesizeToFile(params.text, params.voice, mp3Path);

  const clip: VoiceClip = {
    id,
    text: params.text,
    voice: params.voice,
    url: `/voices/${mp3Filename}`,
    tag: params.tag,
    createdAt: new Date().toISOString(),
  };

  const clips = await readManifest();
  clips.unshift(clip);
  await writeManifest(clips);

  return clip;
}
