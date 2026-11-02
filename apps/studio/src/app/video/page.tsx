"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Loader2, Plus, X } from "lucide-react";
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
import { RatioPicker } from "@/components/ratio-picker";
import { Badge } from "@/components/ui/badge";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { ElapsedTimer } from "@/components/elapsed-timer";
import { StartImageSettings } from "@/components/start-image-settings";
import {
  VIDEO_DURATIONS,
  VIDEO_PRESET_PROMPTS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_STYLES,
  enqueueVideoJob,
  enqueueVideoProject,
  fetchVideoProjects,
  deleteVideoProject,
  buildStorybookImagePrompt,
  generateStorybookReference,
  toErrorMessage,
  type VideoProject,
} from "@/lib/providers";

const REFERENCE_STEPS = 8;

const MAX_SCENES = 12;

type VideoJob = {
  id: string;
  prompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  useStartImage?: boolean;
  startImageUrl?: string;
  startImageSteps?: number;
  startImageProvider?: string;
  generateAudio?: boolean;
  projectId?: string;
  sceneIndex?: number;
  startImageFallback?: boolean;
  status: "queued" | "running" | "done" | "error";
  url?: string;
  ms?: number;
  error?: string;
  createdAt: string;
};

type SceneForm = {
  key: string;
  prompt: string;
  // Character-consistency mode only: short visual-only description (no dialogue/narration)
  // used as the scene's image prompt instead of `prompt` above.
  imageVisual: string;
  styleId: string;
  duration: number;
  useStartImage: boolean;
  startImageProvider: string;
  startImageSteps: number;
  refImageDataUrl: string | null;
  generateAudio: boolean;
};

function newScene(): SceneForm {
  return {
    key: crypto.randomUUID(),
    prompt: "",
    imageVisual: "",
    styleId: "none",
    duration: 5,
    useStartImage: true,
    startImageProvider: "comfy-flux-schnell",
    startImageSteps: 8,
    refImageDataUrl: null,
    generateAudio: true,
  };
}

