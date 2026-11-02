"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Sends a fresh install to /setup once. Checked client-side so the auth
// proxy stays a pure cookie check with no file access.
export function SetupGate() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname === "/setup" || pathname === "/login") return;
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!cancelled && s && !s.setupDone) router.replace("/setup");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only on first mount: no need to re-check on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
