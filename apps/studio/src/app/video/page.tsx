"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Film, ImagePlus, Loader2, Maximize2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { locale, t } from "@/lib/i18n";

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
    if (!window.confirm(t("Bu videoyu silmek istediğine emin misin?"))) return;
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
    if (!window.confirm(t("Bu projeyi silmek istediğine emin misin?"))) return;
    await deleteVideoProject(id);
    await loadProjects();
  }

  const activeCount = jobs.filter((j) => j.status === "queued" || j.status === "running").length;

  return (
    // One window like the editor: settings panel on the left (scrolls inside,
    // submit pinned to its bottom), queue and finished videos on the right.
    <main className="mx-auto grid h-[calc(100dvh-3.5rem)] w-full max-w-[1800px] grid-cols-1 gap-4 overflow-hidden px-6 py-5 lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
      <section className="bg-card ring-foreground/10 flex min-h-0 flex-col rounded-lg ring-1">
        <div className="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold">{t("Video")}</h1>
            <p className="text-muted-foreground truncate text-xs">{t("Yerel LTX-2.3, sırayla arka planda üretilir")}</p>
          </div>
          <div className="bg-muted/60 inline-flex h-9 shrink-0 gap-0.5 rounded-md p-0.5">
            {(
              [
                ["single", t("Tek video")],
                ["project", t("Çoklu sahne")],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-[5px] px-3 text-xs font-semibold transition-colors",
                  mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          {mode === "single" ? (
            <>
              <div className="border-input focus-within:border-ring rounded-md border transition-colors">
                <textarea
                  placeholder={t("Ne olsun? Örn: a cat walking on a beach at sunset, cinematic")}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="placeholder:text-muted-foreground thin-scrollbar block w-full resize-none bg-transparent px-3 pt-3 pb-2 text-sm leading-relaxed outline-none"
                />
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5">
                  {VIDEO_PRESET_PROMPTS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => setPrompt(text)}
                      className="bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted max-w-48 truncate rounded-sm px-2 py-0.5 text-[11px] transition-colors"
                      title={text}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              <Group label={t("Görüntü")}>
                <RatioPicker compact label={t("Çözünürlük")} options={VIDEO_RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} />
                <div className="grid grid-cols-2 gap-2">
                  <StyleSelect
                    value={styleId}
                    onChange={(v) => {
                      setStyleId(v);
                      if (v === "anime") setUseStartImage(true);
                    }}
                  />
                  <DurationPicker value={duration} onChange={setDuration} />
                </div>
              </Group>

              <Group label={t("Seçenekler")}>
                <ToggleRow
                  checked={useStartImage}
                  onChange={setUseStartImage}
                  title={t("Önce görsel üret, sonra canlandır")}
                  hint={t("Stil çok daha iyi korunur, yaklaşık 1 dk ekler")}
                />
                {useStartImage && !refImageDataUrl && (
                  <div className="pl-12">
                    <StartImageSettings
                      provider={startImageProvider}
                      onProviderChange={setStartImageProvider}
                      steps={startImageSteps}
                      onStepsChange={setStartImageSteps}
                    />
                  </div>
                )}
                <ToggleRow
                  checked={generateAudio}
                  onChange={setGenerateAudio}
                  title={t("Ses üret")}
                  hint={t("Kapatırsan video sessiz çıkar, süre neredeyse aynı kalır")}
                />
              </Group>

              <Group label={t("Başlangıç görseli")}>
                <ImagePick
                  value={refImageDataUrl}
                  onPick={handleFileChange}
                  onClear={() => setRefImageDataUrl(null)}
                  hint={t("Kendi görselini yüklersen otomatik görsel üretimi atlanır")}
                />
              </Group>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t("Her sahne ayrı üretilir, hepsi bitince tek video halinde art arda birleştirilir.")}
              </p>

              <Group label={t("Görüntü (tüm sahneler)")}>
                <RatioPicker compact label={t("Çözünürlük")} options={VIDEO_RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} />
                <Select value={motionLevel} onValueChange={(v) => v && setMotionLevel(v as "normal" | "dusuk")}>
                  <SelectTrigger className="w-full" aria-label={t("Hareket yoğunluğu")}>
                    <SelectValue>{(v: string) => (v === "dusuk" ? t("Hareket: düşük (masal kitabı)") : t("Hareket: normal"))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{t("Normal")}</SelectItem>
                    <SelectItem value="dusuk">{t("Düşük (Masal Kitabı)")}</SelectItem>
                  </SelectContent>
                </Select>
              </Group>

              <Group label={t("Karakter tutarlılığı")} badge={t("Opsiyonel")}>
                <p className="text-muted-foreground -mt-1 text-xs leading-relaxed">
                  {t("Bir referans görsel üret, bütün sahneler aynı karaktere ve aynı seed'e bağlı kalsın.")}
                </p>
                <textarea
                  placeholder={t("Örn: küçük yuvarlak kulaklı kızıl bir tilki yavrusu, mavi tulum, iri gözler")}
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  rows={2}
                  className={cn(fieldClass, "h-auto resize-none py-2")}
                />
                <div className="flex gap-2">
                  <Select
                    value={referenceProvider}
                    onValueChange={(v) => v && setReferenceProvider(v as "gemini" | "comfy-flux-schnell")}
                  >
                    <SelectTrigger className="min-w-0 flex-1" aria-label={t("Görsel sağlayıcı")}>
                      <SelectValue>{(v: string) => (v === "gemini" ? "Gemini, Nano Banana" : "ComfyUI, FLUX schnell")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">{t("Gemini, Nano Banana")}</SelectItem>
                      <SelectItem value="comfy-flux-schnell">{t("ComfyUI (Yerel), FLUX schnell")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateReference}
                    disabled={!characterDescription.trim() || referenceGenerating}
                  >
                    {referenceGenerating && <Loader2 className="animate-spin" data-icon="inline-start" />}
                    {referenceImageUrl ? t("Yenile") : t("Oluştur")}
                  </Button>
                </div>
                {referenceImageUrl && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referenceImageUrl} alt={t("karakter referansı")} className="igor-reveal size-16 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setReferenceImageUrl(null);
                        setReferenceSeed(null);
                      }}
                      className="text-muted-foreground hover:text-destructive text-xs"
                    >
                      {t("Kaldır")}
                    </button>
                  </div>
                )}
                {referenceError && <p className="text-destructive text-xs">{referenceError}</p>}
              </Group>

              {scenes.map((scene, i) => (
                <div key={scene.key} className="border-border/70 flex flex-col gap-3 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{t("Sahne")} {i + 1}</span>
                    {scenes.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeScene(scene.key)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("Sahneyi kaldır")}
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <textarea
                    placeholder={t("Bu sahnede ne olsun? (hareket, anlatım, diyalog)")}
                    value={scene.prompt}
                    onChange={(e) => updateScene(scene.key, { prompt: e.target.value })}
                    rows={2}
                    className={cn(fieldClass, "h-auto resize-none py-2")}
                  />
                  {referenceImageUrl && (
                    <textarea
                      placeholder={t("Sahne görseli: sadece ne görünsün (kısa, diyalog yok). Boşsa üstteki metin kullanılır.")}
                      value={scene.imageVisual}
                      onChange={(e) => updateScene(scene.key, { imageVisual: e.target.value })}
                      rows={2}
                      className={cn(fieldClass, "h-auto resize-none py-2")}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <StyleSelect value={scene.styleId} onChange={(v) => updateScene(scene.key, { styleId: v })} />
                    <DurationPicker value={scene.duration} onChange={(v) => updateScene(scene.key, { duration: v })} />
                  </div>
                  <ToggleRow
                    checked={scene.useStartImage}
                    onChange={(v) => updateScene(scene.key, { useStartImage: v })}
                    title={t("Önce görsel üret, sonra canlandır")}
                  />
                  {scene.useStartImage && !scene.refImageDataUrl && !referenceImageUrl && (
                    <div className="pl-12">
                      <StartImageSettings
                        provider={scene.startImageProvider}
                        onProviderChange={(v) => updateScene(scene.key, { startImageProvider: v })}
                        steps={scene.startImageSteps}
                        onStepsChange={(v) => updateScene(scene.key, { startImageSteps: v })}
                      />
                    </div>
                  )}
                  {scene.useStartImage && !scene.refImageDataUrl && referenceImageUrl && (
                    <p className="text-muted-foreground pl-12 text-xs">
                      {t("Karakter referansına bağlı,")} {referenceProvider === "gemini" ? "Gemini" : t("yerel FLUX")} {t("ile üretilecek.")}
                    </p>
                  )}
                  <ToggleRow
                    checked={scene.generateAudio}
                    onChange={(v) => updateScene(scene.key, { generateAudio: v })}
                    title={t("Ses üret")}
                  />
                  <ImagePick
                    value={scene.refImageDataUrl}
                    onPick={(e) => sceneFileChange(scene.key, e)}
                    onClear={() => updateScene(scene.key, { refImageDataUrl: null })}
                  />
                </div>
              ))}

              <Button variant="outline" onClick={addScene} disabled={scenes.length >= MAX_SCENES}>
                <Plus data-icon="inline-start" />
                {t("Sahne ekle")}
              </Button>
            </>
          )}
        </div>

        <div className="border-border/60 border-t p-3">
          {mode === "single" ? (
            <Button onClick={handleGenerate} disabled={!prompt.trim()} size="lg" className="w-full">
              <Film data-icon="inline-start" />
              {t("Kuyruğa ekle")}
            </Button>
          ) : (
            <Button onClick={handleGenerateProject} disabled={!scenesReady} size="lg" className="w-full">
              <Film data-icon="inline-start" />
              {t("Projeyi kuyruğa ekle (")}{scenes.length} {t("sahne)")}
            </Button>
          )}
        </div>
      </section>

      <section className="bg-card ring-foreground/10 flex min-h-0 flex-col rounded-lg ring-1">
        <div className="border-border/60 flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("Videolar")}</h2>
          <span className="text-muted-foreground text-xs">
            {jobs.length} {t("video")}{projects.length > 0 && `, ${projects.length} proje`}
          </span>
          {activeCount > 0 && (
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Loader2 className="text-primary size-3.5 animate-spin" />
              {activeCount} {t("sırada")}
            </span>
          )}
          <span className="text-muted-foreground ml-auto hidden text-xs xl:inline">
            {t("5 sn 1280×720 video yaklaşık 7 dk sürer. Başarısız denemeler")}{" "}
            <Link href="/debug" className="text-primary hover:underline">
              {t("Hatalar")}
            </Link>
            {t("'da.")}
          </span>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {jobs.length === 0 && projects.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
              {t("Henüz video yok. Soldan bir prompt yazıp kuyruğa ekle.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {projects.map((project) => {
                const sceneJobs = project.sceneJobIds
                  .map((jid) => jobs.find((j) => j.id === jid))
                  .filter((j): j is VideoJob => !!j);
                const doneCount = sceneJobs.filter((j) => j.status === "done").length;
                return (
                  <MediaCard
                    key={project.id}
                    status={project.status === "running" ? "running" : project.status === "error" ? "error" : "done"}
                    url={project.finalUrl}
                    error={project.error}
                    since={project.createdAt}
                    progressLabel={`${doneCount}/${project.sceneCount} sahne`}
                    onOpen={() => project.finalUrl && setFullscreenUrl({ url: project.finalUrl, kind: "video" })}
                    onDelete={() => handleDeleteProject(project.id)}
                    meta={
                      <>
                        <Badge>{t("Proje")}</Badge>
                        <Badge variant="secondary">{project.sceneCount} {t("sahne")}</Badge>
                      </>
                    }
                    createdAt={project.createdAt}
                  />
                );
              })}
              {jobs.map((job) => (
                <MediaCard
                  key={job.id}
                  status={job.status}
                  url={job.url}
                  error={job.error}
                  since={job.createdAt}
                  onOpen={() => job.url && setFullscreenUrl({ url: job.url, kind: "video" })}
                  onDelete={() => handleDelete(job.id)}
                  prompt={job.prompt}
                  startImageUrl={job.startImageUrl}
                  onOpenStartImage={() => job.startImageUrl && setFullscreenUrl({ url: job.startImageUrl, kind: "image" })}
                  createdAt={job.createdAt}
                  meta={
                    <>
                      {job.projectId && <Badge variant="secondary">{t("Sahne")} {(job.sceneIndex ?? 0) + 1}</Badge>}
                      <Badge variant="secondary">
                        {job.width}×{job.height}
                      </Badge>
                      <Badge variant="secondary">{job.durationSeconds} {t("sn")}</Badge>
                      {job.status === "done" && job.ms !== undefined && job.ms > 0 && (
                        <Badge variant="secondary">{(job.ms / 60000).toFixed(1)} {t("dk")}</Badge>
                      )}
                      {job.startImageFallback && <Badge variant="destructive">{t("görsel üretilemedi, metinden")}</Badge>}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {fullscreenUrl && (
        <FullscreenViewer
          src={fullscreenUrl.url}
          alt={fullscreenUrl.kind === "image" ? t("referans görsel") : "video"}
          kind={fullscreenUrl.kind}
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </main>
  );
}

const fieldClass =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring dark:bg-input/20 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none transition-colors";

function Group({ label, badge, children }: { label: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{label}</span>
        {badge && <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px]">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function StyleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full min-w-0" aria-label={t("Stil")}>
        <SelectValue>
          {(v: string) => {
            const s = VIDEO_STYLES.find((st) => st.id === v);
            return <span className="truncate">{t("Stil:")} {s && s.id !== "none" ? t(s.label) : t("yok")}</span>;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {VIDEO_STYLES.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {t(s.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DurationPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label={t("Süre")} className="bg-muted/60 grid h-9 grid-flow-col gap-0.5 rounded-md p-0.5">
      {VIDEO_DURATIONS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={cn(
            "rounded-[5px] text-xs font-semibold tabular-nums transition-colors",
            value === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {d} {t("sn")}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 text-left"
    >
      <span
        className={cn(
          "relative mt-0.5 inline-block h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-input group-hover:bg-muted-foreground/40"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-4"
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm">{title}</span>
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
    </button>
  );
}

function ImagePick({
  value,
  onPick,
  onClear,
  hint,
}: {
  value: string | null;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  hint?: string;
}) {
  if (value) {
    return (
      <div className="border-border/70 flex items-center gap-3 rounded-md border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt={t("başlangıç görseli")} className="size-12 rounded-sm object-cover" />
        <span className="text-muted-foreground min-w-0 flex-1 text-xs">{t("Bu görsel canlandırılacak")}</span>
        <button type="button" onClick={onClear} className="text-muted-foreground hover:text-destructive px-2 text-xs">
          {t("Kaldır")}
        </button>
      </div>
    );
  }
  return (
    <label className="border-input hover:border-ring hover:bg-muted/30 flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-2.5 transition-colors">
      <ImagePlus className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm">{t("Görsel yükle")}</span>
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
      <input type="file" accept="image/*" onChange={onPick} className="sr-only" />
    </label>
  );
}

function MediaCard({
  status,
  url,
  error,
  since,
  progressLabel,
  prompt,
  startImageUrl,
  onOpenStartImage,
  meta,
  createdAt,
  onOpen,
  onDelete,
}: {
  status: "queued" | "running" | "done" | "error";
  url?: string;
  error?: string;
  since: string;
  progressLabel?: string;
  prompt?: string;
  startImageUrl?: string;
  onOpenStartImage?: () => void;
  meta: React.ReactNode;
  createdAt: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const busy = status === "queued" || status === "running";
  return (
    <article className="border-border/60 group animate-in fade-in flex flex-col overflow-hidden rounded-md border">
      <div className="relative aspect-video overflow-hidden bg-black">
        {status === "done" && url && (
          <button type="button" onClick={onOpen} className="absolute inset-0" aria-label={t("Videoyu aç")}>
            <video
              src={`${url}#t=0.1`}
              muted
              loop
              playsInline
              preload="metadata"
              onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0.1;
              }}
              className="absolute inset-0 h-full w-full object-contain"
            />
            <span className="bg-background/80 absolute right-2 bottom-2 flex items-center justify-center rounded-sm p-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 className="size-3.5" />
            </span>
          </button>
        )}
        {busy && (
          <div className="bg-muted absolute inset-0 overflow-hidden">
            {status === "running" && (
              <>
                <div className="bg-primary/30 igor-glow absolute top-1/2 left-1/2 size-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
                <div className="igor-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
              </>
            )}
            <div className="relative flex h-full flex-col items-center justify-center gap-1">
              <span className="text-sm font-medium">{status === "running" ? t("Üretiliyor") : t("Kuyrukta")}</span>
              {progressLabel && <span className="text-muted-foreground text-xs">{progressLabel}</span>}
              <ElapsedTimer since={since} />
            </div>
            {status === "running" && (
              <div className="bg-foreground/10 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
                <div className="bg-primary igor-indeterminate absolute inset-y-0 w-[35%]" />
              </div>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="bg-muted absolute inset-0 flex items-center justify-center p-3">
            <span className="text-destructive line-clamp-4 text-center text-xs break-words">{error}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="flex flex-wrap items-center gap-1">{meta}</div>
        {prompt && <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{prompt}</p>}
        <div className="mt-auto flex items-center gap-3 pt-0.5">
          {startImageUrl && (
            <button type="button" onClick={onOpenStartImage} title={t("Başlangıç görseli")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={startImageUrl} alt={t("başlangıç görseli")} className="size-7 rounded-sm object-cover" />
            </button>
          )}
          <span className="text-muted-foreground text-[11px]">
            {new Date(createdAt).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {status === "done" && url && (
              <a href={url} download className="text-primary text-xs font-medium hover:underline">
                {t("İndir")}
              </a>
            )}
            <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-destructive text-xs font-medium">
              {t("Sil")}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
