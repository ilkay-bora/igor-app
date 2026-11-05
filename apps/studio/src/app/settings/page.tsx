import { SettingsForm } from "@/components/settings-form";
import { tServer } from "@/lib/i18n-server";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{tServer("Ayarlar")}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        {tServer("Anahtarlar sadece bu bilgisayarda, uygulamanın kendi klasöründe saklanır.")}
      </p>
      <SettingsForm mode="settings" />
    </main>
  );
}
