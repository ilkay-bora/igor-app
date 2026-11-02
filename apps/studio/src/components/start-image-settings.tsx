"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SERVER_IMAGE_MODELS, START_IMAGE_STEP_OPTIONS } from "@/lib/providers";

// Reused wherever a start/reference image gets generated server-side
// (video single/project scenes).
export function StartImageSettings({
  provider,
  onProviderChange,
  steps,
  onStepsChange,
}: {
  provider: string;
  onProviderChange: (v: string) => void;
  steps: number;
  onStepsChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="min-w-56 space-y-1.5">
        <span className="text-muted-foreground text-xs">Başlangıç görseli sağlayıcısı</span>
        <Select value={provider} onValueChange={(v) => v && onProviderChange(v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-[22rem] max-w-[90vw]">
            {SERVER_IMAGE_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {provider === "comfy-flux-schnell" && (
        <div className="min-w-44 space-y-1.5">
          <span className="text-muted-foreground text-xs">Kalite</span>
          <Select value={String(steps)} onValueChange={(v) => v && onStepsChange(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {START_IMAGE_STEP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
