"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { gabarito } from "@/lib/fonts";
import { t } from "@/lib/i18n";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(value: string) {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("Giriş başarısız"));
      setLoading(false);
      return;
    }

    router.push(searchParams.get("next") || "/");
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    signIn(token);
  }

  // The sign-in link printed by the dev server carries the token, so opening
  // it signs in without typing anything.
  const autoTried = useRef(false);
  useEffect(() => {
    const fromLink = searchParams.get("token");
    if (!fromLink || autoTried.current) return;
    autoTried.current = true;
    setToken(fromLink);
    signIn(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <h1 className={`text-2xl font-bold ${gabarito.className}`}>{t("IGOR")}</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder={t("Erişim token'ı")}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              className="border-input bg-transparent focus-visible:ring-ring/50 focus-visible:border-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3"
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <p className="text-muted-foreground text-xs">
              {t("Token, sunucu açılırken terminale basılan giriş linkinde ve")}{" "}
              <code>{t("apps/studio/data/local-token")}</code> {t("dosyasında.")}
            </p>
            <Button type="submit" disabled={!token || loading}>
              {loading ? t("Kontrol ediliyor...") : t("Giriş yap")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
