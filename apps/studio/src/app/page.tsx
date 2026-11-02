"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ElapsedTimer } from "@/components/elapsed-timer";
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
      updateItem(id, { status: "done", url });
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

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-6 py-10">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Textarea
            placeholder="Ne oluşturmak istersin? Örn: modern minimalist bir kahve dükkanı afişi, sıcak tonlar"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="resize-none text-base"
          />

          <div className="flex flex-wrap gap-2">
            {PRESET_PROMPTS.map((text) => (
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

          {recentPrompts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recentPrompts.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrompt(p.text)}
                  className="bg-muted hover:bg-accent max-w-64 truncate rounded-full px-3 py-1 text-xs transition-colors"
                  title={p.text}
                >
                  {p.text}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 space-y-1.5">
              <span className="text-muted-foreground text-xs">Model</span>
              <Select value={modelId} onValueChange={(v) => v && setModelId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-[22rem] max-w-[90vw]">
                  {MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex w-full flex-col items-start gap-1 py-0.5">
                        <span className="truncate text-sm">{m.label}</span>
                        <Badge
                          variant={m.kind === "gemini" ? "secondary" : "default"}
                          className="text-[10px]"
                        >
                          {m.badge}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <RatioPicker label="Oran" options={RATIO_OPTIONS} value={ratio} onChange={(v) => setRatio(v as Ratio)} />

            <TagInput value={tag} onChange={setTag} suggestions={allTags} />

            <Button onClick={handleGenerate} disabled={!prompt.trim()} className="ml-auto">
              Oluştur
            </Button>
          </div>
        </CardContent>
      </Card>

      <TagFilter tags={allTags} active={filterTag} onChange={setFilterTag} />

      {visibleItems.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center py-24 text-center text-sm">
          {items.length === 0
            ? 'Henüz görsel üretmedin. Bir model seç, prompt yaz ve "Oluştur"a bas.'
            : "Bu etikette henüz görsel yok."}
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
    <div className="bg-muted group relative aspect-square overflow-hidden rounded-2xl">
      <button type="button" onClick={onOpen} className="block h-full w-full text-left">
        {item.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.prompt}
            onError={onImgError}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        )}

        {item.tag && (
          <span className="bg-background/90 absolute top-2 left-2 max-w-[80%] truncate rounded-full px-2 py-0.5 text-xs">
            #{item.tag}
          </span>
        )}

        {item.status === "loading" && (
          <div className="bg-background/70 absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="text-primary size-6 animate-spin" />
            <span className="text-sm">Üretiliyor...</span>
            {item.startedAt && <ElapsedTimer since={item.startedAt} />}
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
              className="bg-background/90 text-foreground rounded-full px-2 py-1 text-xs font-medium shadow"
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
              className="bg-background/90 text-destructive rounded-full px-2 py-1 text-xs font-medium shadow"
            >
              Sil
            </button>
          )}
        </div>
      )}
    </div>
  );
}
