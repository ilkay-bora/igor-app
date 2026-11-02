"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FitImage } from "@/components/fit-image";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import {
  RATIOS,
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
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Görsel Üretim Karşılaştırma
        </h1>
        <p className="text-muted-foreground text-sm">
          Aynı prompt&apos;u ücretli (API key gerekli) ve ücretsiz alternatiflerde aynı anda
          dener, sonuçları yan yana karşılaştırır. Üretilen her görsel otomatik kaydedilir.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              placeholder="Örn: modern minimalist bir kahve dükkanı afişi, sıcak tonlar"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>En-boy oranı</Label>
              <Select
                value={ratio}
                onValueChange={(value) => value && setRatio(value as Ratio)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleGenerate} disabled={!prompt.trim()}>
              Hepsini Üret
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <ProviderCard
          title="Gemini (Nano Banana)"
          description="En yüksek kalite, ama .env.local'de GEMINI_API_KEY ister."
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
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={badgeVariant}>{badge}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-md">
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
              <span className="text-muted-foreground text-sm animate-pulse">
                Üretiliyor...
              </span>
            )}
            {state.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.url} alt={title} className="h-full w-full object-contain" />
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
          <div className="flex items-center justify-end gap-3">
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
      </CardContent>
    </Card>
  );
}
