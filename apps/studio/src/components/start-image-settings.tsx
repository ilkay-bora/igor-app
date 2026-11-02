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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Select value={provider} onValueChange={(v) => v && onProviderChange(v)}>
        <SelectTrigger className="w-full min-w-0" aria-label="Başlangıç görseli sağlayıcısı">
          <SelectValue>
            {(v: string) => <span className="truncate">{SERVER_IMAGE_MODELS.find((m) => m.id === v)?.label ?? v}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-[22rem] max-w-[90vw]">
          {SERVER_IMAGE_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {provider === "comfy-flux-schnell" && (
        <Select value={String(steps)} onValueChange={(v) => v && onStepsChange(Number(v))}>
          <SelectTrigger className="w-40" aria-label="Kalite">
            <SelectValue>
              {(v: string) => <span className="truncate">{START_IMAGE_STEP_OPTIONS.find((o) => String(o.value) === v)?.label ?? v}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {START_IMAGE_STEP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
