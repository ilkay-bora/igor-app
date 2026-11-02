"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "@/components/elapsed-timer";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FitImage } from "@/components/fit-image";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { TagFilter, TagInput } from "@/components/tag-controls";
import {
  MODELS,
  PRESET_PROMPTS,
  RATIO_OPTIONS,
  type ModelOption,
  type PromptEntry,
  type Ratio,
  type SavedGeneration,
  deleteGeneration,
  fetchRecentPrompts,
  generateComfyImage,
  generateGeminiImage,
  generatePollinationsImage,
  logError,
  logPrompt,
  persistImage,
  collectTags,
  normalizeTag,
  toErrorMessage,
} from "@/lib/providers";

type ItemStatus = "loading" | "done" | "error";
type GalleryItem = {
  id: string;
  prompt: string;
  model: ModelOption;
  ratio: Ratio;
  status: ItemStatus;
  startedAt?: number;
  url?: string;
  savedUrl?: string;
  savedId?: string;
  error?: string;
  tag?: string;
  /** Generated in this visit: plays the reveal animation once. */
  fresh?: boolean;
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<Ratio>("1:1");
  const [modelId, setModelId] = useState(
    MODELS.find((m) => m.id === "comfy-flux-schnell")?.id ?? MODELS[0].id
  ); // local, free, no API key
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [recentPrompts, setRecentPrompts] = useState<PromptEntry[]>([]);
  const [tag, setTag] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);

  const allTags = collectTags(items);
  const visibleItems = filterTag === null ? items : items.filter((it) => it.tag === filterTag);

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0];

  useEffect(() => {
    fetch("/api/generations")
      .then((r) => r.json())
      .then((history: SavedGeneration[]) => {
        setItems((prev) => {
          // Dedupe by id: effects can run twice in dev (React Strict Mode),
          // and prev may already hold this same history from the first run.
          const existingIds = new Set(prev.map((it) => it.id));
          const newOnes = history
            .filter((g) => !existingIds.has(g.id))
            .map((g) => ({
              id: g.id,
              prompt: g.prompt,
              model:
                MODELS.find((m) => m.id === g.modelId) ??
                ({ id: g.modelId, label: g.modelLabel, badge: "", kind: "pollinations" } as ModelOption),
              ratio: g.ratio,
              status: "done" as const,
              url: g.url,
              savedUrl: g.url,
              savedId: g.id,
              tag: g.tag,
            }));
          return [...newOnes, ...prev];
        });
      })
      .catch(() => undefined);

    fetchRecentPrompts().then(setRecentPrompts);
  }, []);

  function updateItem(id: string, patch: Partial<GalleryItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function save(id: string, currentPrompt: string, currentModel: ModelOption, currentRatio: Ratio, currentTag: string | undefined, source: { dataUrl?: string; sourceUrl?: string }) {
    persistImage({
      prompt: currentPrompt,
      modelId: currentModel.id,
      modelLabel: currentModel.label,
      ratio: currentRatio,
      tag: currentTag,
      ...source,
    })
      .then((saved) => updateItem(id, { savedUrl: saved.url, savedId: saved.id }))
      .catch((err) => console.error("Görsel kaydedilemedi:", err));
  }

  function handleDelete(item: GalleryItem) {
    if (!item.savedId) return;
    if (!window.confirm("Bu görseli silmek istediğine emin misin?")) return;
    deleteGeneration(item.savedId)
      .then(() => {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setSelected((s) => (s?.id === item.id ? null : s));
      })
      .catch((err) => console.error("Görsel silinemedi:", err));
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setStarted(true);
    const id = crypto.randomUUID();
    const currentPrompt = prompt;
    const currentModel = model;
    const currentRatio = ratio;
    const currentTag = normalizeTag(tag) || undefined;
    setItems((prev) => [
      {
        id,
        prompt: currentPrompt,
        model: currentModel,
        ratio: currentRatio,
        status: "loading",
        startedAt: Date.now(),
        tag: currentTag,
      },
      ...prev,
    ]);

    logPrompt(currentPrompt);
    setRecentPrompts((prev) =>
      prev[0]?.text === currentPrompt
        ? prev
        : [{ id: crypto.randomUUID(), text: currentPrompt, createdAt: new Date().toISOString() }, ...prev]
    );

    try {
      let url: string;
      if (currentModel.kind === "gemini") {
        url = await generateGeminiImage(currentPrompt, currentRatio);
      } else if (currentModel.kind === "comfy") {
        const result = await generateComfyImage({
          prompt: currentPrompt,
          ratio: currentRatio,
          checkpoint: currentModel.checkpoint!,
          steps: currentModel.steps!,
        });
        url = result.url;
      } else {
        url = await generatePollinationsImage(currentPrompt, currentRatio);
      }
      updateItem(id, { status: "done", url, fresh: true });
      save(id, currentPrompt, currentModel, currentRatio, currentTag, { dataUrl: url });
    } catch (err) {
      const message = toErrorMessage(err);
      updateItem(id, { status: "error", error: message });
      logError({
        prompt: currentPrompt,
        modelId: currentModel.id,
        modelLabel: currentModel.label,
        ratio: currentRatio,
        message,
      });
    }
  }

  const pendingCount = items.filter((it) => it.status === "loading").length;
  // Hero mode: composer sits in the middle of the screen until the first
  // generation of this visit, then glides up and the gallery takes over.
  const hero = !started;

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-6 pb-10">
      <section
        className={cn(
          "flex flex-col items-center justify-center transition-[min-height,padding] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
          // With history, leave ~9rem so the first gallery row peeks in and
          // makes it obvious there is more below.
          hero
            ? items.length > 0
              ? "min-h-[calc(100dvh-12.5rem)] py-10"
              : "min-h-[calc(100dvh-3.5rem)] py-10"
            : "min-h-0 pt-6 pb-8"
        )}
      >
        <div
          className={cn(
            "grid w-full transition-[grid-template-rows,opacity,margin] duration-500 ease-out",
            hero ? "mb-7 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Ne oluşturalım?</h1>
            <p className="text-muted-foreground mt-2 text-sm">Bir sahne anlat, modeli ve oranı seç, gerisini IGOR halletsin.</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleGenerate();
          }}
          className="bg-card ring-foreground/10 focus-within:ring-primary/40 w-full max-w-4xl rounded-lg shadow-lg shadow-black/20 ring-1 transition-shadow"
        >
          <textarea
            placeholder="Ne oluşturmak istersin? Enter ile oluştur, Shift+Enter yeni satır."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            rows={3}
            className="placeholder:text-muted-foreground thin-scrollbar block max-h-60 min-h-24 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base outline-none [field-sizing:content]"
          />
          <div className="border-border/60 flex flex-wrap items-center gap-2 border-t p-2.5">
            <Select value={modelId} onValueChange={(v) => v && setModelId(v)}>
              <SelectTrigger className="w-64" aria-label="Model">
                <SelectValue>{(v: string) => MODELS.find((m) => m.id === v)?.label ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent className="w-[22rem] max-w-[90vw]">
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex w-full flex-col items-start gap-1 py-0.5">
                      <span className="truncate text-sm">{m.label}</span>
                      <Badge variant={m.kind === "gemini" ? "secondary" : "default"} className="text-[10px]">
                        {m.badge}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <RatioPicker compact label="Oran" options={RATIO_OPTIONS} value={ratio} onChange={(v) => setRatio(v as Ratio)} />

            <TagInput compact value={tag} onChange={setTag} suggestions={allTags} />

            <div className="ml-auto flex items-center gap-3">
              {pendingCount > 0 && (
                <span className="text-muted-foreground animate-in fade-in flex items-center gap-1.5 text-xs">
                  <Loader2 className="text-primary size-3.5 animate-spin" />
                  {pendingCount} üretiliyor
                </span>
              )}
              <Button type="submit" disabled={!prompt.trim()}>
                <Sparkles data-icon="inline-start" />
                Oluştur
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex w-full max-w-4xl flex-wrap justify-center gap-1.5">
          {PRESET_PROMPTS.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => setPrompt(text)}
              className="border-border text-muted-foreground hover:text-foreground hover:bg-muted max-w-64 truncate rounded-md border px-2.5 py-1 text-xs transition-colors"
              title={text}
            >
              {text}
            </button>
          ))}
          {recentPrompts
            .filter((p, i, all) => !PRESET_PROMPTS.includes(p.text) && all.findIndex((x) => x.text === p.text) === i)
            .slice(0, 6)
            .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPrompt(p.text)}
              className="bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted max-w-64 truncate rounded-md px-2.5 py-1 text-xs transition-colors"
              title={p.text}
            >
              {p.text}
            </button>
          ))}
        </div>

        {hero && items.length > 0 && (
          <button
            type="button"
            onClick={() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="text-muted-foreground hover:text-foreground animate-in fade-in mt-8 flex flex-col items-center gap-1 text-xs transition-colors duration-700"
          >
            Galerin, {items.length} görsel
            <ChevronDown className="igor-nudge size-4" />
          </button>
        )}
      </section>

      <div ref={galleryRef} className="mb-4 flex scroll-mt-20 flex-wrap items-center gap-x-4 gap-y-2">
        {items.length > 0 && (
          <h2 className="flex items-baseline gap-2 text-sm font-semibold">
            Galeri <span className="text-muted-foreground text-xs font-normal">{visibleItems.length} görsel</span>
          </h2>
        )}
        <TagFilter tags={allTags} active={filterTag} onChange={setFilterTag} />
      </div>

      {hero && items.length === 0 ? null : visibleItems.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center py-24 text-center text-sm">
          {items.length === 0 ? "Galerin burada görünecek." : "Bu etikette henüz görsel yok."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {visibleItems.map((item) => (
            <GalleryTile
              key={item.id}
              item={item}
              onOpen={() => item.status === "done" && setSelected(item)}
              onImgError={() =>
                updateItem(item.id, {
                  status: "error",
                  error: "Görsel üretilemedi.",
                })
              }
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="thin-scrollbar max-h-[92vh] max-w-6xl overflow-x-hidden overflow-y-auto">
          <DialogTitle className="sr-only">{selected?.prompt}</DialogTitle>
          {selected && (
            <div className="flex min-w-0 flex-col gap-3">
              <FitImage src={selected.url ?? ""} alt={selected.prompt} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{selected.model.label}</Badge>
                <Badge variant="secondary">{selected.ratio}</Badge>
                {selected.tag && <Badge variant="secondary">#{selected.tag}</Badge>}
                <div className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => selected.url && setFullscreenUrl(selected.url)}
                    className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Tam ekran
                  </button>
                  {selected.savedUrl ? (
                    <a
                      href={selected.savedUrl}
                      download
                      className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                    >
                      İndir
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">Kaydediliyor...</span>
                  )}
                  {selected.savedId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(selected)}
                      className="text-destructive text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
              <p className="text-muted-foreground text-sm">{selected.prompt}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {fullscreenUrl && (
        <FullscreenViewer
          src={fullscreenUrl}
          alt={selected?.prompt ?? ""}
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </main>
  );
}

function GalleryTile({
  item,
  onOpen,
  onImgError,
  onDelete,
}: {
  item: GalleryItem;
  onOpen: () => void;
  onImgError: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-muted ring-foreground/5 group animate-in fade-in zoom-in-95 relative aspect-square overflow-hidden rounded-md ring-1 duration-500">
      <button type="button" onClick={onOpen} className="block h-full w-full text-left">
        {item.url && (
          <span className={cn("block h-full w-full", item.fresh && "igor-reveal")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.prompt}
              onError={onImgError}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </span>
        )}

        {item.tag && (
          <span className="bg-background/90 absolute top-2 left-2 max-w-[80%] truncate rounded-sm px-1.5 py-0.5 text-xs">
            #{item.tag}
          </span>
        )}

        {item.status === "loading" && (
          <div className="absolute inset-0 overflow-hidden">
            <div className="bg-primary/30 igor-glow absolute top-1/2 left-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
            <div className="igor-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            <div className="relative flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
              <span className="text-sm font-medium">Üretiliyor</span>
              {item.startedAt && <ElapsedTimer since={item.startedAt} />}
              <p className="text-muted-foreground mt-1 line-clamp-2 max-w-[85%] text-xs">{item.prompt}</p>
            </div>
            <div className="bg-foreground/10 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
              <div className="bg-primary igor-indeterminate absolute inset-y-0 w-[35%]" />
            </div>
          </div>
        )}

        {item.status === "done" && (
          <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/80 to-transparent p-3 transition-transform duration-200 group-hover:translate-y-0">
            <p className="line-clamp-2 text-xs text-white">{item.prompt}</p>
          </div>
        )}
      </button>

      {item.status === "error" && !item.url && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
          <span className="text-destructive line-clamp-4 text-xs break-words">{item.error}</span>
          <Link href="/debug" className="text-primary text-xs underline-offset-4 hover:underline">
            Hatalar sayfasında gör
          </Link>
        </div>
      )}

      {item.status === "done" && (item.savedUrl || item.savedId) && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {item.savedUrl && (
            <a
              href={item.savedUrl}
              download
              onClick={(e) => e.stopPropagation()}
              className="bg-background/90 text-foreground rounded-sm px-2 py-1 text-xs font-medium shadow"
            >
              İndir
            </a>
          )}
          {item.savedId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="bg-background/90 text-destructive rounded-sm px-2 py-1 text-xs font-medium shadow"
            >
              Sil
            </button>
          )}
        </div>
      )}
    </div>
  );
}
