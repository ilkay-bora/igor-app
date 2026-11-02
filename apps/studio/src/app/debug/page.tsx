"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { type ErrorEntry, clearErrors, fetchErrors } from "@/lib/providers";

export default function DebugPage() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetchErrors()
      .then(setErrors)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchErrors()
      .then(setErrors)
      .finally(() => setLoading(false));
  }, []);

  async function handleClear() {
    if (!window.confirm("Tüm hata kayıtlarını silmek istediğine emin misin?")) return;
    await clearErrors();
    setErrors([]);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Hatalar</h1>
          <p className="text-muted-foreground text-sm">
            Görsel üretimi başarısız olduğunda (yeniden deneme sonrası da) tam hata metni burada
            kayıtlı kalır.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            Yenile
          </Button>
          {errors.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Temizle
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <p className="text-muted-foreground text-sm">Yükleniyor...</p>
      ) : errors.length === 0 ? (
        <p className="text-muted-foreground text-sm">Hiç hata kaydı yok.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {errors.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-2 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{e.modelLabel}</Badge>
                  <Badge variant="secondary">{e.ratio}</Badge>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {new Date(e.createdAt).toLocaleString("tr-TR")}
                  </span>
                </div>
                {e.prompt && (
                  <p className="text-muted-foreground text-sm">
                    <span className="font-medium">Prompt:</span> {e.prompt}
                  </p>
                )}
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap break-words">
                  {e.message}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
