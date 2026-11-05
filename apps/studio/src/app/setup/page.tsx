"use client";

import { useRouter } from "next/navigation";
import { SettingsForm } from "@/components/settings-form";
import { gabarito } from "@/lib/fonts";
import { t } from "@/lib/i18n";

export default function SetupPage() {
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <div className="mb-8">
        <span className={`text-4xl leading-none font-black tracking-tight uppercase ${gabarito.className}`}>IGOR</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("Hoş geldin, kurulumu birlikte yapalım")}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          {t("Hepsi opsiyonel. Bulut modelleri için kendi anahtarını gir, yerel üretim için ComfyUI klasörünü göster. Bunları daha sonra istediğin zaman Ayarlar sayfasından değiştirebilirsin.")}
        </p>
      </div>
      <SettingsForm mode="setup" onDone={() => router.replace("/")} />
    </main>
  );
}
