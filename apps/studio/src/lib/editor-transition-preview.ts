import type { TransitionType } from "@/lib/providers";

// Same length as CROSSFADE_DURATION in editor-render.ts.
export const TRANSITION_PREVIEW_SECONDS = 0.6;

type FrameStyle = {
  outgoing?: { opacity?: string; transform?: string };
  incoming: { opacity?: string; transform?: string; clipPath?: string; maskImage?: string };
};

// CSS approximation of ffmpeg's xfade styles, p runs from 0 to 1. The incoming
// clip sits on top of the outgoing one.
export function transitionFrame(type: TransitionType, p: number): FrameStyle {
  const percent = p * 100;
  switch (type) {
    case "fadeblack":
      return p < 0.5
        ? { outgoing: { opacity: String(1 - 2 * p) }, incoming: { opacity: "0" } }
        : { outgoing: { opacity: "0" }, incoming: { opacity: String(2 * p - 1) } };
    case "slideleft":
      return {
        outgoing: { transform: `translateX(${-percent}%)` },
        incoming: { transform: `translateX(${100 - percent}%)` },
      };
    case "slideright":
      return {
        outgoing: { transform: `translateX(${percent}%)` },
        incoming: { transform: `translateX(${percent - 100}%)` },
      };
    case "wipeleft":
      return { incoming: { clipPath: `inset(0 0 0 ${100 - percent}%)` } };
    case "wiperight":
      return { incoming: { clipPath: `inset(0 ${100 - percent}% 0 0)` } };
    case "circleopen":
      return { incoming: { clipPath: `circle(${percent}%)` } };
    case "radial":
      return { incoming: { maskImage: `conic-gradient(#000 ${p * 360}deg, transparent 0)` } };
    default:
      return { incoming: { opacity: String(p) } };
  }
}