export default function VideoPage() {
  const [mode, setMode] = useState<"single" | "project">("single");

  // Single-video mode
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("1280x720");
  const [duration, setDuration] = useState(5);
  const [styleId, setStyleId] = useState("none");
  const [useStartImage, setUseStartImage] = useState(true);
  const [startImageProvider, setStartImageProvider] = useState("comfy-flux-schnell");
  const [startImageSteps, setStartImageSteps] = useState(8);
  const [refImageDataUrl, setRefImageDataUrl] = useState<string | null>(null);
  const [generateAudio, setGenerateAudio] = useState(true);

  // Project (multi-scene) mode — shares resolution with single mode
  const [scenes, setScenes] = useState<SceneForm[]>(() => [newScene(), newScene()]);
  const [motionLevel, setMotionLevel] = useState<"normal" | "dusuk">("normal");

  // Character consistency (project mode) — one reference image + fixed seed reused
  // by every scene's start-image generation for character/style consistency.
  const [characterDescription, setCharacterDescription] = useState("");
  const [referenceProvider, setReferenceProvider] = useState<"gemini" | "comfy-flux-schnell">(
    "comfy-flux-schnell"
  );
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceSeed, setReferenceSeed] = useState<number | null>(null);
  const [referenceGenerating, setReferenceGenerating] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  async function handleGenerateReference() {
    if (!characterDescription.trim()) return;
    setReferenceGenerating(true);
    setReferenceError(null);
    try {
      const [width, height] = resolution.split("x").map(Number);
      const seed = Math.floor(Math.random() * 1e9);
      const { url } = await generateStorybookReference({
        prompt: buildStorybookImagePrompt(characterDescription, ""),
        width,
        height,
        provider: referenceProvider,
        steps: REFERENCE_STEPS,
        seed,
      });
      setReferenceImageUrl(url);
      setReferenceSeed(seed);
    } catch (err) {
      setReferenceError(toErrorMessage(err));
    } finally {
      setReferenceGenerating(false);
    }
  }

  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [fullscreenUrl, setFullscreenUrl] = useState<{ url: string; kind: "image" | "video" } | null>(
    null
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/video");
    const data: VideoJob[] = await res.json();
    setJobs(data);
  }, []);

  const loadProjects = useCallback(async () => {
    setProjects(await fetchVideoProjects());
  }, []);

  useEffect(() => {
    fetch("/api/video")
      .then((r) => r.json())
      .then(setJobs);
    fetchVideoProjects().then(setProjects);
  }, []);

  useEffect(() => {
    const active = jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!active) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [jobs, load]);

  useEffect(() => {
    const active = projects.some((p) => p.status === "running");
    if (!active) return;
    const interval = setInterval(loadProjects, 4000);
    return () => clearInterval(interval);
  }, [projects, loadProjects]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRefImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    const [width, height] = resolution.split("x").map(Number);
    const style = VIDEO_STYLES.find((s) => s.id === styleId);
    const finalPrompt = style?.suffix ? `${prompt}, ${style.suffix}` : prompt;
    await enqueueVideoJob({
      prompt: finalPrompt,
      width,
      height,
      durationSeconds: duration,
      fps: 25,
      useStartImage,
      startImageDataUrl: refImageDataUrl ?? undefined,
      startImageProvider,
      startImageSteps,
      generateAudio,
    });
    await load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu videoyu silmek istediğine emin misin?")) return;
    await fetch(`/api/video/${id}`, { method: "DELETE" });
    await load();
  }

  function updateScene(key: string, patch: Partial<SceneForm>) {
    setScenes((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addScene() {
    setScenes((prev) => (prev.length >= MAX_SCENES ? prev : [...prev, newScene()]));
  }

  function removeScene(key: string) {
    setScenes((prev) => (prev.length <= 2 ? prev : prev.filter((s) => s.key !== key)));
  }

  function sceneFileChange(key: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateScene(key, { refImageDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  const scenesReady = scenes.every((s) => s.prompt.trim());

  async function handleGenerateProject() {
    if (!scenesReady) return;
    const [width, height] = resolution.split("x").map(Number);
    const hasReference = !!referenceImageUrl;
    await enqueueVideoProject({
      width,
      height,
      fps: 25,
      motionLevel,
      referenceImageDataUrl: referenceImageUrl ?? undefined,
      referenceProvider: referenceImageUrl ? referenceProvider : undefined,
      seed: referenceSeed ?? undefined,
      scenes: scenes.map((s) => {
        const style = VIDEO_STYLES.find((st) => st.id === s.styleId);
        const finalPrompt = style?.suffix ? `${s.prompt}, ${style.suffix}` : s.prompt;
        return {
          prompt: finalPrompt,
          imagePrompt: hasReference
            ? buildStorybookImagePrompt(characterDescription, s.imageVisual)
            : undefined,
          durationSeconds: s.duration,
          useStartImage: s.useStartImage,
          startImageDataUrl: s.refImageDataUrl ?? undefined,
          startImageProvider: hasReference ? referenceProvider : s.startImageProvider,
          startImageSteps: s.startImageSteps,
          generateAudio: s.generateAudio,
        };
      }),
    });
    setScenes([newScene(), newScene()]);
    await loadProjects();
  }

  async function handleDeleteProject(id: string) {
    if (!window.confirm("Bu projeyi silmek istediğine emin misin?")) return;
    await deleteVideoProject(id);
    await loadProjects();
  }

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Video (Yerel — LTX-2.3)</h1>
        <p className="text-muted-foreground text-sm">
          Sunucu tarafında sırayla çalışır: sayfadan çıksan da devam eder. Bu donanımda video
          başına ~7 dakika (5sn/1280x720) sürüyor.{" "}
          <Link href="/debug" className="text-primary underline-offset-4 hover:underline">
            Hatalar
          </Link>{" "}
          sayfasından başarısız denemeleri görebilirsin.
        </p>
      </header>

      <div className="bg-muted flex w-fit items-center gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "single" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tek Video
        </button>
        <button
          type="button"
          onClick={() => setMode("project")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "project" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Çoklu Sahne (Proje)
        </button>
      </div>

      {mode === "single" ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <Textarea
              placeholder="Ne oluşturmak istersin? Örn: a cat walking on a beach at sunset, photorealistic, cinematic"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="resize-none text-base"
            />

            <div className="flex flex-wrap gap-2">
              {VIDEO_PRESET_PROMPTS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setPrompt(text)}
                  className="border-input hover:bg-accent max-w-64 truncate rounded-full border px-3 py-1 text-xs transition-colors"
                  title={text}
                >
                  {text}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-40 space-y-1.5">
                <span className="text-muted-foreground text-xs">Stil</span>
                <Select
                  value={styleId}
                  onValueChange={(v) => {
                    if (!v) return;
                    setStyleId(v);
                    if (v === "anime") setUseStartImage(true);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_STYLES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <RatioPicker label="Çözünürlük" options={VIDEO_RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} />

              <div className="min-w-32 space-y-1.5">
                <span className="text-muted-foreground text-xs">Süre</span>
                <Select value={String(duration)} onValueChange={(v) => v && setDuration(Number(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} saniye
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleGenerate} disabled={!prompt.trim()} className="ml-auto">
                Kuyruğa Ekle
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useStartImage}
                onChange={(e) => setUseStartImage(e.target.checked)}
                className="size-4"
              />
              Önce görsel üret, sonra canlandır
              <span className="text-muted-foreground text-xs">
                (standart mod — stil çok daha iyi korunur, ~1 dk ekstra sürer)
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(e) => setGenerateAudio(e.target.checked)}
                className="size-4"
              />
              Ses üret
              <span className="text-muted-foreground text-xs">
                (kapatırsan video sessiz çıkar — üretim süresi neredeyse aynı kalır, model sesi
                yine de dahili olarak üretiyor)
              </span>
            </label>

            {useStartImage && !refImageDataUrl && (
              <StartImageSettings
                provider={startImageProvider}
                onProviderChange={setStartImageProvider}
                steps={startImageSteps}
                onStepsChange={setStartImageSteps}
              />
            )}

            <div className="flex items-center gap-3">
              <label className="text-muted-foreground text-xs">
                Kendi referans görselini yükle (opsiyonel, yüklersen otomatik görsel üretimi atlanır)
              </label>
              <input type="file" accept="image/*" onChange={handleFileChange} className="text-xs" />
              {refImageDataUrl && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={refImageDataUrl}
                    alt="referans görsel"
                    className="h-12 w-12 rounded object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setRefImageDataUrl(null)}
                    className="text-destructive text-xs underline-offset-4 hover:underline"
                  >
                    Kaldır
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <p className="text-muted-foreground text-sm">
              Her sahne kendi prompt&apos;u, stili, süresi ve başlangıç görseli sağlayıcısıyla ayrı
              ayrı üretilir; hepsi bitince tek video halinde art arda (kesmeli geçiş) birleştirilir.
            </p>

            <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Karakter tutarlılığı (opsiyonel)</h3>
                <p className="text-muted-foreground text-xs">
                  Bir kez karakter/stil tarifi girip referans görsel üret — tüm sahneler bu
                  referansa ve aynı seed&apos;e koşullanarak üretilir, karakter tasarımı sahne sahne
                  değişmez.
                </p>
              </div>

              <Textarea
                placeholder="Karakter ve stil tarifi, örn: küçük yuvarlak kulaklı kızıl bir tilki yavrusu, mavi tulum, iri gözler"
                value={characterDescription}
                onChange={(e) => setCharacterDescription(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />

              <div className="min-w-48 space-y-1.5">
                <span className="text-muted-foreground text-xs">Görsel sağlayıcı</span>
                <Select
                  value={referenceProvider}
                  onValueChange={(v) => v && setReferenceProvider(v as "gemini" | "comfy-flux-schnell")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini — Nano Banana</SelectItem>
                    <SelectItem value="comfy-flux-schnell">ComfyUI (Yerel) — FLUX schnell</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateReference}
                  disabled={!characterDescription.trim() || referenceGenerating}
                >
                  {referenceGenerating && <Loader2 className="size-4 animate-spin" />}
                  {referenceImageUrl ? "Yeniden Oluştur" : "Referans Görsel Oluştur"}
                </Button>

                {referenceImageUrl && (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={referenceImageUrl}
                      alt="karakter referansı"
                      className="h-16 w-16 rounded object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setReferenceImageUrl(null);
                        setReferenceSeed(null);
                      }}
                      className="text-destructive text-xs underline-offset-4 hover:underline"
                    >
                      Kaldır
                    </button>
                  </div>
                )}
              </div>

              {referenceError && <p className="text-destructive text-xs">{referenceError}</p>}

              <div className="min-w-48 space-y-1.5">
                <span className="text-muted-foreground text-xs">Hareket yoğunluğu (tüm sahneler)</span>
                <Select value={motionLevel} onValueChange={(v) => v && setMotionLevel(v as "normal" | "dusuk")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="dusuk">Düşük (Masal Kitabı)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {scenes.map((scene, i) => (
              <div key={scene.key} className="border-border space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Sahne {i + 1}</span>
                  {scenes.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeScene(scene.key)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Sahneyi kaldır"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                <Textarea
                  placeholder="Bu sahnede ne olsun? (anlatım/diyalog buraya, video hareketi için)"
                  value={scene.prompt}
                  onChange={(e) => updateScene(scene.key, { prompt: e.target.value })}
                  rows={2}
                  className="resize-none text-sm"
                />

                {referenceImageUrl && (
                  <Textarea
                    placeholder="Sahne görseli — sadece ne görünsün (kısa, sade, diyalog yok). Boşsa üstteki metin kullanılır."
                    value={scene.imageVisual}
                    onChange={(e) => updateScene(scene.key, { imageVisual: e.target.value })}
                    rows={2}
                    className="resize-none text-sm"
                  />
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 space-y-1.5">
                    <span className="text-muted-foreground text-xs">Stil</span>
                    <Select
                      value={scene.styleId}
                      onValueChange={(v) => v && updateScene(scene.key, { styleId: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_STYLES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-32 space-y-1.5">
                    <span className="text-muted-foreground text-xs">Süre</span>
                    <Select
                      value={String(scene.duration)}
                      onValueChange={(v) => v && updateScene(scene.key, { duration: Number(v) })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_DURATIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} saniye
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={scene.useStartImage}
                    onChange={(e) => updateScene(scene.key, { useStartImage: e.target.checked })}
                    className="size-4"
                  />
                  Önce görsel üret, sonra canlandır
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={scene.generateAudio}
                    onChange={(e) => updateScene(scene.key, { generateAudio: e.target.checked })}
                    className="size-4"
                  />
                  Ses üret
                </label>

                {scene.useStartImage && !scene.refImageDataUrl && !referenceImageUrl && (
                  <StartImageSettings
                    provider={scene.startImageProvider}
                    onProviderChange={(v) => updateScene(scene.key, { startImageProvider: v })}
                    steps={scene.startImageSteps}
                    onStepsChange={(v) => updateScene(scene.key, { startImageSteps: v })}
                  />
                )}
                {scene.useStartImage && !scene.refImageDataUrl && referenceImageUrl && (
                  <p className="text-muted-foreground text-xs">
                    Karakter referansı aktif — bu sahne{" "}
                    {referenceProvider === "gemini" ? "Gemini" : "ComfyUI (yerel FLUX)"} ile referansa
                    koşullanarak üretilecek.
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <label className="text-muted-foreground text-xs">
                    Kendi referans görselini yükle (opsiyonel)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => sceneFileChange(scene.key, e)}
                    className="text-xs"
                  />
                  {scene.refImageDataUrl && (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={scene.refImageDataUrl}
                        alt="referans görsel"
                        className="h-10 w-10 rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => updateScene(scene.key, { refImageDataUrl: null })}
                        className="text-destructive text-xs underline-offset-4 hover:underline"
                      >
                        Kaldır
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <Button
              variant="secondary"
              onClick={addScene}
              disabled={scenes.length >= MAX_SCENES}
              className="w-fit"
            >
              <Plus className="size-4" />
              Sahne Ekle
            </Button>

            <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <RatioPicker label="Çözünürlük (tüm sahneler)" options={VIDEO_RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} />

              <Button onClick={handleGenerateProject} disabled={!scenesReady} className="ml-auto">
                Projeyi Kuyruğa Ekle ({scenes.length} sahne)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {projects.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Projeler</h2>
          {projects.map((project) => {
            const sceneJobs = project.sceneJobIds
              .map((jid) => jobs.find((j) => j.id === jid))
              .filter((j): j is VideoJob => !!j);
            const doneCount = sceneJobs.filter((j) => j.status === "done").length;

            return (
              <Card key={project.id}>
                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
                  <div className="bg-muted flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-md sm:w-64">
                    {project.status === "running" && (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="text-primary size-6 animate-spin" />
                        <span className="text-muted-foreground text-xs">
                          {doneCount}/{project.sceneCount} sahne tamamlandı
                        </span>
                        <ElapsedTimer since={project.createdAt} />
                      </div>
                    )}
                    {project.status === "error" && (
                      <span className="text-destructive line-clamp-4 p-3 text-center text-xs">
                        {project.error}
                      </span>
                    )}
                    {project.status === "done" && project.finalUrl && (
                      <button
                        type="button"
                        onClick={() => setFullscreenUrl({ url: project.finalUrl!, kind: "video" })}
                        className="h-full w-full"
                      >
                        <video
                          src={project.finalUrl}
                          muted
                          loop
                          autoPlay
                          className="h-full w-full object-cover"
                        />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Proje</Badge>
                      <Badge variant="secondary">{project.sceneCount} sahne</Badge>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {new Date(project.createdAt).toLocaleString("tr-TR")}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center gap-3">
                      {project.status === "done" && project.finalUrl && (
                        <a
                          href={project.finalUrl}
                          download
                          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                        >
                          İndir
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-destructive text-sm font-medium underline-offset-4 hover:underline"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center py-24 text-center text-sm">
          Henüz video üretmedin. Bir prompt yaz ve &quot;Kuyruğa Ekle&quot;ye bas.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
                <div className="bg-muted flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-md sm:w-64">
                  {job.status === "queued" && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-muted-foreground text-xs">Kuyrukta...</span>
                      <ElapsedTimer since={job.createdAt} />
                    </div>
                  )}
                  {job.status === "running" && (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="text-primary size-6 animate-spin" />
                      <span className="text-muted-foreground text-xs">Üretiliyor...</span>
                      <ElapsedTimer since={job.createdAt} />
                    </div>
                  )}
                  {job.status === "error" && (
                    <span className="text-destructive line-clamp-4 p-3 text-center text-xs">
                      {job.error}
                    </span>
                  )}
                  {job.status === "done" && job.url && (
                    <button
                      type="button"
                      onClick={() => setFullscreenUrl({ url: job.url!, kind: "video" })}
                      className="h-full w-full"
                    >
                      <video src={job.url} muted loop autoPlay className="h-full w-full object-cover" />
                    </button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {job.projectId && <Badge variant="secondary">Proje sahnesi {(job.sceneIndex ?? 0) + 1}</Badge>}
                    <Badge variant="secondary">
                      {job.width}x{job.height}
                    </Badge>
                    <Badge variant="secondary">{job.durationSeconds}s</Badge>
                    {job.status === "done" && job.ms !== undefined && (
                      <Badge variant="secondary">{(job.ms / 60000).toFixed(1)} dk</Badge>
                    )}
                    {job.startImageFallback && (
                      <Badge variant="destructive">
                        ⚠ görsel üretilemedi, sadece metinden üretildi
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {new Date(job.createdAt).toLocaleString("tr-TR")}
                    </span>
                  </div>
                  {job.startImageUrl && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Referans görsel:</span>
                      <button
                        type="button"
                        onClick={() => setFullscreenUrl({ url: job.startImageUrl!, kind: "image" })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={job.startImageUrl}
                          alt="referans görsel"
                          className="h-12 w-12 rounded object-cover"
                        />
                      </button>
                    </div>
                  )}
                  <p className="text-muted-foreground line-clamp-2 text-sm">{job.prompt}</p>
                  <div className="mt-auto flex items-center gap-3">
                    {job.status === "done" && job.url && (
                      <a
                        href={job.url}
                        download
                        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                      >
                        İndir
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(job.id)}
                      className="text-destructive text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {fullscreenUrl && (
        <FullscreenViewer
          src={fullscreenUrl.url}
          alt={fullscreenUrl.kind === "image" ? "referans görsel" : "video"}
          kind={fullscreenUrl.kind}
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </main>
  );
}
