"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { locale, t } from "@/lib/i18n";

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
    if (!window.confirm(t("Bu ses kaydını silmek istediğine emin misin?"))) return;
    await deleteVoiceClip(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
  }

  const voiceInfo = (name: string) => TTS_VOICE_INFO.find((v) => v.name === name);

  return (
    // One window: writer on the left, clip library on the right (scrolls inside).
    <main className="mx-auto grid h-[calc(100dvh-3.5rem)] w-full max-w-[1800px] grid-cols-1 gap-4 overflow-hidden px-6 py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Seslendirme")}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t("Gemini TTS ile metinden ses üret. Klipler")}{" "}
            <a href="/video/editor" className="text-primary hover:underline">
              {t("Editör")}
            </a>
            {t("'deki Seslendirme katmanından eklenebilir.")}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleGenerate();
          }}
          className="bg-card ring-foreground/10 focus-within:ring-primary/40 flex min-h-0 flex-1 flex-col rounded-lg ring-1 transition-shadow"
        >
          <textarea
            placeholder={t("Seslendirilecek metni yaz...")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="placeholder:text-muted-foreground thin-scrollbar block min-h-32 w-full flex-1 resize-none bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed outline-none"
          />

          <div className="border-border/60 flex flex-col gap-2.5 border-t px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{t("Ton")}</span>
              <span className={cn("text-xs tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
                {finalBytes} / {TTS_MAX_BYTES} {t("bayt")}{overLimit && t(", metni kısalt")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_STYLE_PRESETS.map((p) => {
                const active = styleInstruction === t(p.instruction);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setStyleInstruction(active ? "" : t(p.instruction))}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {t(p.label)}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder={t("Ya da kendi talimatını yaz: neşeli bir tonda, yavaş ve sakin, fısıldayarak...")}
              value={styleInstruction}
              onChange={(e) => setStyleInstruction(e.target.value)}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring dark:bg-input/20 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none"
            />
          </div>

          <div className="border-border/60 flex flex-wrap items-center gap-2 border-t p-2.5">
            <Select value={voice} onValueChange={(v) => v && setVoice(v)}>
              <SelectTrigger className="w-60" aria-label={t("Ses")}>
                <SelectValue>
                  {(v: string) => {
                    const info = voiceInfo(v);
                    return (
                      <span className="truncate">
                        {v} {info && <span className="text-muted-foreground">{t(info.gender)}, {t(info.tone)}</span>}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72 w-80">
                {TTS_VOICE_INFO.map((v) => (
                  <SelectItem key={t(v.name)} value={t(v.name)}>
                    {t(v.name)}{" "}
                    <span className="text-muted-foreground">
                      {t(v.gender)}, {t(v.tone)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handlePreviewVoice(voice)}
              disabled={previewLoadingVoice === voice}
              title={t("Sesi dinle")}
              aria-label={t("Sesi dinle")}
            >
              {previewLoadingVoice === voice ? <Loader2 className="animate-spin" /> : <Volume2 />}
            </Button>
            <TagInput compact value={tag} onChange={setTag} suggestions={allTags} />
            <Button type="submit" disabled={!text.trim() || generating || overLimit} className="ml-auto">
              {generating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <AudioLines data-icon="inline-start" />}
              {generating ? t("Üretiliyor") : t("Üret")}
            </Button>
          </div>
          {error && <p className="text-destructive px-3 pb-3 text-sm">{error}</p>}
        </form>
      </section>

      <section className="bg-card ring-foreground/10 flex min-h-0 flex-col rounded-lg ring-1">
        <div className="border-border/60 flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("Kütüphane")}</h2>
          <span className="text-muted-foreground text-xs">{clips.length} {t("klip")}</span>
          <div className="ml-auto">
            <TagFilter tags={allTags} active={filterTag} onChange={setFilterTag} />
          </div>
        </div>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {generating && (
            <div className="border-border/60 relative mb-2 overflow-hidden rounded-md border p-3">
              <div className="igor-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
              <p className="relative text-sm font-medium">{t("Üretiliyor")}</p>
              <p className="text-muted-foreground relative mt-1 line-clamp-1 text-xs">{text}</p>
              <div className="bg-foreground/10 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
                <div className="bg-primary igor-indeterminate absolute inset-y-0 w-[35%]" />
              </div>
            </div>
          )}
          {visibleClips.length === 0 && !generating ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
              {clips.length === 0 ? t("Henüz seslendirme üretmedin.") : t("Bu etikette henüz seslendirme yok.")}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibleClips.map((clip) => {
                const info = voiceInfo(clip.voice);
                return (
                  <li key={clip.id} className="border-border/60 hover:bg-muted/30 animate-in fade-in rounded-md border p-3 transition-colors">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{clip.voice}</Badge>
                      {info && (
                        <span className="text-muted-foreground text-xs">
                          {t(info.gender)}, {t(info.tone)}
                        </span>
                      )}
                      {clip.tag && <Badge variant="outline">#{clip.tag}</Badge>}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {new Date(clip.createdAt).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm">{clip.text}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <audio src={clip.url} controls className="h-8 min-w-0 flex-1" />
                      <a href={clip.url} download className="text-primary text-xs font-medium hover:underline">
                        {t("İndir")}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(clip.id)}
                        className="text-muted-foreground hover:text-destructive text-xs font-medium"
                      >
                        {t("Sil")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
