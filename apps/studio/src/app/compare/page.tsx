"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { RatioPicker } from "@/components/ratio-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FitImage } from "@/components/fit-image";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import {
  RATIO_OPTIONS,
  type Ratio,
  deleteGeneration,
  generateGeminiImage,
  generatePollinationsImage,
  generateComfyImage,
  logError,
  logPrompt,
  persistImage,
  toErrorMessage,
} from "@/lib/providers";

type Status = "idle" | "loading" | "done" | "error";
type ProviderState = {
  status: Status;
  url?: string;
  savedUrl?: string;
  savedId?: string;
  error?: string;
};

const IDLE: ProviderState = { status: "idle" };

export default function ComparePage() {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<Ratio>("1:1");
  const [gemini, setGemini] = useState<ProviderState>(IDLE);
  const [pollinations, setPollinations] = useState<ProviderState>(IDLE);
  const [local, setLocal] = useState<ProviderState>(IDLE);
  const [zoomed, setZoomed] = useState<{ title: string; url: string } | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  function handleDelete(state: ProviderState, setState: (s: ProviderState) => void) {
    if (!state.savedId) return;
    if (!window.confirm("Bu görseli silmek istediğine emin misin?")) return;
    deleteGeneration(state.savedId)
      .then(() => setState({ status: "idle" }))
      .catch((err) => console.error("Görsel silinemedi:", err));
  }

  function runGemini(currentPrompt: string, currentRatio: Ratio) {
    setGemini({ status: "loading" });
    generateGeminiImage(currentPrompt, currentRatio)
      .then((url) => {
        setGemini({ status: "done", url });
        persistImage({
          prompt: currentPrompt,
          modelId: "gemini",
          modelLabel: "Gemini (Nano Banana)",
          ratio: currentRatio,
          dataUrl: url,
        })
          .then((saved) => setGemini((s) => ({ ...s, savedUrl: saved.url, savedId: saved.id })))
          .catch((err) => console.error("Görsel kaydedilemedi:", err));
      })
      .catch((err) => {
        const message = toErrorMessage(err);
        setGemini({ status: "error", error: message });
        logError({
          prompt: currentPrompt,
          modelId: "gemini",
          modelLabel: "Gemini (Nano Banana)",
          ratio: currentRatio,
          message,
        });
      });
  }

  function runPollinations(currentPrompt: string, currentRatio: Ratio) {
    setPollinations({ status: "loading" });
    generatePollinationsImage(currentPrompt, currentRatio)
      .then((url) => {
        setPollinations({ status: "done", url });
        persistImage({
          prompt: currentPrompt,
          modelId: "pollinations",
          modelLabel: "Pollinations.ai",
          ratio: currentRatio,
          dataUrl: url,
        })
          .then((saved) => setPollinations((s) => ({ ...s, savedUrl: saved.url, savedId: saved.id })))
          .catch((err) => console.error("Görsel kaydedilemedi:", err));
      })
      .catch((err) => {
        const message = toErrorMessage(err);
        setPollinations({ status: "error", error: message });
        logError({
          prompt: currentPrompt,
          modelId: "pollinations",
          modelLabel: "Pollinations.ai",
          ratio: currentRatio,
          message,
        });
      });
  }

  function runLocal(currentPrompt: string, currentRatio: Ratio) {
    setLocal({ status: "loading" });
    generateComfyImage({
      prompt: currentPrompt,
      ratio: currentRatio,
      checkpoint: "flux1-schnell-fp8.safetensors",
      steps: 4,
    })
      .then(({ url }) => {
        setLocal({ status: "done", url });
        persistImage({
          prompt: currentPrompt,
          modelId: "comfy-flux-schnell",
          modelLabel: "ComfyUI (Yerel) FLUX schnell",
          ratio,
          dataUrl: url,
        })
          .then((saved) => setLocal((s) => ({ ...s, savedUrl: saved.url, savedId: saved.id })))
          .catch((err) => console.error("Görsel kaydedilemedi:", err));
      })
      .catch((err) => {
        const message = toErrorMessage(err);
        setLocal({ status: "error", error: message });
        logError({
          prompt: currentPrompt,
          modelId: "comfy-flux-schnell",
          modelLabel: "ComfyUI (Yerel) FLUX schnell",
          ratio,
          message,
        });
      });
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    logPrompt(prompt);
    runGemini(prompt, ratio);
    runPollinations(prompt, ratio);
    runLocal(prompt, ratio);
  }

  return (
    // Fills exactly one window: composer on top, the three results share the
    // remaining height and each image is contained inside its own frame.
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1800px] flex-col gap-4 overflow-hidden px-6 py-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Karşılaştır</h1>
          <p className="text-muted-foreground mt-0.5 truncate text-sm">
            Aynı prompt üç modelde aynı anda denenir, sonuçlar yan yana çıkar ve otomatik kaydedilir.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
        className="bg-card ring-foreground/10 focus-within:ring-primary/40 shrink-0 rounded-lg ring-1 transition-shadow"
      >
        <textarea
          placeholder="Ne oluşturmak istersin? Enter ile üç modelde birden üret."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          rows={2}
          className="placeholder:text-muted-foreground thin-scrollbar block max-h-32 min-h-16 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base outline-none [field-sizing:content]"
        />
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <RatioPicker compact label="Oran" options={RATIO_OPTIONS} value={ratio} onChange={(v) => setRatio(v as Ratio)} />
          <Button type="submit" disabled={!prompt.trim()} className="ml-auto">
            <Sparkles data-icon="inline-start" />
            Hepsini Üret
          </Button>
        </div>
      </form>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <ProviderCard
          title="Gemini (Nano Banana)"
          description="En yüksek kalite, ama Ayarlar'da Gemini API anahtarı ister."
          badge="API key gerekli"
          badgeVariant="secondary"
          state={gemini}
          onOpen={() => gemini.url && setZoomed({ title: "Gemini (Nano Banana)", url: gemini.url })}
          onRetry={() => runGemini(prompt, ratio)}
          onDelete={() => handleDelete(gemini, setGemini)}
        />
        <ProviderCard
          title="Pollinations.ai"
          description="Sunucu tarafında kendi Pollinations API key'inle çalışır."
          badge="API key gerekli"
          badgeVariant="default"
          state={pollinations}
          onOpen={() =>
            pollinations.url && setZoomed({ title: "Pollinations.ai", url: pollinations.url })
          }
          onRetry={() => runPollinations(prompt, ratio)}
          onDelete={() => handleDelete(pollinations, setPollinations)}
        />
        <ProviderCard
          title="ComfyUI (Yerel) FLUX schnell"
          description="Kendi GPU'nda çalışır, key gerekmez, limitsiz."
          badge="Yerel"
          badgeVariant="default"
          state={local}
          onOpen={() => local.url && setZoomed({ title: "ComfyUI (Yerel) FLUX schnell", url: local.url })}
          onRetry={() => runLocal(prompt, ratio)}
          onDelete={() => handleDelete(local, setLocal)}
        />
      </div>

      <Dialog open={!!zoomed} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-x-hidden overflow-y-auto">
          <DialogTitle>{zoomed?.title}</DialogTitle>
          {zoomed && <FitImage src={zoomed.url} alt={zoomed.title} />}
          {zoomed && (
            <button
              type="button"
              onClick={() => setFullscreenUrl(zoomed.url)}
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              Tam ekran
            </button>
          )}
        </DialogContent>
      </Dialog>

      {fullscreenUrl && (
        <FullscreenViewer
          src={fullscreenUrl}
          alt={zoomed?.title ?? ""}
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </main>
  );
}

function ProviderCard({
  title,
  description,
  badge,
  badgeVariant,
  state,
  onOpen,
  onRetry,
  onDelete,
}: {
  title: string;
  description: string;
  badge: string;
  badgeVariant: "default" | "secondary";
  state: ProviderState;
  onOpen?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  return (
    <section className="bg-card ring-foreground/10 flex min-h-0 flex-col gap-3 rounded-lg p-3 ring-1">
      <div className="flex items-start justify-between gap-2 px-1 pt-0.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="text-muted-foreground truncate text-xs">{description}</p>
        </div>
        <Badge variant={badgeVariant}>{badge}</Badge>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="bg-muted relative min-h-0 w-full flex-1 overflow-hidden rounded-md">
          <button
            type="button"
            onClick={onOpen}
            disabled={state.status !== "done"}
            className="flex h-full w-full items-center justify-center text-left disabled:cursor-default"
          >
            {state.status === "idle" && (
              <span className="text-muted-foreground px-4 text-center text-sm">
                Prompt gir ve &quot;Hepsini Üret&quot;e bas
              </span>
            )}
            {state.status === "loading" && !state.url && (
              <span className="absolute inset-0 overflow-hidden">
                <span className="bg-primary/30 igor-glow absolute top-1/2 left-1/2 size-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
                <span className="igor-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                <span className="relative flex h-full items-center justify-center text-sm font-medium">Üretiliyor</span>
                <span className="bg-foreground/10 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
                  <span className="bg-primary igor-indeterminate absolute inset-y-0 w-[35%]" />
                </span>
              </span>
            )}
            {state.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.url} alt={title} className="igor-reveal absolute inset-0 h-full w-full object-contain" />
            )}
            {state.status === "loading" && state.url && (
              <div className="bg-background/60 absolute inset-0 flex items-center justify-center">
                <span className="text-sm animate-pulse">Yükleniyor...</span>
              </div>
            )}
            {state.status === "done" && (
              <span className="bg-background/80 absolute bottom-2 left-2 rounded-sm px-2 py-0.5 text-[11px]">
                Yakınlaştır
              </span>
            )}
          </button>

          {state.status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="text-destructive line-clamp-4 text-xs break-words">
                {state.error}
              </span>
              <div className="flex items-center gap-3">
                {onRetry && (
                  <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                    Tekrar dene
                  </Button>
                )}
                <Link
                  href="/debug"
                  className="text-primary text-xs underline-offset-4 hover:underline"
                >
                  Hatalar sayfasında gör
                </Link>
              </div>
            </div>
          )}
        </div>
        {state.status === "done" && (
          <div className="flex shrink-0 items-center justify-end gap-3 px-1">
            {state.savedUrl ? (
              <a
                href={state.savedUrl}
                download
                className="text-primary text-sm font-medium underline-offset-4 hover:underline"
              >
                İndir
              </a>
            ) : (
              <span className="text-muted-foreground text-xs">Kaydediliyor...</span>
            )}
            {state.savedId && (
              <button
                type="button"
                onClick={onDelete}
                className="text-destructive text-sm font-medium underline-offset-4 hover:underline"
              >
                Sil
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
