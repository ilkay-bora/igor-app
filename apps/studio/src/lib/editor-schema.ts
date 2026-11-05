import type { ImageCrop, MotionType } from "@/lib/editor-motion";
import type { TransitionType } from "@/lib/providers";

// The editor's document model. The editor page keeps one of these as its
// autosaved draft; saved projects (data/projects/*.json, created by agents
// through the local API / MCP) wrap the same shape, so either can be opened
// in the editor and rendered the same way.

export type TimelineClip = {
  key: string;
  sourceUrl: string;
  label: string;
  knownDuration: number;
  trimStart: number;
  trimEnd: number;
  transitionAfter: TransitionType;
  muteOriginal: boolean;
  volume?: number;
  audioExtracted?: boolean;
};

export type AudioLayer = {
  key: string;
  kind: "music" | "voice" | "extracted";
  label: string;
  src: string;
  filename?: string;
  start: number;
  trimStart: number;
  trimEnd: number;
  sourceDuration: number;
  volume: number;
  loop: boolean;
};

export type StripLayer = {
  key: string;
  text: string;
  startTime: number;
  endTime: number;
  yPct: number;
};

export type OverlayForm = {
  key: string;
  text: string;
  startTime: number;
  endTime: number;
  cx: number;
  cy: number;
  motion: MotionType;
  fontSize: number;
  color: string;
};

export type EditorDraft = {
  timeline: TimelineClip[];
  audioLayers: AudioLayer[];
  strips: StripLayer[];
  imageLayers: ImageLayer[];
  overlays: OverlayForm[];
  resolution: string;
  pxPerSec: number;
};

export type ImageLayer = {
  key: string;
  label: string;
  src: string;
  filename?: string;
  startTime: number;
  endTime: number;
  cx: number;
  cy: number;
  widthPct: number;
  rotation: number;
  motion: MotionType;
  crop?: ImageCrop;
  // Source height / width, read when the image loads.
  aspect?: number;
};

export const DEFAULT_RESOLUTION = "1280x720";
export const RENDER_FPS = 25;

export function emptyDraft(resolution = DEFAULT_RESOLUTION): EditorDraft {
  return { timeline: [], audioLayers: [], strips: [], imageLayers: [], overlays: [], resolution, pxPerSec: 36 };
}

export function draftDuration(draft: EditorDraft): number {
  return draft.timeline.reduce((sum, c) => sum + Math.max(0, c.trimEnd - c.trimStart), 0);
}

/** What the render queue (POST /api/editor-projects) needs from a draft. */
export function draftToRenderParams(draft: EditorDraft) {
  const [width, height] = draft.resolution.split("x").map(Number);
  return {
    clips: draft.timeline.map((c) => ({
      sourcePath: c.sourceUrl,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd,
      transitionAfter: c.transitionAfter,
      muteOriginal: c.muteOriginal,
      volume: c.volume,
    })),
    width,
    height,
    fps: RENDER_FPS,
    overlays: draft.overlays
      .filter((o) => o.text.trim())
      .map(({ text, startTime, endTime, cx, cy, motion, fontSize, color }) => ({
        text,
        startTime,
        endTime,
        cx,
        cy,
        motion,
        fontSize,
        color,
      })),
    audioLayers: draft.audioLayers.map(({ src, filename, start, trimStart, trimEnd, volume, loop }) => ({
      src,
      filename,
      start,
      trimStart,
      trimEnd,
      volume,
      loop,
    })),
    strips: draft.strips.map(({ text, startTime, endTime, yPct }) => ({ text, startTime, endTime, yPct })),
    imageLayers: draft.imageLayers.map(
      ({ src, filename, startTime, endTime, cx, cy, widthPct, rotation, motion, crop }) => ({
        src,
        filename,
        startTime,
        endTime,
        cx,
        cy,
        widthPct,
        rotation,
        motion,
        crop,
      })
    ),
  };
}
