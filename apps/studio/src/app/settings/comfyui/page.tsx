"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Circle, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODEL_GROUPS } from "@/lib/comfy-models";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Status = { running: boolean; dir: string; dirValid: boolean };
type ModelsView = {
  via: "comfy" | "disk" | "none";
  modelsDir: string | null;
  groups: { id: string; models: { folder: string; file: string; ok: boolean }[] }[];
};

const RELEASES_URL = "https://github.com/comfyanonymous/ComfyUI/releases";

export default function ComfyGuidePage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [models, setModels] = useState<ModelsView | null>(null);
  const [dir, setDir] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const [s, m] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/settings/models", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setStatus(s.comfy);
      setDir((d) => d || s.comfyuiDir.value);
      setModels(m);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/settings/models", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([s, m]) => {
        if (cancelled) return;
        setStatus(s.comfy);
        setDir(s.comfyuiDir.value);
        setModels(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDir() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comfyuiDir: dir }),
    });
    setSaving(false);
    await check();
  }

  const groupOk = (id: string) => models?.groups.find((g) => g.id === id)?.models.every((m) => m.ok) ?? false;
  const stepDone = {
    folder: !!status?.dirValid || !!status?.running,
    models: groupOk("image") || groupOk("video"),
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <Link href="/settings" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" /> {t("Ayarlar")}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("ComfyUI kurulum rehberi")}</h1>
      <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
        {t("ComfyUI, görselleri ve videoları kendi ekran kartında ücretsiz üretmeni sağlar. Sadece Gemini veya Pollinations kullanacaksan buna gerek yok. Kurulum bir kez yapılır, sonrasında IGOR ComfyUI'yi gerektiğinde arka planda kendisi başlatır.")}
      </p>

      <StatusBar status={status} models={models} checking={checking} onCheck={check} />

      <ol className="mt-6 flex flex-col gap-4">
        <Step n={1} title={t("Bilgisayarın uygun mu?")}>
          <ul className="text-muted-foreground grid gap-1.5 text-sm sm:grid-cols-2">
            <li>{t("NVIDIA ekran kartı, en az 8 GB VRAM")}</li>
            <li>{t("16 GB RAM, FLUX dev ve video için 32 GB")}</li>
            <li>{t("Modeller için 60 GB ve üzeri boş disk")}</li>
            <li>{t("Windows 10 veya 11")}</li>
          </ul>
        </Step>

        <Step n={2} title={t("ComfyUI'yi indir ve aç")} done={stepDone.folder}>
          <div className="grid gap-3 md:grid-cols-2">
            <Option title={t("Portable sürüm")} badge={t("Önerilen")}>
              <p>
                {t("GitHub'daki son sürümden")} <Code>{t("ComfyUI_windows_portable_nvidia.7z")}</Code> {t("dosyasını indir.")}
              </p>
              <p>
                <a href="https://www.7-zip.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {t("7-Zip")}
                </a>{" "}
                {t("ile boş yeri bol bir sürücüye çıkar, örneğin")} <Code>{t("E:\\ComfyUI_windows_portable")}</Code>.
              </p>
              <p>
                {t("Bir kez")} <Code>{t("run_nvidia_gpu.bat")}</Code> {t("dosyasına çift tıkla. Pencerede")}{" "}
                <Code>{t("To see the GUI go to")}</Code> {t("yazısını görünce pencereyi kapatabilirsin.")}
              </p>
              <ExtLink href={RELEASES_URL}>{t("GitHub sürümleri")}</ExtLink>
            </Option>
            <Option title={t("Zaten kuruluysa")}>
              <p>
                {t("Git ile kurduysan")} <Code>{t("main.py")}</Code> {t("ve")} <Code>{t("venv")}</Code> {t("klasörünün olduğu klasörü göstermen yeterli.")}
              </p>
              <p>
                {t("ComfyUI Desktop uygulamasını kullanıyorsan IGOR onu başlatamaz. Uygulama açıkken Ayarlar'daki")}{" "}
                <b>{t("Adres")}</b> {t("alanına onun adresini yaz, genelde")} <Code>{t("http://127.0.0.1:8000")}</Code>.
              </p>
            </Option>
          </div>
        </Step>

        <Step n={3} title={t("Klasörü IGOR'a göster")} done={stepDone.folder}>
          <p className="text-muted-foreground mb-3 text-sm">
            {t("Portable sürümde ana klasörü (")}<Code>{t("ComfyUI_windows_portable")}</Code>{t(") ya da içindeki")} <Code>{t("ComfyUI")}</Code>{" "}
            {t("klasörünü yapıştırabilirsin, ikisi de olur. Gezginde klasöre sağ tıklayıp \"Yol olarak kopyala\" diyebilirsin.")}
          </p>
          <div className="flex gap-2">
            <input
              value={dir}
              onChange={(e) => setDir(e.target.value.replace(/^"|"$/g, ""))}
              placeholder={t("E:\\ComfyUI_windows_portable")}
              spellCheck={false}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring dark:bg-input/20 h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none"
            />
            <Button onClick={saveDir} disabled={saving || !dir.trim()}>
              {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {t("Kaydet ve kontrol et")}
            </Button>
          </div>
          {status && (
            <p className={cn("mt-2 flex items-center gap-1.5 text-xs", status.dirValid ? "text-emerald-500" : "text-muted-foreground")}>
              {status.dirValid ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              {status.dirValid ? t("ComfyUI bu klasörde bulundu.") : t("Bu klasörde ComfyUI bulunamadı.")}
            </p>
          )}
        </Step>

        <Step n={4} title={t("Modelleri indir")} done={stepDone.models}>
          <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
            {t("Her dosyayı ComfyUI klasöründeki")} <Code>{t("models")}</Code> {t("içinde yanında yazan alt klasöre koy")}
            {models?.modelsDir && (
              <>
                {" "}
                (<Code>{models.modelsDir}</Code>)
              </>
            )}
            {t(". Sadece kullanacağın grubu indirmen yeterli. Dosya adları birebir aynı olmalı.")}
          </p>
          <div className="flex flex-col gap-3">
            {MODEL_GROUPS.map((g) => {
              const view = models?.groups.find((x) => x.id === g.id);
              const all = view?.models.every((m) => m.ok);
              return (
                <div key={g.id} className="border-border/70 rounded-md border">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{t(g.title)}</h3>
                        {g.optional && <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px]">{t("Opsiyonel")}</span>}
                        {all && <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">{t("Hazır")}</span>}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{t(g.description)}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {g.source.map((s) => (
                        <ExtLink key={s.url} href={s.url}>
                          {t(s.label)}
                        </ExtLink>
                      ))}
                    </div>
                  </div>
                  <ul className="border-border/60 divide-border/60 divide-y border-t">
                    {g.models.map((m) => {
                      const ok = view?.models.find((x) => x.file === m.file && x.folder === m.folder)?.ok;
                      return (
                        <li key={m.folder + m.file} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                          {ok === undefined ? (
                            <Circle className="text-muted-foreground size-3.5 shrink-0" />
                          ) : ok ? (
                            <Check className="size-3.5 shrink-0 text-emerald-500" />
                          ) : (
                            <X className="text-destructive size-3.5 shrink-0" />
                          )}
                          <span className="text-muted-foreground shrink-0 font-mono">{t("models/")}{m.folder}/</span>
                          <span className="min-w-0 truncate font-mono" title={m.file}>
                            {m.file}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Step>

        <Step n={5} title={t("Dene")}>
          <p className="text-muted-foreground text-sm">
            {t("Oluştur sayfasında model olarak")} <b>{t("ComfyUI (Yerel) FLUX schnell")}</b> {t("seç ve bir şey üret. İlk üretimde ComfyUI açılıp model yüklendiği için 1-2 dakika sürebilir, sonrakiler çok daha hızlıdır. Bir sorun olursa")}{" "}
            <Link href="/debug" className="text-primary hover:underline">
              {t("Hatalar")}
            </Link>{" "}
            {t("sayfasına bak.")}
          </p>
        </Step>
      </ol>
    </main>
  );
}

function StatusBar({
  status,
  models,
  checking,
  onCheck,
}: {
  status: Status | null;
  models: ModelsView | null;
  checking: boolean;
  onCheck: () => void;
}) {
  const total = models?.groups.reduce((n, g) => n + g.models.length, 0) ?? 0;
  const ok = models?.groups.reduce((n, g) => n + g.models.filter((m) => m.ok).length, 0) ?? 0;
  const items = [
    { label: t("Klasör"), ok: status?.dirValid, text: status ? (status.dirValid ? t("bulundu") : t("bulunamadı")) : "..." },
    { label: t("Çalışıyor"), ok: status?.running, text: status ? (status.running ? t("evet") : t("hayır, gerekince açılır")) : "..." },
    { label: t("Modeller"), ok: total > 0 && ok === total, text: models ? `${ok} / ${total}` : "..." },
  ];
  return (
    <div className="bg-card ring-foreground/10 mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg px-4 py-3 ring-1">
      {items.map((i) => (
        <span key={t(i.label)} className="flex items-center gap-2 text-sm">
          <span className={cn("size-2 rounded-full", i.ok ? "bg-emerald-500" : "bg-muted-foreground/60")} />
          <span className="text-muted-foreground">{t(i.label)}:</span> {i.text}
        </span>
      ))}
      <Button variant="ghost" size="sm" onClick={onCheck} disabled={checking} className="ml-auto">
        <RefreshCw className={cn(checking && "animate-spin")} data-icon="inline-start" />
        {t("Tekrar kontrol et")}
      </Button>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="bg-card ring-foreground/10 rounded-lg p-5 ring-1">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            done ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-foreground"
          )}
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="pl-9">{children}</div>
    </li>
  );
}

function Option({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="border-border/70 flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        {badge && <span className="bg-primary/15 text-primary rounded-sm px-1.5 py-0.5 text-[10px] font-medium">{badge}</span>}
      </div>
      <div className="text-muted-foreground flex flex-col gap-2 leading-relaxed">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-muted text-foreground rounded-sm px-1 py-0.5 font-mono text-[0.85em] break-all">{children}</code>;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs hover:underline">
      {children} <ExternalLink className="size-3" />
    </a>
  );
}
