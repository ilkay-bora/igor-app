"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Eye, EyeOff, Loader2, Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Source = "saved" | "env" | "default" | "none";
type SecretView = { set: boolean; source: Source; hint: string };
type PlainView = { value: string; source: Source };
export type SettingsView = {
  geminiApiKey: SecretView;
  pollinationsApiKey: SecretView;
  comfyuiDir: PlainView;
  comfyuiUrl: PlainView;
  setupDone: boolean;
  comfy: { running: boolean; dir: string; dirValid: boolean; ownedByIgor: boolean };
};

const SOURCE_LABEL: Record<Source, string> = {
  saved: "kayıtlı",
  env: ".env dosyasından",
  default: "varsayılan",
  none: "",
};

const inputClass =
  "border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full min-w-0 rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-3 dark:bg-input/20";

export function useSettings() {
  const [data, setData] = useState<SettingsView | null>(null);
  const reload = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setData(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return { data, setData, reload };
}

/**
 * Shared by the first-run /setup screen and /settings. Secret fields start
 * empty: typing replaces the stored key, leaving them empty keeps it.
 */
export function SettingsForm({
  mode,
  onDone,
}: {
  mode: "setup" | "settings";
  onDone?: () => void;
}) {
  const { data, setData } = useSettings();
  const [gemini, setGemini] = useState("");
  const [pollinations, setPollinations] = useState("");
  const [comfyDir, setComfyDir] = useState<string | null>(null);
  const [comfyUrl, setComfyUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
        <Loader2 className="size-4 animate-spin" /> Ayarlar yükleniyor
      </div>
    );
  }

  const dirty =
    gemini.trim() !== "" ||
    pollinations.trim() !== "" ||
    (comfyDir !== null && comfyDir !== data.comfyuiDir.value) ||
    (comfyUrl !== null && comfyUrl !== data.comfyuiUrl.value);

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...extra };
      if (gemini.trim()) body.geminiApiKey = gemini;
      if (pollinations.trim()) body.pollinationsApiKey = pollinations;
      if (comfyDir !== null) body.comfyuiDir = comfyDir;
      if (comfyUrl !== null) body.comfyuiUrl = comfyUrl;
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Kaydedilemedi (HTTP ${res.status})`);
      setData(await res.json());
      setGemini("");
      setPollinations("");
      setComfyDir(null);
      setComfyUrl(null);
      setSavedAt(Date.now());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function clearKey(key: "geminiApiKey" | "pollinationsApiKey") {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: "" }),
    });
    if (res.ok) setData(await res.json());
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Gemini"
        description="Gemini görsel modeli ve Seslendirme sayfası bu anahtarı kullanır. Google AI Studio'dan ücretsiz alınabilir."
        badge="Opsiyonel"
      >
        <SecretField
          label="API anahtarı"
          value={gemini}
          onChange={setGemini}
          view={data.geminiApiKey}
          getUrl="https://aistudio.google.com/apikey"
          onClear={data.geminiApiKey.source === "saved" ? () => clearKey("geminiApiKey") : undefined}
          testable
        />
      </Section>

      <Section
        title="Pollinations"
        description="Ücretsiz bulut görsel modeli. Anahtarsız da çalışır, anahtarla daha hızlı ve güvenilir olur."
        badge="Opsiyonel"
      >
        <SecretField
          label="API anahtarı"
          value={pollinations}
          onChange={setPollinations}
          view={data.pollinationsApiKey}
          getUrl="https://enter.pollinations.ai"
          onClear={data.pollinationsApiKey.source === "saved" ? () => clearKey("pollinationsApiKey") : undefined}
        />
      </Section>

      <Section
        title="Yerel ComfyUI"
        description="Kendi ekran kartında ücretsiz görsel ve video üretimi için. IGOR gerektiğinde arka planda, pencere açmadan başlatır."
      >
        <div className="flex flex-col gap-3">
          <Field label="ComfyUI klasörü" hint="main.py ve venv klasörünün bulunduğu yer">
            <input
              className={inputClass}
              value={comfyDir ?? data.comfyuiDir.value}
              onChange={(e) => setComfyDir(e.target.value)}
              placeholder="E:\ComfyUI"
              spellCheck={false}
            />
          </Field>
          <Field label="Adres" hint="Genelde değiştirmen gerekmez">
            <input
              className={inputClass}
              value={comfyUrl ?? data.comfyuiUrl.value}
              onChange={(e) => setComfyUrl(e.target.value)}
              placeholder="http://127.0.0.1:8188"
              spellCheck={false}
            />
          </Field>
          <ComfyControls
            status={data.comfy}
            onChange={(comfy) => setData({ ...data, comfy })}
            disabled={dirty}
          />
          <Link href="/settings/comfyui" className="text-primary inline-flex w-fit items-center gap-1 text-xs hover:underline">
            ComfyUI kurulu değil mi? Adım adım kurulum rehberi <ArrowRight className="size-3" />
          </Link>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {error && <span className="text-destructive text-sm">{error}</span>}
        {!error && savedAt && !dirty && mode === "settings" && (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Check className="size-4 text-emerald-500" /> Kaydedildi
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {mode === "setup" ? (
            <>
              <Button variant="ghost" onClick={async () => (await save({ setupDone: true })) && onDone?.()} disabled={saving}>
                Şimdilik atla
              </Button>
              <Button onClick={async () => (await save({ setupDone: true })) && onDone?.()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Kurulumu tamamla
              </Button>
            </>
          ) : (
            <Button onClick={() => save()} disabled={saving || !dirty}>
              {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Kaydet
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card ring-foreground/10 grid gap-4 rounded-lg p-5 ring-1 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {badge && <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium">{badge}</span>}
        </div>
        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
  view,
  getUrl,
  onClear,
  testable,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  view: SecretView;
  getUrl: string;
  onClear?: () => void;
  testable?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | "running" | null>(null);

  async function runTest() {
    setTest("running");
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: value }),
    });
    setTest(await res.json());
  }

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        hint={view.set ? `•••• ${view.hint} ${SOURCE_LABEL[view.source]}` : "girilmemiş"}
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type={show ? "text" : "password"}
              className={cn(inputClass, "pr-9", value && "font-mono")}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                setTest(null);
              }}
              placeholder={view.set ? "Değiştirmek için yeni anahtarı yapıştır" : "Anahtarı yapıştır"}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Gizle" : "Göster"}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-9 items-center justify-center"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {testable && (
            <Button variant="outline" onClick={runTest} disabled={test === "running" || (!value.trim() && !view.set)}>
              {test === "running" && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Test et
            </Button>
          )}
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <a href={getUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
          Anahtar al <ExternalLink className="size-3" />
        </a>
        {onClear && (
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-destructive">
            Kayıtlı anahtarı sil
          </button>
        )}
        {test && test !== "running" && (
          <span className={cn("inline-flex items-center gap-1", test.ok ? "text-emerald-500" : "text-destructive")}>
            {test.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            {test.message}
          </span>
        )}
      </div>
    </div>
  );
}

function ComfyControls({
  status,
  onChange,
  disabled,
}: {
  status: SettingsView["comfy"];
  onChange: (s: SettingsView["comfy"]) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "start" | "stop") {
    setBusy(action);
    setError(null);
    const res = await fetch("/api/settings/comfy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.error) setError(data.error);
    onChange({ running: data.running, dir: data.dir, dirValid: data.dirValid, ownedByIgor: data.ownedByIgor });
    setBusy(null);
  }

  const state = !status.dirValid ? "missing" : status.running ? "running" : "stopped";
  return (
    <div className="border-border/60 flex flex-wrap items-center gap-3 border-t pt-3">
      <span className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            "size-2 rounded-full",
            state === "running" ? "bg-emerald-500" : state === "stopped" ? "bg-muted-foreground" : "bg-destructive"
          )}
        />
        {state === "running" ? "Çalışıyor" : state === "stopped" ? "Kapalı, gerektiğinde otomatik başlar" : "Bu klasörde ComfyUI bulunamadı"}
      </span>
      <div className="ml-auto flex gap-2">
        {state === "stopped" && (
          <Button variant="outline" size="sm" onClick={() => act("start")} disabled={!!busy || disabled}>
            {busy === "start" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {busy === "start" ? "Başlatılıyor" : "Başlat"}
          </Button>
        )}
        {state === "running" && status.ownedByIgor && (
          <Button variant="outline" size="sm" onClick={() => act("stop")} disabled={!!busy}>
            {busy === "stop" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Square data-icon="inline-start" />}
            Durdur ve belleği boşalt
          </Button>
        )}
      </div>
      {disabled && state === "stopped" && <p className="text-muted-foreground w-full text-xs">Başlatmadan önce değişiklikleri kaydet.</p>}
      {error && <p className="text-destructive w-full text-xs">{error}</p>}
    </div>
  );
}
