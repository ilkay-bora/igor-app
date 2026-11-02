"use client";

import { useEffect, useState } from "react";

export function ElapsedTimer({ since }: { since: string | number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const totalSeconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = minutes > 0 ? `${minutes}dk ${seconds}sn` : `${seconds}sn`;

  return <span className="text-muted-foreground text-xs tabular-nums">{label}</span>;
}
