"use client";

import { cn } from "@/lib/utils";

import { t } from "@/lib/i18n";
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
  compact,
}: {
  options: RatioOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  /** Single-row variant for toolbars: shape + name, detail as tooltip. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div role="radiogroup" aria-label={label ?? t("Oran")} className={cn("bg-muted/60 inline-flex h-9 items-stretch gap-0.5 rounded-md p-0.5", className)}>
        {options.map((o) => {
          const selected = o.value === value;
          const scale = 14 / Math.max(o.w, o.h);
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={t(o.detail)}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-semibold transition-colors",
                selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn("block rounded-[2px] border-[1.5px]", selected ? "border-primary bg-primary/15" : "border-current")}
                style={{ width: Math.round(o.w * scale), height: Math.round(o.h * scale) }}
              />
              {t(o.name)}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <span className="text-muted-foreground block text-xs">{label}</span>}
      <div role="radiogroup" aria-label={label} className="bg-muted/60 inline-flex gap-1 rounded-md p-1">
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
                "flex min-w-20 flex-col items-center gap-1.5 rounded-[5px] px-3 py-2 transition-colors",
                selected ? "bg-background text-foreground shadow-sm ring-1 ring-white/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex h-6 items-center justify-center">
                <span
                  className={cn("block rounded-[3px] border-2", selected ? "border-primary bg-primary/15" : "border-current")}
                  style={{ width: Math.round(o.w * scale), height: Math.round(o.h * scale) }}
                />
              </span>
              <span className="text-xs leading-none font-semibold">{t(o.name)}</span>
              <span className="text-[10px] leading-none opacity-70">{t(o.detail)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
