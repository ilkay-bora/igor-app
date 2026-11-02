"use client";

import { cn } from "@/lib/utils";

export type RatioOption = {
  value: string;
  /** Short name shown under the shape, e.g. "Dikey". */
  name: string;
  /** Secondary line, e.g. "9:16 · 720×1280". */
  detail: string;
  w: number;
  h: number;
};

/** Segmented picker that draws each aspect ratio as a small frame. */
export function RatioPicker({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: RatioOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <span className="text-muted-foreground block text-xs">{label}</span>}
      <div role="radiogroup" aria-label={label} className="bg-muted/60 inline-flex gap-1 rounded-xl p-1">
        {options.map((o) => {
          const selected = o.value === value;
          const scale = 22 / Math.max(o.w, o.h);
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex min-w-20 flex-col items-center gap-1.5 rounded-lg px-3 py-2 transition-colors",
                selected ? "bg-background text-foreground shadow-sm ring-1 ring-white/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex h-6 items-center justify-center">
                <span
                  className={cn("block rounded-[3px] border-2", selected ? "border-primary bg-primary/15" : "border-current")}
                  style={{ width: Math.round(o.w * scale), height: Math.round(o.h * scale) }}
                />
              </span>
              <span className="text-xs leading-none font-semibold">{o.name}</span>
              <span className="text-[10px] leading-none opacity-70">{o.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
