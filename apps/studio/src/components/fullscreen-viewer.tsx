"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import { FitImage } from "@/components/fit-image";
import { t } from "@/lib/i18n";

export function FullscreenViewer({
  src,
  alt,
  onClose,
  kind = "image",
}: {
  src: string;
  alt: string;
  onClose: () => void;
  kind?: "image" | "video";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("Kapat")}
        className="absolute top-4 right-4 text-white/80 hover:text-white"
      >
        <XIcon className="size-7" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
        {kind === "video" ? (
          <video
            src={src}
            controls
            autoPlay
            loop
            className="max-h-[95vh] max-w-full rounded-lg"
          />
        ) : (
          <FitImage src={src} alt={alt} maxHeightClass="max-h-[95vh]" />
        )}
      </div>
    </div>,
    document.body
  );
}
