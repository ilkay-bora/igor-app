"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TagFilter, TagInput } from "@/components/tag-controls";
import {
  TTS_MAX_BYTES,
  TTS_VOICE_INFO,
  VOICE_STYLE_PRESETS,
  type VoiceClip,
  deleteVoiceClip,
  fetchVoiceClips,
  fetchVoicePreviewUrl,
  generateVoiceClip,
  collectTags,
  normalizeTag,
} from "@/lib/providers";

function byteLength(s: string): number {
  return new Blob([s]).size;
}

export default function VoicePage() {
  const [text, setText] = useState("");
  const [styleInstruction, setStyleInstruction] = useState("");
  const [voice, setVoice] = useState<string>(TTS_VOICE_INFO[0].name);
  const [tag, setTag] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewLoadingVoice, setPreviewLoadingVoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const allTags = collectTags(clips);
  const visibleClips = filterTag === null ? clips : clips.filter((c) => c.tag === filterTag);
  const finalText = styleInstruction.trim() ? `${styleInstruction.trim()}: ${text.trim()}` : text.trim();
  const finalBytes = byteLength(finalText);
  const overLimit = finalBytes > TTS_MAX_BYTES;

  useEffect(() => {
    fetchVoiceClips().then(setClips);
  }, []);

  async function handlePreviewVoice(v: string) {
    setPreviewLoadingVoice(v);
    setError(null);
    try {
      const url = await fetchVoicePreviewUrl(v);
      if (!previewAudioRef.current) previewAudioRef.current = new Audio();
      previewAudioRef.current.src = url;
      await previewAudioRef.current.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoadingVoice(null);
    }
  }

  async function handleGenerate() {
    if (!text.trim() || overLimit) return;
    setGenerating(true);
    setError(null);
    try {
      const clip = await generateVoiceClip({ text: finalText, voice, tag: normalizeTag(tag) || undefined });
      setClips((prev) => [clip, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu ses kaydını silmek istediğine emin misin?")) return;
    await deleteVoiceClip(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Seslendirme (AI Voice)</h1>
        <p className="text-muted-foreground text-sm">
          Gemini TTS ile metinden seslendirme üret. Ürettiğin klipleri{" "}
          <a href="/video/editor" className="text-primary underline-offset-4 hover:underline">
            Editör
          </a>
          &apos;de &quot;Seslendirme &gt; Kütüphaneden seç&quot; ile videoya ekleyebilirsin.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Textarea
            placeholder="Seslendirilecek metni yaz..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="resize-none text-base"
          />
          <p className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
            {finalBytes} / {TTS_MAX_BYTES} bayt (stil talimatı dahil)
            {overLimit && " — Gemini TTS tek istekte bunu kabul etmiyor, metni kısalt"}
          </p>

          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs">
              Stil talimatı (opsiyonel) — Gemini TTS ton/tempo/duyguyu ayrı bir parametre değil,
              doğal dil talimatıyla kontrol ediyor. Hazır birini seç ya da kendi talimatını yaz.
            </span>
            <div className="flex flex-wrap gap-2">
              {VOICE_STYLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyleInstruction(p.instruction)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    styleInstruction === p.instruction
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {styleInstruction && (
                <button
                  type="button"
                  onClick={() => setStyleInstruction("")}
                  className="text-muted-foreground rounded-full px-3 py-1 text-xs underline-offset-4 hover:underline"
                >
                  Temizle
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Örn: neşeli bir tonda, yavaş ve sakin, heyecanlı, fısıldayarak"
              value={styleInstruction}
              onChange={(e) => setStyleInstruction(e.target.value)}
              className="border-input w-full rounded border bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 space-y-1.5">
              <span className="text-muted-foreground text-xs">Ses</span>
              <div className="flex items-center gap-1.5">
                <Select value={voice} onValueChange={(v) => v && setVoice(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-80 max-h-72">
                    {TTS_VOICE_INFO.map((v) => (
                      <SelectItem key={v.name} value={v.name}>
                        {v.name}{" "}
                        <span className="text-muted-foreground">
                          — {v.gender}, {v.tone}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => handlePreviewVoice(voice)}
                  disabled={previewLoadingVoice === voice}
                  title="Sesi dinle"
                >
                  {previewLoadingVoice === voice ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <TagInput value={tag} onChange={setTag} suggestions={allTags} />

            <Button onClick={handleGenerate} disabled={!text.trim() || generating || overLimit} className="ml-auto">
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Üretiliyor...
                </>
              ) : (
                "Üret"
              )}
            </Button>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      <TagFilter tags={allTags} active={filterTag} onChange={setFilterTag} />

      {visibleClips.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center py-24 text-center text-sm">
          {clips.length === 0 ? "Henüz seslendirme üretmedin." : "Bu etikette henüz seslendirme yok."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleClips.map((clip) => (
            <Card key={clip.id}>
              <CardContent className="flex flex-col gap-2 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {clip.voice}
                    {(() => {
                      const info = TTS_VOICE_INFO.find((v) => v.name === clip.voice);
                      return info ? ` — ${info.gender}, ${info.tone}` : "";
                    })()}
                  </Badge>
                  {clip.tag && <Badge variant="secondary">#{clip.tag}</Badge>}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {new Date(clip.createdAt).toLocaleString("tr-TR")}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-2 text-sm">{clip.text}</p>
                <div className="flex items-center gap-3">
                  <audio src={clip.url} controls className="h-9 flex-1" />
                  <a
                    href={clip.url}
                    download
                    className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                  >
                    İndir
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(clip.id)}
                    className="text-destructive text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Sil
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
