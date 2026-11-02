import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Themed range slider: thin track filled with the primary color up to the
 * value, white thumb with a primary ring. Drop-in for <input type="range">
 * (same props); the fill is driven by the --fill custom property, styled by
 * `.igor-range` in globals.css.
 */
function Range({ className, style, min = 0, max = 100, value, ...props }: React.ComponentProps<"input">) {
  const lo = Number(min);
  const hi = Number(max);
  const v = Number(value ?? lo);
  const fill = hi > lo ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0;
  return (
    <input
      type="range"
      data-slot="range"
      min={min}
      max={max}
      value={value}
      className={cn("igor-range", className)}
      style={{ ...style, ["--fill" as string]: `${fill}%` }}
      {...props}
    />
  );
}

export { Range };
