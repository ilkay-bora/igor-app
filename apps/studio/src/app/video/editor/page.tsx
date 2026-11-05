"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight, AudioLines, Clapperboard, GripVertical, ImagePlus, Loader2, Mic, Music, Pause, Play, Plus, RectangleHorizontal, Scissors, Type, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Range } from "@/components/ui/range";
import { Card, CardContent } from "@/components/ui/card";
import { RatioPicker } from "@/components/ratio-picker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { ElapsedTimer } from "@/components/elapsed-timer";
import { cn } from "@/lib/utils";
import { STRIP_DEFAULT_Y, layoutStrip } from "@/lib/editor-strip";
import { MOTIONS, NO_CROP, TEXT_POSITION_Y, motionAngle, type ImageCrop, type MotionType } from "@/lib/editor-motion";
import { clearDraft, loadDraft, saveDraft } from "@/lib/editor-draft";
import { draftToRenderParams, type AudioLayer, type EditorDraft, type ImageLayer, type OverlayForm, type StripLayer, type TimelineClip } from "@/lib/editor-schema";
import { TRANSITION_PREVIEW_SECONDS, transitionFrame } from "@/lib/editor-transition-preview";
import {
  TRANSITIONS,
  VIDEO_RESOLUTION_OPTIONS,
  enqueueEditorProject,
  fetchEditorProjects,
  deleteEditorProject,
  fetchVoiceClips,
  type EditorProject,
  type TransitionType,
  type VoiceClip,
} from "@/lib/providers";

const MIN_SPAN = 0.2;
const MAX_VOLUME = 2;
const SNAP_PX = 8;
// React state only follows playback at ~4Hz, so layers near the playhead stay
// mounted and applyMotion switches them on and off on the exact frame.
const PREVIEW_MOUNT_MARGIN = 1;
// How early the next clip starts loading, and how far ahead of the overlay the
// main <video> parks itself so the handover needs no rewind.
const TRANSITION_PRELOAD_SECONDS = 2.5;
const TRANSITION_HANDOVER_LEAD = 0.5;
const MIN_IMAGE_WIDTH = 0.03;
const MAX_IMAGE_WIDTH = 2;
const MIN_CROP_KEEP = 0.05;
const CROP_SIDES: { side: keyof ImageCrop; label: string }[] = [
  { side: "left", label: "Sol" },
  { side: "right", label: "Sağ" },
  { side: "top", label: "Üst" },
  { side: "bottom", label: "Alt" },
];
const OPPOSITE_SIDE: Record<keyof ImageCrop, keyof ImageCrop> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

type LibraryItem = {
  sourceUrl: string;
  label: string;
  duration: number;
  kind: "clip" | "proje sahnesi" | "sahne projesi (tümü)";
  portrait?: boolean;
};

// Text rather than a number input: "37," mid-typing would otherwise read as
// empty and snap the level to zero, and a comma has to work as the decimal.
function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const percent = Math.round(value * 1000) / 10;
  return (
    <span className="flex items-center gap-2">
      Ses seviyesi
      <Range
        min={0}
        max={MAX_VOLUME}
        step={0.001}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40"
      />
      <input
        type="text"
        inputMode="decimal"
        aria-label="Ses seviyesi yüzdesi"
        value={draft ?? String(percent).replace(".", ",")}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() && Number.isFinite(parsed)) onChange(clamp(parsed / 100, 0, MAX_VOLUME));
        }}
        onBlur={() => setDraft(null)}
        className="border-input w-16 rounded border bg-transparent px-2 py-1 text-right tabular-nums"
      />
      %
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-block h-5 w-9 shrink-0 rounded-full p-0 transition-colors",
          checked ? "bg-primary" : "bg-zinc-600"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
      {label}
      {hint && <span className="text-muted-foreground text-[11px]">{hint}</span>}
    </label>
  );
}

// Trimming happens on the timeline's block edges; this panel shows the source
// and records its real duration (onLoadedMetadata), which bounds those edges —
// the duration stored with a library item is only approximate.
function ClipPanel({
  clip,
  onChange,
  onExtractAudio,
}: {
  clip: TimelineClip;
  onChange: (patch: Partial<TimelineClip>) => void;
  onExtractAudio: () => void;
}) {
  function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const d = e.currentTarget.duration;
    if (d && isFinite(d) && Math.abs(d - clip.knownDuration) > 0.05) {
      onChange({ knownDuration: d, trimEnd: Math.min(clip.trimEnd, d) });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <video
        key={clip.key}
        src={clip.sourceUrl}
        controls
        onLoadedMetadata={handleLoadedMetadata}
        className="max-h-72 w-full rounded-lg bg-black"
      />
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{clip.trimStart.toFixed(1)}sn</span>
        <span>Süre: {(clip.trimEnd - clip.trimStart).toFixed(1)}sn</span>
        <span>{clip.trimEnd.toFixed(1)}sn</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          checked={clip.muteOriginal}
          onChange={(v) => onChange({ muteOriginal: v })}
          label="Orijinal sesi kapat"
        />
        {!clip.muteOriginal && (
          <div className="text-xs">
            <VolumeControl value={clip.volume ?? 1} onChange={(volume) => onChange({ volume })} />
          </div>
        )}
        <Button size="sm" variant="secondary" disabled={clip.audioExtracted} onClick={onExtractAudio}>
          <AudioLines className="size-3.5" />
          {clip.audioExtracted ? "Ses ayrıldı" : "Sesi ayır"}
        </Button>
      </div>
    </div>
  );
}

type DragMode = "start" | "end" | "move";
type LayerType = "audio" | "strip" | "text" | "image";

// One block on a layer track: drag the middle to move it, the edges to trim.
function TrackBar({
  left,
  width,
  selected,
  className,
  icon,
  label,
  onSelect,
  onDragStart,
  onRemove,
}: {
  left: number;
  width: number;
  selected: boolean;
  className: string;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
  onDragStart: (mode: DragMode, e: ReactMouseEvent) => void;
  onRemove: () => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        onSelect();
        onDragStart("move", e);
      }}
      title={label}
      className={cn(
        "group absolute inset-y-0 flex cursor-grab items-center gap-1.5 overflow-hidden rounded border px-3 text-[10px] select-none active:cursor-grabbing",
        selected && "ring-primary ring-2",
        className
      )}
      style={{ left, width: Math.max(14, width) }}
    >
      {icon}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="bg-background/85 text-destructive absolute top-0.5 right-3 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
      <TrimHandle side="start" onDragStart={onDragStart} onSelect={onSelect} />
      <TrimHandle side="end" onDragStart={onDragStart} onSelect={onSelect} />
    </div>
  );
}

function TrimHandle({
  side,
  onDragStart,
  onSelect,
}: {
  side: "start" | "end";
  onDragStart: (mode: DragMode, e: ReactMouseEvent) => void;
  onSelect: () => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        // preventDefault also stops a video block's HTML5 reorder drag.
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        onDragStart(side, e);
      }}
      className={cn(
        "bg-foreground/60 hover:bg-primary absolute inset-y-0 z-20 w-2 cursor-ew-resize",
        side === "start" ? "left-0 rounded-l" : "right-0 rounded-r"
      )}
    />
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// A <video> element reads audio files too.
function probeDuration(url: string, fallback: number): Promise<number> {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => resolve(isFinite(probe.duration) && probe.duration > 0 ? probe.duration : fallback);
    probe.onerror = () => resolve(fallback);
    probe.src = url;
  });
}

/** 83.4 -> "1:23.4" */
function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const sec = safe - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

export default function EditorPage() {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineClip[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [draggingLibrary, setDraggingLibrary] = useState<LibraryItem | null>(null);
  const [resolution, setResolution] = useState("1280x720");
  const [audioLayers, setAudioLayers] = useState<AudioLayer[]>([]);
  const [strips, setStrips] = useState<StripLayer[]>([]);
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>([]);
  const [overlays, setOverlays] = useState<OverlayForm[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<{ type: LayerType; key: string } | null>(null);
  const [pxPerSec, setPxPerSec] = useState(36);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [voiceLibrary, setVoiceLibrary] = useState<VoiceClip[]>([]);
  const [projects, setProjects] = useState<EditorProject[]>([]);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  const totalDuration = timeline.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0);
  const [previewArea, setPreviewArea] = useState({ w: 0, h: 0 });
  const [resolutionWidth, resolutionHeight] = resolution.split("x").map(Number);
  const previewWidth =
    previewArea.w > 0 && previewArea.h > 0
      ? Math.floor(Math.min(previewArea.w, previewArea.h * (resolutionWidth / resolutionHeight)))
      : `min(100%, calc(40vh * ${resolutionWidth / resolutionHeight}))`;

  // Pre-render sequential preview: plays each trimmed clip back-to-back in
  // one <video>, keeps one <audio> per audio layer in step with it and shows
  // strips/text at the right global time — a full ffmpeg render takes real
  // time, so this lets you check everything before committing to one.
  // Transitions play on a second <video> stacked over the first, approximated
  // in CSS (see editor-transition-preview.ts).
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const transitionVideoRef = useRef<HTMLVideoElement>(null);
  const transitionRef = useRef<{
    type: TransitionType;
    nextIndex: number;
    startedAt: number;
    durationMs: number;
    // Waiting for the main <video> to take over the next clip.
    settling: boolean;
  } | null>(null);
  const preparedClipKeyRef = useRef<string | null>(null);
  const audioElsRef = useRef(new Map<string, HTMLAudioElement>());
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const [sideTab, setSideTab] = useState<"library" | "projects">("library");
  const timelineRef = useRef<TimelineClip[]>([]);
  const loadedClipKeyRef = useRef<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewGlobalTime, setPreviewGlobalTime] = useState(0);
  const [previewVolume, setPreviewVolume] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubHover, setScrubHover] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    kind: "clip" | LayerType | "playhead";
    key: string;
    mode: DragMode;
    startX: number;
    orig: { a: number; b: number; c: number };
  } | null>(null);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  // The one place audio layers follow the preview: every time update, seek,
  // pause and layer edit lands here.
  useEffect(() => {
    for (const layer of audioLayers) {
      const el = audioElsRef.current.get(layer.key);
      if (!el) continue;
      const span = layer.trimEnd - layer.trimStart;
      const offset = previewGlobalTime - layer.start;
      if (!previewPlaying || offset < 0 || offset >= span) {
        if (!el.paused) el.pause();
        continue;
      }
      const available = (el.duration || layer.sourceDuration) - layer.trimStart;
      const target = layer.trimStart + (layer.loop && available > 0.1 ? offset % available : offset);
      if (Math.abs(el.currentTime - target) > 0.35) el.currentTime = target;
      el.volume = Math.min(1, layer.volume);
      if (el.paused) el.play().catch(() => undefined);
    }
  }, [audioLayers, previewGlobalTime, previewPlaying]);

  useEffect(() => {
    const clip = timeline[previewIndex];
    if (!previewVideoRef.current || !clip) return;
    previewVideoRef.current.muted = clip.muteOriginal;
    previewVideoRef.current.volume = previewVolume * Math.min(1, clip.volume ?? 1);
  }, [timeline, previewIndex, previewVolume]);

  // The preview fills whatever room the single-screen layout leaves it.
  const hasTimeline = timeline.length > 0;
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setPreviewArea({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasTimeline]);

  // Restored before saving starts, or the first save would wipe the draft
  // with this page's empty initial state.
  // ?project=<id> (from an agent's open_in_editor) replaces the draft with a
  // saved project, after asking if the current draft has anything in it.
  // Guarded so dev's double-run effects don't ask twice.
  const draftLoadStarted = useRef(false);
  useEffect(() => {
    if (draftLoadStarted.current) return;
    draftLoadStarted.current = true;
    (async () => {
      let draft = await loadDraft<EditorDraft>();
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get("project");
      if (projectId) {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const project = res.ok ? ((await res.json()) as { name: string; draft: EditorDraft }) : null;
        const draftHasContent =
          !!draft && (draft.timeline.length > 0 || draft.overlays.length > 0 || draft.audioLayers.length > 0);
        if (!project) {
          window.alert("Proje bulunamadı, mevcut taslak açılıyor.");
        } else if (
          !draftHasContent ||
          window.confirm(`"${project.name}" projesi açılsın mı? Editördeki mevcut taslağın yerine geçecek.`)
        ) {
          draft = project.draft;
        }
        params.delete("project");
        const query = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      }
      if (draft) {
        setTimeline(draft.timeline);
        setAudioLayers(draft.audioLayers);
        setStrips(draft.strips);
        setImageLayers(draft.imageLayers);
        setOverlays(draft.overlays);
        setResolution(draft.resolution);
        setPxPerSec(draft.pxPerSec);
      }
      setDraftReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(async () => {
      const saved = await saveDraft<EditorDraft>({
        timeline,
        audioLayers,
        strips,
        imageLayers,
        overlays,
        resolution,
        pxPerSec,
      });
      setDraftStatus(
        saved
          ? `Kaydedildi, ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
          : "Otomatik kayıt başarısız"
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [draftReady, timeline, audioLayers, strips, imageLayers, overlays, resolution, pxPerSec]);

  // Animated layers are moved directly on their DOM nodes: React state only
  // ticks at the video's ~4Hz timeupdate, far too coarse for visible motion.
  function applyMotion(t: number) {
    const box = previewBoxRef.current;
    box?.querySelectorAll<HTMLElement>("[data-start]").forEach((el) => {
      const visible = el.dataset.posed === "true" || (Math.max(0, t) >= Number(el.dataset.start) && t < Number(el.dataset.end));
      el.style.visibility = visible ? "" : "hidden";
    });
    box?.querySelectorAll<HTMLElement>("[data-motion]").forEach((el) => {
      const motion = el.dataset.motion as MotionType;
      const start = Number(el.dataset.start);
      if (motion === "marquee") {
        const progress = (t - start) / (Number(el.dataset.end) - start);
        el.style.left = `${box.clientWidth - (box.clientWidth + el.offsetWidth) * progress}px`;
        el.style.transform = "translateY(-50%)";
      } else {
        const angle = (Number(el.dataset.rotation) * Math.PI) / 180 + motionAngle(motion, t - start);
        el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      }
    });
  }

  // While playing the frame loop owns this: previewGlobalTime lags behind it
  // and would switch a layer that just ended back on.
  useEffect(() => {
    if (!previewPlaying) applyMotion(previewGlobalTime);
  });

  function clearTransition() {
    transitionRef.current = null;
    preparedClipKeyRef.current = null;
    const overlay = transitionVideoRef.current;
    overlay?.pause();
    overlay?.removeAttribute("style");
    previewVideoRef.current?.removeAttribute("style");
  }

  function prepareTransition(overlay: HTMLVideoElement, next: TimelineClip) {
    if (preparedClipKeyRef.current === next.key) return;
    preparedClipKeyRef.current = next.key;
    overlay.src = next.sourceUrl;
    overlay.currentTime = next.trimStart;
    overlay.muted = true;
    overlay.volume = previewVolume * Math.min(1, next.volume ?? 1);
  }

  // The main <video> waits, parked and paused, slightly ahead of the overlay
  // and takes over the moment the overlay arrives. Rewinding to the overlay's
  // position instead would play that stretch of speech twice.
  function handOver(video: HTMLVideoElement, overlay: HTMLVideoElement, index: number) {
    const active = transitionRef.current;
    const clip = timelineRef.current[index];
    if (!active || !clip) return;
    const target = Math.min(overlay.currentTime + TRANSITION_HANDOVER_LEAD, clip.trimEnd - 0.05);
    video.addEventListener(
      "seeked",
      () => {
        const wait = () => {
          if (transitionRef.current !== active) return;
          if (overlay.currentTime < video.currentTime && !overlay.paused && !overlay.ended) {
            requestAnimationFrame(wait);
            return;
          }
          video.muted = clip.muteOriginal;
          video.play().catch(() => undefined);
          clearTransition();
        };
        wait();
      },
      { once: true }
    );
    video.muted = true;
    setPreviewIndex(index);
    loadClip(index, target, false);
    video.muted = true;
  }

  // Runs every frame: timeupdate's ~4Hz could neither start a transition on
  // time nor animate it. The overlap matches the render, where the last moments
  // of a clip play over the first moments of the next one.
  function stepTransition(video: HTMLVideoElement, clip: TimelineClip, index: number) {
    const overlay = transitionVideoRef.current;
    if (!overlay) return;
    const active = transitionRef.current;
    if (!active) {
      const next = timelineRef.current[index + 1];
      const remaining = clip.trimEnd - video.currentTime;
      if (!next || clip.transitionAfter === "cut") return;
      if (remaining <= TRANSITION_PRELOAD_SECONDS) prepareTransition(overlay, next);
      if (remaining > TRANSITION_PREVIEW_SECONDS || remaining < 0.05) return;
      overlay.style.display = "block";
      overlay.play().catch(() => undefined);
      transitionRef.current = {
        type: clip.transitionAfter,
        nextIndex: index + 1,
        startedAt: performance.now(),
        durationMs: remaining * 1000,
        settling: false,
      };
      return;
    }
    if (active.settling) return;
    // Trimmed clips run on in their source file, and when the next part is cut
    // from the same file that would be the very line the overlay is playing.
    if (video.currentTime >= clip.trimEnd && !video.paused) video.pause();
    const progress = Math.min(1, (performance.now() - active.startedAt) / active.durationMs);
    const { outgoing, incoming } = transitionFrame(active.type, progress);
    Object.assign(overlay.style, incoming);
    if (outgoing) Object.assign(video.style, outgoing);
    // Same as the render: sound changes over at the transition's middle.
    if (progress >= 0.5) {
      video.muted = true;
      overlay.muted = timelineRef.current[active.nextIndex]?.muteOriginal ?? false;
    }
    if (progress < 1) return;
    active.settling = true;
    handOver(video, overlay, active.nextIndex);
  }

  useEffect(() => {
    if (!previewPlaying) return;
    let frame = 0;
    const tick = () => {
      const video = previewVideoRef.current;
      const list = timelineRef.current;
      const clip = list[previewIndex];
      if (video && clip) {
        // During a transition the incoming clip's position is the clock, as
        // in the render, where layers follow the clip they were placed on.
        const active = transitionRef.current;
        const clockIndex = active ? active.nextIndex : previewIndex;
        const clockClip = list[clockIndex];
        const clockVideo = active ? transitionVideoRef.current : video;
        // A clip that is still loading reads as time 0, which would flash
        // the layers from the start of the timeline over the cut.
        const loading = !active && (video.seeking || loadedClipKeyRef.current !== clip.key);
        if (clockClip && clockVideo && !loading) {
          const before = list.slice(0, clockIndex).reduce((sum, c) => sum + c.trimEnd - c.trimStart, 0);
          applyMotion(before + clockVideo.currentTime - clockClip.trimStart);
        }
        stepTransition(video, clip, previewIndex);
        if (!transitionRef.current && !video.seeking && video.currentTime >= clip.trimEnd) advanceClip(video);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPlaying, previewIndex]);

  function cumulativeDurationBefore(index: number): number {
    let sum = 0;
    for (let i = 0; i < index; i++) sum += timeline[i].trimEnd - timeline[i].trimStart;
    return sum;
  }

  // Loads clip `index` into the preview <video> (only swapping `src` if it's
  // a different clip than what's already loaded), seeks to `atTime`, and
  // plays/pauses per `autoplay`. Shared by normal playback advance and by
  // scrubbing the progress bar.
  function loadClip(index: number, atTime: number, autoplay: boolean) {
    const clip = timelineRef.current[index];
    const video = previewVideoRef.current;
    if (!clip || !video) return;
    video.muted = clip.muteOriginal;
    video.volume = previewVolume * Math.min(1, clip.volume ?? 1);

    const seekAndGo = () => {
      video.currentTime = atTime;
      if (autoplay) video.play().catch(() => undefined);
      else video.pause();
    };

    if (loadedClipKeyRef.current !== clip.key) {
      loadedClipKeyRef.current = clip.key;
      video.src = clip.sourceUrl;
      video.addEventListener("loadedmetadata", seekAndGo, { once: true });
    } else {
      seekAndGo();
    }
  }

  // Shows a real paused frame (with overlays on top of it) as soon as clips
  // exist, instead of leaving the preview area blank until "Önizle" is first
  // pressed — otherwise there's nothing for a text overlay to visibly sit on.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (previewPlaying) return;
    if (timeline.length === 0) {
      autoLoadedRef.current = false;
      return;
    }
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    loadClip(0, timeline[0].trimStart, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.length, previewPlaying, previewGeneration]);

  function handlePreviewTimeUpdate() {
    const video = previewVideoRef.current;
    const clip = timelineRef.current[previewIndex];
    if (!video || !clip || scrubbing || transitionRef.current?.settling) return;
    // Clamped: right after a load the video can still sit before trimStart,
    // which read as -0.0s and hid every layer that starts at 0.
    const globalTime = Math.max(0, cumulativeDurationBefore(previewIndex) + (video.currentTime - clip.trimStart));
    setPreviewGlobalTime(globalTime);
    if (transitionRef.current) return;
    if (!video.seeking && video.currentTime >= clip.trimEnd) advanceClip(video);
  }

  function advanceClip(video: HTMLVideoElement) {
    const next = previewIndex + 1;
    if (next < timelineRef.current.length) {
      setPreviewIndex(next);
      loadClip(next, timelineRef.current[next].trimStart, true);
    } else {
      setPreviewPlaying(false);
      video.pause();
    }
  }

  function startPreview() {
    if (timeline.length === 0) return;
    setPreviewIndex(0);
    setPreviewGlobalTime(0);
    setPreviewPlaying(true);
    loadClip(0, timeline[0].trimStart, true);
  }

  function togglePreviewPlayback() {
    if (previewPlaying) {
      clearTransition();
      previewVideoRef.current?.pause();
      setPreviewPlaying(false);
      return;
    }
    if (loadedClipKeyRef.current) {
      previewVideoRef.current?.play().catch(() => undefined);
      setPreviewPlaying(true);
    } else {
      startPreview();
    }
  }

  function seekPreview(time: number, autoplay = previewPlaying) {
    const list = timelineRef.current;
    if (list.length === 0) return;
    clearTransition();
    const clamped = Math.max(0, Math.min(time, totalDuration));
    let acc = 0;
    let idx = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      const dur = list[i].trimEnd - list[i].trimStart;
      if (clamped < acc + dur) {
        idx = i;
        break;
      }
      acc += dur;
    }
    const clip = list[idx];
    const within = clip.trimStart + Math.max(0, Math.min(clamped - acc, clip.trimEnd - clip.trimStart));
    setPreviewIndex(idx);
    setPreviewGlobalTime(clamped);
    loadClip(idx, within, autoplay);
  }

  // Sets one cut's transition, or every cut's without `index`, and plays it
  // straight away so the choice can be judged without a render.
  function applyTransition(type: TransitionType, index?: number) {
    const last = timeline.length - 1;
    const next = timeline.map((c, i) => ((index === undefined ? i < last : i === index) ? { ...c, transitionAfter: type } : c));
    setTimeline(next);
    timelineRef.current = next;
    if (type === "cut") return;
    setPreviewPlaying(true);
    seekPreview(Math.max(0, cumulativeDurationBefore((index ?? 0) + 1) - 1.5), true);
  }

  function handleProgressSeek(clientX: number) {
    const rect = progressBarRef.current?.getBoundingClientRect();
    if (!rect || totalDuration <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekPreview(ratio * totalDuration);
  }

  useEffect(() => {
    if (!scrubbing) return;
    function onMove(e: MouseEvent) {
      handleProgressSeek(e.clientX);
    }
    function onUp() {
      setScrubbing(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, totalDuration]);

  const loadProjects = useCallback(async () => {
    setProjects(await fetchEditorProjects());
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/video").then((r) => r.json()),
      fetch("/api/video-projects").then((r) => r.json()),
    ]).then(([jobsRes, projectsRes]) => {
      const items: LibraryItem[] = [];
      for (const j of jobsRes) {
        if (j.status !== "done" || !j.url) continue;
        if (j.projectId) {
          // Individual scene of a "Çoklu Sahne (Proje)" — exposed separately
          // (not just the hard-cut merged whole below) so the project can be
          // rearranged/retrimmed and given real transitions here.
          items.push({
            sourceUrl: j.url,
            label: `Proje sahnesi ${(j.sceneIndex ?? 0) + 1}: ${j.prompt}`,
            duration: j.durationSeconds,
            kind: "proje sahnesi",
            portrait: j.height > j.width,
          });
        } else {
          items.push({
            sourceUrl: j.url,
            label: j.prompt,
            duration: j.durationSeconds,
            kind: "clip",
            portrait: j.height > j.width,
          });
        }
      }
      for (const p of projectsRes) {
        if (p.status === "done" && p.finalUrl) {
          items.push({
            sourceUrl: p.finalUrl,
            label: `Proje (${p.sceneCount} sahne, tümü, kesmeli)`,
            duration: 0,
            kind: "sahne projesi (tümü)",
          });
        }
      }
      setLibrary(items);
    });
    fetchEditorProjects().then(setProjects);
    fetchVoiceClips().then(setVoiceLibrary);
  }, []);

  function addAudioLayer(layer: Omit<AudioLayer, "key" | "start"> & { start?: number }) {
    const key = crypto.randomUUID();
    setAudioLayers((prev) => [...prev, { start: previewGlobalTime, ...layer, key }]);
    setSelectedKey(null);
    setSelectedLayer({ type: "audio", key });
  }

  function addVoiceFromLibrary(clip: VoiceClip) {
    const probe = new Audio(clip.url);
    probe.addEventListener("loadedmetadata", () => {
      const duration = probe.duration || 5;
      addAudioLayer({
        kind: "voice",
        label: `${clip.voice}: ${clip.text.slice(0, 40)}`,
        src: clip.url,
        trimStart: 0,
        trimEnd: duration,
        sourceDuration: duration,
        volume: 1,
        loop: false,
      });
    });
  }

  function handleAudioUpload(e: ChangeEvent<HTMLInputElement>, kind: "music" | "voice") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const probe = new Audio(src);
      probe.addEventListener("loadedmetadata", () => {
        const duration = probe.duration || 5;
        const loop = kind === "music";
        addAudioLayer({
          kind,
          label: file.name,
          src,
          filename: file.name,
          start: loop ? 0 : undefined,
          trimStart: 0,
          trimEnd: loop ? totalDuration || duration : duration,
          sourceDuration: duration,
          volume: loop ? 0.5 : 1,
          loop,
        });
      });
    };
    reader.readAsDataURL(file);
  }

  // Same move as CapCut: the clip goes silent and its sound becomes a layer
  // that can be trimmed, moved and leveled on its own.
  function extractClipAudio(clip: TimelineClip) {
    const index = timeline.findIndex((c) => c.key === clip.key);
    addAudioLayer({
      kind: "extracted",
      label: `Klip ${index + 1} sesi`,
      src: clip.sourceUrl,
      start: cumulativeDurationBefore(index),
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      sourceDuration: clip.knownDuration,
      volume: clip.volume ?? 1,
      loop: false,
    });
    updateClip(clip.key, { muteOriginal: true, audioExtracted: true });
  }

  useEffect(() => {
    const active = projects.some((p) => p.status === "running" || p.status === "queued");
    if (!active) return;
    const interval = setInterval(loadProjects, 4000);
    return () => clearInterval(interval);
  }, [projects, loadProjects]);

  function makeClip(item: LibraryItem, key: string): TimelineClip {
    const duration = item.duration || 10;
    return {
      key,
      sourceUrl: item.sourceUrl,
      label: item.label,
      knownDuration: duration,
      trimStart: 0,
      trimEnd: duration,
      transitionAfter: "cut",
      muteOriginal: false,
    };
  }

  function addToTimeline(item: LibraryItem) {
    const key = crypto.randomUUID();
    if (timeline.length === 0 && item.portrait) setResolution("720x1280");
    setTimeline((prev) => [...prev, makeClip(item, key)]);
    setSelectedKey(key);
    setSelectedLayer(null);
  }

  function updateClip(key: string, patch: Partial<TimelineClip>) {
    setTimeline((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function removeClip(key: string) {
    setTimeline((prev) => prev.filter((c) => c.key !== key));
    setSelectedKey((s) => (s === key ? null : s));
  }

  function reorder(from: number, to: number) {
    setTimeline((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleBlockDrop(index: number) {
    if (draggingLibrary) {
      const key = crypto.randomUUID();
      if (timeline.length === 0 && draggingLibrary.portrait) setResolution("720x1280");
      setTimeline((prev) => {
        const next = [...prev];
        next.splice(index, 0, makeClip(draggingLibrary, key));
        return next;
      });
      setSelectedKey(key);
      setSelectedLayer(null);
      setDraggingLibrary(null);
      return;
    }
    if (dragIndex !== null) {
      reorder(dragIndex, index);
      setDragIndex(null);
    }
  }

  function addOverlay() {
    const key = crypto.randomUUID();
    const startTime = previewGlobalTime;
    setOverlays((prev) => [
      ...prev,
      {
        key,
        text: "",
        startTime,
        endTime: startTime + 3,
        cx: 0.5,
        cy: TEXT_POSITION_Y.center,
        motion: "none",
        fontSize: 48,
        color: "#ffffff",
      },
    ]);
    setSelectedKey(null);
    setSelectedLayer({ type: "text", key });
  }

  function updateOverlay(key: string, patch: Partial<OverlayForm>) {
    setOverlays((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function removeOverlay(key: string) {
    setOverlays((prev) => prev.filter((o) => o.key !== key));
  }

  function addStrip() {
    const key = crypto.randomUUID();
    const startTime = previewGlobalTime;
    setStrips((prev) => [
      ...prev,
      { key, text: "", startTime, endTime: startTime + 4, yPct: STRIP_DEFAULT_Y },
    ]);
    setSelectedKey(null);
    setSelectedLayer({ type: "strip", key });
  }

  function probeVideo(file: File): Promise<{ duration: number; portrait: boolean }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        resolve({ duration: probe.duration || 10, portrait: probe.videoHeight > probe.videoWidth });
        URL.revokeObjectURL(url);
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`${file.name} okunamadı`));
      };
      probe.src = url;
    });
  }

  async function handleVideoUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingVideo(true);
    setUploadError("");
    try {
      for (const file of files) {
        const { duration, portrait } = await probeVideo(file);
        const res = await fetch(`/api/editor-uploads?name=${encodeURIComponent(file.name)}`, {
          method: "POST",
          body: file,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Video yüklenemedi");
        const item: LibraryItem = { sourceUrl: data.url, label: file.name, duration, kind: "clip", portrait };
        setLibrary((prev) => [item, ...prev]);
        addToTimeline(item);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingVideo(false);
    }
  }

  function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const key = crypto.randomUUID();
      const startTime = previewGlobalTime;
      setImageLayers((prev) => [
        ...prev,
        {
          key,
          label: file.name,
          src: reader.result as string,
          filename: file.name,
          startTime,
          endTime: startTime + 4,
          cx: 0.5,
          cy: STRIP_DEFAULT_Y,
          widthPct: 0.8,
          rotation: 0,
          motion: "none",
        },
      ]);
      setSelectedKey(null);
      setSelectedLayer({ type: "image", key });
    };
    reader.readAsDataURL(file);
  }

  function updateImage(key: string, patch: Partial<ImageLayer>) {
    setImageLayers((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Dragging a layer on the preview places it, like moving it in CapCut. It
  // follows the cursor from where it was grabbed rather than jumping to it.
  function startPreviewMove(
    e: ReactMouseEvent,
    type: "image" | "text" | "strip",
    key: string,
    cx: number,
    cy: number,
    lockX = false
  ) {
    e.preventDefault();
    if (previewPlaying) togglePreviewPlayback();
    selectLayer(type, key);
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const offsetX = (e.clientX - box.left) / box.width - cx;
    const offsetY = (e.clientY - box.top) / box.height - cy;
    function onMove(ev: MouseEvent) {
      if (!box) return;
      const x = lockX ? cx : clamp((ev.clientX - box.left) / box.width - offsetX, 0, 1);
      const y = clamp((ev.clientY - box.top) / box.height - offsetY, 0, 1);
      if (type === "image") updateImage(key, { cx: x, cy: y });
      else if (type === "text") updateOverlay(key, { cx: x, cy: y });
      else updateStrip(key, { yPct: clamp(y, 0.06, 0.94) });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Corner handles scale around the centre, so the image stays where it is.
  function startImageResize(e: ReactMouseEvent, layer: ImageLayer) {
    e.preventDefault();
    e.stopPropagation();
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const centerX = box.left + layer.cx * box.width;
    const centerY = box.top + layer.cy * box.height;
    const startDistance = Math.max(1, Math.hypot(e.clientX - centerX, e.clientY - centerY));
    function onMove(ev: MouseEvent) {
      const scale = Math.hypot(ev.clientX - centerX, ev.clientY - centerY) / startDistance;
      updateImage(layer.key, { widthPct: clamp(layer.widthPct * scale, MIN_IMAGE_WIDTH, MAX_IMAGE_WIDTH) });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Width and centre describe the cropped result, so cropping one side moves
  // them too: the uncropped part of the image has to stay exactly in place.
  function cropPatch(layer: ImageLayer, side: keyof ImageCrop, value: number): Partial<ImageLayer> {
    const crop = layer.crop ?? NO_CROP;
    const next = clamp(value, 0, 1 - crop[OPPOSITE_SIDE[side]] - MIN_CROP_KEEP);
    const moved = next - crop[side];
    const horizontal = side === "left" || side === "right";
    const keptWidth = 1 - crop.left - crop.right;
    const fullWidth = (layer.widthPct / keptWidth) * resolutionWidth;
    const fullHeight = fullWidth * (layer.aspect ?? 1);
    const direction = side === "left" || side === "top" ? 1 : -1;
    const shift = (moved * (horizontal ? fullWidth : fullHeight) * direction) / 2;
    const angle = (layer.rotation * Math.PI) / 180;
    return {
      crop: { ...crop, [side]: next },
      widthPct: horizontal ? (layer.widthPct / keptWidth) * (keptWidth - moved) : layer.widthPct,
      cx: layer.cx + ((horizontal ? shift * Math.cos(angle) : -shift * Math.sin(angle)) / resolutionWidth),
      cy: layer.cy + ((horizontal ? shift * Math.sin(angle) : shift * Math.cos(angle)) / resolutionHeight),
    };
  }

  function resetCrop(layer: ImageLayer) {
    const restored = CROP_SIDES.reduce((current, { side }) => ({ ...current, ...cropPatch(current, side, 0) }), layer);
    updateImage(layer.key, restored);
  }

  function startImageCrop(e: ReactMouseEvent, layer: ImageLayer, side: keyof ImageCrop) {
    e.preventDefault();
    e.stopPropagation();
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const { clientX: startX, clientY: startY } = e;
    const crop = layer.crop ?? NO_CROP;
    const horizontal = side === "left" || side === "right";
    const fullWidth = (layer.widthPct / (1 - crop.left - crop.right)) * box.width;
    const fullSize = horizontal ? fullWidth : fullWidth * (layer.aspect ?? 1);
    const direction = side === "left" || side === "top" ? 1 : -1;
    const angle = (layer.rotation * Math.PI) / 180;
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const along = horizontal
        ? dx * Math.cos(angle) + dy * Math.sin(angle)
        : -dx * Math.sin(angle) + dy * Math.cos(angle);
      updateImage(layer.key, cropPatch(layer, side, crop[side] + (along / fullSize) * direction));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function updateStrip(key: string, patch: Partial<StripLayer>) {
    setStrips((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function updateAudioLayer(key: string, patch: Partial<AudioLayer>) {
    setAudioLayers((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeSelected() {
    if (selectedLayer) {
      const { type, key } = selectedLayer;
      if (type === "audio") setAudioLayers((prev) => prev.filter((l) => l.key !== key));
      if (type === "strip") setStrips((prev) => prev.filter((s) => s.key !== key));
      if (type === "text") removeOverlay(key);
      if (type === "image") setImageLayers((prev) => prev.filter((l) => l.key !== key));
      setSelectedLayer(null);
    } else if (selectedKey) {
      removeClip(selectedKey);
    }
  }

  // Splits the selected layer at the playhead, or the clip under it.
  function splitAtPlayhead() {
    const t = previewGlobalTime;
    const key = crypto.randomUUID();
    const inside = (start: number, end: number) => t > start + 0.1 && t < end - 0.1;

    if (selectedLayer?.type === "audio") {
      const layer = audioLayers.find((l) => l.key === selectedLayer.key);
      if (!layer || !inside(layer.start, layer.start + layer.trimEnd - layer.trimStart)) return;
      const cut = layer.trimStart + (t - layer.start);
      const span = layer.trimEnd - cut;
      const nextStart = layer.loop ? cut % Math.max(0.1, layer.sourceDuration) : cut;
      setAudioLayers((prev) =>
        prev.flatMap((l) =>
          l.key === layer.key
            ? [
                { ...l, trimEnd: cut },
                { ...l, key, start: t, trimStart: nextStart, trimEnd: nextStart + span },
              ]
            : [l]
        )
      );
      return;
    }
    if (selectedLayer?.type === "strip") {
      const strip = strips.find((s) => s.key === selectedLayer.key);
      if (!strip || !inside(strip.startTime, strip.endTime)) return;
      setStrips((prev) =>
        prev.flatMap((s) =>
          s.key === strip.key ? [{ ...s, endTime: t }, { ...s, key, startTime: t }] : [s]
        )
      );
      return;
    }
    if (selectedLayer?.type === "image") {
      const image = imageLayers.find((l) => l.key === selectedLayer.key);
      if (!image || !inside(image.startTime, image.endTime)) return;
      setImageLayers((prev) =>
        prev.flatMap((l) =>
          l.key === image.key ? [{ ...l, endTime: t }, { ...l, key, startTime: t }] : [l]
        )
      );
      return;
    }
    if (selectedLayer?.type === "text") {
      const overlay = overlays.find((o) => o.key === selectedLayer.key);
      if (!overlay || !inside(overlay.startTime, overlay.endTime)) return;
      setOverlays((prev) =>
        prev.flatMap((o) =>
          o.key === overlay.key ? [{ ...o, endTime: t }, { ...o, key, startTime: t }] : [o]
        )
      );
      return;
    }

    const index = timeline.findIndex((_, i) => {
      const start = cumulativeDurationBefore(i);
      return t >= start && t < start + timeline[i].trimEnd - timeline[i].trimStart;
    });
    if (index < 0) return;
    const clip = timeline[index];
    const start = cumulativeDurationBefore(index);
    if (!inside(start, start + clip.trimEnd - clip.trimStart)) return;
    const cut = clip.trimStart + (t - start);
    setTimeline((prev) =>
      prev.flatMap((c) =>
        c.key === clip.key
          ? [
              { ...c, trimEnd: cut, transitionAfter: "cut" as TransitionType },
              { ...c, key, trimStart: cut },
            ]
          : [c]
      )
    );
    loadedClipKeyRef.current = null;
    setSelectedKey(key);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.key === "Delete") {
        removeSelected();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePreviewPlayback();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!drag) return;
    const { kind, key, mode, startX, orig } = drag;
    const snapPoints = collectSnapPoints(kind, key);
    // Pulls the nearest of the given edges onto a snap point within reach.
    function snapOffset(edges: number[]): number {
      let best: { offset: number; at: number } | null = null;
      if (snapEnabled) {
        for (const edge of edges) {
          for (const at of snapPoints) {
            const offset = at - edge;
            if (Math.abs(offset) * pxPerSec <= SNAP_PX && (!best || Math.abs(offset) < Math.abs(best.offset))) {
              best = { offset, at };
            }
          }
        }
      }
      setSnapGuide(best ? best.at : null);
      return best ? best.offset : 0;
    }
    function onMove(e: MouseEvent) {
      if (kind === "playhead") {
        const rect = rulerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const time = (e.clientX - rect.left) / pxPerSec;
        seekPreview(time + snapOffset([time]));
        return;
      }
      const raw = (e.clientX - startX) / pxPerSec;
      const start = kind === "audio" ? orig.c : orig.a;
      const end = kind === "audio" ? orig.c + orig.b - orig.a : orig.b;
      // A clip only snaps by its end, which is the cut that trimming moves.
      const clipEnd = kind === "clip" ? cumulativeDurationBefore(timeline.findIndex((c) => c.key === key)) + orig.b - orig.a : 0;
      const edges =
        kind === "clip"
          ? mode === "end"
            ? [clipEnd + raw]
            : []
          : mode === "move"
            ? [start + raw, end + raw]
            : [(mode === "start" ? start : end) + raw];
      const dt = raw + snapOffset(edges);
      if (kind === "clip") {
        setTimeline((prev) =>
          prev.map((c) => {
            if (c.key !== key) return c;
            return mode === "start"
              ? { ...c, trimStart: clamp(orig.a + dt, 0, c.trimEnd - MIN_SPAN) }
              : { ...c, trimEnd: clamp(orig.b + dt, c.trimStart + MIN_SPAN, c.knownDuration) };
          })
        );
      } else if (kind === "audio") {
        setAudioLayers((prev) =>
          prev.map((l) => {
            if (l.key !== key) return l;
            if (mode === "move") return { ...l, start: Math.max(0, orig.c + dt) };
            if (mode === "end") {
              const max = l.loop ? Infinity : l.sourceDuration;
              return { ...l, trimEnd: clamp(orig.b + dt, l.trimStart + MIN_SPAN, max) };
            }
            // Keeps the audio itself where it was while the edge moves.
            const trimStart = clamp(orig.a + dt, Math.max(0, orig.a - orig.c), l.trimEnd - MIN_SPAN);
            return { ...l, trimStart, start: orig.c + trimStart - orig.a };
          })
        );
      } else {
        const move = <T extends { key: string; startTime: number; endTime: number }>(items: T[]) =>
          items.map((item) => {
            if (item.key !== key) return item;
            if (mode === "move") {
              const startTime = Math.max(0, orig.a + dt);
              return { ...item, startTime, endTime: startTime + orig.b - orig.a };
            }
            return mode === "start"
              ? { ...item, startTime: clamp(orig.a + dt, 0, item.endTime - MIN_SPAN) }
              : { ...item, endTime: Math.max(item.startTime + MIN_SPAN, orig.b + dt) };
          });
        if (kind === "strip") setStrips(move);
        else if (kind === "image") setImageLayers(move);
        else setOverlays(move);
      }
    }
    function onUp() {
      setDrag(null);
      setSnapGuide(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, pxPerSec, snapEnabled]);

  async function handleRender() {
    if (timeline.length === 0) return;
    await enqueueEditorProject(
      draftToRenderParams({ timeline, audioLayers, strips, imageLayers, overlays, resolution, pxPerSec })
    );
    await loadProjects();
  }

  async function handleNewProject() {
    if (!window.confirm("Çizelge ve tüm katmanlar silinecek. Yeni projeye başlansın mı?")) return;
    setTimeline([]);
    setSelectedKey(null);
    setSelectedLayer(null);
    setOverlays([]);
    setStrips([]);
    setImageLayers([]);
    setAudioLayers([]);
    setPreviewPlaying(false);
    setPreviewIndex(0);
    setPreviewGlobalTime(0);
    loadedClipKeyRef.current = null;
    await clearDraft();
  }

  // Rebuilds the timeline from a saved render so it can be revised. The saved
  // project keeps only what the render needed; labels and source lengths are
  // looked up again. The original stays, the revision renders as a new entry.
  async function handleEditProject(project: EditorProject) {
    if (timeline.length > 0 && !window.confirm("Çizelgedeki mevcut çalışma bu videoyla değiştirilecek. Devam edilsin mi?")) {
      return;
    }
    const fileName = (url: string) => url.split("/").pop() ?? url;
    const extracted = (project.audioLayers ?? []).filter((l) => project.clips.some((c) => c.sourcePath === l.src));
    const clips: TimelineClip[] = await Promise.all(
      project.clips.map(async (c) => ({
        key: crypto.randomUUID(),
        sourceUrl: c.sourcePath,
        label: library.find((item) => item.sourceUrl === c.sourcePath)?.label ?? fileName(c.sourcePath),
        knownDuration: await probeDuration(c.sourcePath, c.trimEnd),
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
        transitionAfter: c.transitionAfter,
        muteOriginal: c.muteOriginal ?? false,
        volume: c.volume,
        audioExtracted: Boolean(c.muteOriginal) && extracted.some((l) => l.src === c.sourcePath),
      }))
    );
    const layers: AudioLayer[] = await Promise.all(
      (project.audioLayers ?? []).map(async (l) => {
        const clipIndex = project.clips.findIndex((c) => c.sourcePath === l.src);
        return {
          ...l,
          key: crypto.randomUUID(),
          kind: clipIndex >= 0 ? "extracted" : l.src.startsWith("/voices/") || !l.loop ? "voice" : "music",
          label: l.filename ?? (clipIndex >= 0 ? `Klip ${clipIndex + 1} sesi` : fileName(l.src)),
          sourceDuration: await probeDuration(l.src, l.trimEnd),
          loop: l.loop ?? false,
        } satisfies AudioLayer;
      })
    );
    // Older renders kept music and voiceover in their own fields.
    const clipsLength = project.clips.reduce((sum, c) => sum + c.trimEnd - c.trimStart, 0);
    if (project.musicUrl) {
      layers.push({
        key: crypto.randomUUID(),
        kind: "music",
        label: fileName(project.musicUrl),
        src: project.musicUrl,
        start: 0,
        trimStart: 0,
        trimEnd: clipsLength,
        sourceDuration: await probeDuration(project.musicUrl, clipsLength),
        volume: project.musicVolume,
        loop: true,
      });
    }
    if (project.voiceUrl) {
      const duration = await probeDuration(project.voiceUrl, clipsLength);
      layers.push({
        key: crypto.randomUUID(),
        kind: "voice",
        label: fileName(project.voiceUrl),
        src: project.voiceUrl,
        start: project.voiceStartTime,
        trimStart: 0,
        trimEnd: duration,
        sourceDuration: duration,
        volume: project.voiceVolume,
        loop: false,
      });
    }

    clearTransition();
    timelineRef.current = clips;
    setTimeline(clips);
    setAudioLayers(layers);
    setStrips((project.strips ?? []).map((s) => ({ ...s, key: crypto.randomUUID() })));
    setImageLayers(
      (project.imageLayers ?? []).map((l) => ({ ...l, key: crypto.randomUUID(), label: l.filename ?? fileName(l.src) }))
    );
    setOverlays(
      project.overlays.map((o) => {
        const legacy = o as { position?: keyof typeof TEXT_POSITION_Y };
        return {
          ...o,
          key: crypto.randomUUID(),
          cx: o.cx ?? 0.5,
          cy: o.cy ?? TEXT_POSITION_Y[legacy.position ?? "bottom"],
          motion: o.motion ?? "none",
          fontSize: o.fontSize ?? 48,
          color: o.color ?? "#ffffff",
        };
      })
    );
    setResolution(`${project.width}x${project.height}`);
    setSelectedKey(null);
    setSelectedLayer(null);
    setPreviewPlaying(false);
    setPreviewIndex(0);
    setPreviewGlobalTime(0);
    loadedClipKeyRef.current = null;
    autoLoadedRef.current = false;
    setPreviewGeneration((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteProject(id: string) {
    if (!window.confirm("Bu düzenlemeyi silmek istediğine emin misin?")) return;
    await deleteEditorProject(id);
    await loadProjects();
  }

  const selectedClip = timeline.find((c) => c.key === selectedKey) ?? null;
  const selectedAudio = selectedLayer?.type === "audio" ? audioLayers.find((l) => l.key === selectedLayer.key) : undefined;
  const selectedStrip = selectedLayer?.type === "strip" ? strips.find((s) => s.key === selectedLayer.key) : undefined;
  const selectedText = selectedLayer?.type === "text" ? overlays.find((o) => o.key === selectedLayer.key) : undefined;
  const selectedImage = selectedLayer?.type === "image" ? imageLayers.find((l) => l.key === selectedLayer.key) : undefined;

  // A selected layer holds still while paused, even if the playhead is outside
  // its time range: a moving or hidden layer can't be grabbed and placed.
  const isPosed = (key: string) => !previewPlaying && selectedLayer?.key === key;
  const inPreview = (key: string, start: number, end: number) =>
    isPosed(key) || (previewGlobalTime >= start - PREVIEW_MOUNT_MARGIN && previewGlobalTime <= end + PREVIEW_MOUNT_MARGIN);

  function clipLeftPx(index: number): number {
    return cumulativeDurationBefore(index) * pxPerSec;
  }
  const layersEnd = Math.max(
    totalDuration,
    ...audioLayers.map((l) => l.start + l.trimEnd - l.trimStart),
    ...strips.map((s) => s.endTime),
    ...imageLayers.map((l) => l.endTime),
    ...overlays.map((o) => o.endTime)
  );
  const timelineWidthPx = Math.max(600, layersEnd * pxPerSec + 60);
  const rulerStep = pxPerSec >= 30 ? 5 : pxPerSec >= 10 ? 15 : 30;

  function startDrag(
    kind: "clip" | LayerType,
    key: string,
    orig: { a: number; b: number; c: number },
    mode: DragMode,
    e: ReactMouseEvent
  ) {
    setDrag({ kind, key, mode, startX: e.clientX, orig });
  }

  // Where a dragged edge can land: cuts, other layers' edges and the playhead.
  // A trimmed clip's own cuts move with it, so a clip only sees the layers.
  function collectSnapPoints(kind: "clip" | LayerType | "playhead", key: string): number[] {
    const points: number[] = [];
    if (kind !== "clip") {
      points.push(0, totalDuration);
      timeline.forEach((_, i) => points.push(cumulativeDurationBefore(i)));
    }
    if (kind !== "playhead") points.push(previewGlobalTime);
    for (const l of audioLayers) if (l.key !== key) points.push(l.start, l.start + l.trimEnd - l.trimStart);
    for (const l of [...strips, ...imageLayers, ...overlays]) {
      if (l.key !== key) points.push(l.startTime, l.endTime);
    }
    return points;
  }

  function selectLayer(type: LayerType, key: string) {
    setSelectedKey(null);
    setSelectedLayer({ type, key });
  }

  return (
    <main className="flex h-[calc(100dvh-3.5rem)] w-full flex-col gap-3 overflow-hidden px-4 py-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold tracking-tight">Video Editörü</h1>
        <span className="text-muted-foreground text-xs tabular-nums">
          {timeline.length} klip · {totalDuration.toFixed(1)}sn
        </span>
        <div className="ml-auto flex items-center gap-3">
          <RatioPicker compact options={VIDEO_RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} />
          <span className="text-muted-foreground text-xs">{draftStatus}</span>
          <Button variant="secondary" onClick={handleNewProject} disabled={timeline.length === 0}>
            Yeni proje
          </Button>
          <Button onClick={handleRender} disabled={timeline.length === 0}>
            Videoyu Oluştur
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_340px] gap-3">
        <Card size="sm" className="min-h-0">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="bg-muted/60 flex shrink-0 gap-1 rounded-lg p-1">
              {(["library", "projects"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSideTab(tab)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                    sideTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "library" ? "Kütüphane" : `Render'lar${projects.length ? ` (${projects.length})` : ""}`}
                </button>
              ))}
            </div>
            {sideTab === "library" ? (
            <>
            {library.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Henüz eklenebilecek bitmiş video yok.{" "}
                <Link href="/video" className="text-primary underline-offset-4 hover:underline">
                  Video sayfasından
                </Link>{" "}
                üret.
              </p>
            ) : (
              <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {library.map((item, i) => (
                  <div
                    key={item.sourceUrl + i}
                    draggable
                    onDragStart={() => setDraggingLibrary(item)}
                    onDragEnd={() => setDraggingLibrary(null)}
                    className="border-border flex cursor-grab items-center gap-2 rounded-lg border p-2 active:cursor-grabbing"
                  >
                    <video
                      src={item.sourceUrl}
                      muted
                      preload="metadata"
                      className="h-12 w-16 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs">{item.label}</p>
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {item.kind}
                      </Badge>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => addToTimeline(item)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted-foreground text-[11px]">
              Sürükleyip zaman çizelgesine bırakabilir, ya da + ile sona ekleyebilirsin.
            </p>
            </>
            ) : (
            <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {projects.length === 0 && (
                <p className="text-muted-foreground text-sm">Henüz render alınmadı.</p>
              )}
          {projects.map((project) => (
            <Card key={project.id} size="sm" className="shrink-0">
              <CardContent className="flex flex-col gap-2">
                <div className="bg-muted flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-md">
                  {(project.status === "running" || project.status === "queued") && (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="text-primary size-6 animate-spin" />
                      <span className="text-muted-foreground text-xs">Oluşturuluyor...</span>
                      <ElapsedTimer since={project.createdAt} />
                    </div>
                  )}
                  {project.status === "error" && (
                    <span className="text-destructive line-clamp-4 p-3 text-center text-xs">
                      {project.error}
                    </span>
                  )}
                  {project.status === "done" && project.finalUrl && (
                    <button
                      type="button"
                      onClick={() => setFullscreenUrl(project.finalUrl!)}
                      className="h-full w-full"
                    >
                      <video
                        src={project.finalUrl}
                        muted
                        loop
                        autoPlay
                        className="h-full w-full object-cover"
                      />
                    </button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{project.clips.length} klip</Badge>
                    {project.musicUrl && <Badge variant="secondary">Müzikli</Badge>}
                    {project.voiceUrl && <Badge variant="secondary">Seslendirmeli</Badge>}
                    {(project.audioLayers?.length ?? 0) > 0 && (
                      <Badge variant="secondary">{project.audioLayers!.length} ses katmanı</Badge>
                    )}
                    {(project.imageLayers?.length ?? 0) > 0 && (
                      <Badge variant="secondary">{project.imageLayers!.length} görsel</Badge>
                    )}
                    {(project.strips?.length ?? 0) > 0 && (
                      <Badge variant="secondary">{project.strips!.length} şerit</Badge>
                    )}
                    {project.overlays.length > 0 && (
                      <Badge variant="secondary">{project.overlays.length} yazı</Badge>
                    )}
                    <span className="text-muted-foreground w-full text-[11px]">
                      {new Date(project.createdAt).toLocaleString("tr-TR")}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-3">
                    {(project.status === "done" || project.status === "error") && (
                      <button
                        type="button"
                        onClick={() => handleEditProject(project)}
                        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                      >
                        Düzenle
                      </button>
                    )}
                    {project.status === "done" && project.finalUrl && (
                      <a
                        href={project.finalUrl}
                        download
                        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                      >
                        İndir
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(project.id)}
                      className="text-destructive text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
            )}
          </CardContent>
        </Card>

      <Card size="sm" className="min-h-0">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Genel Önizleme</h2>
            <span className="text-muted-foreground text-xs tabular-nums">
              {previewGlobalTime.toFixed(1)}sn / {totalDuration.toFixed(1)}sn
            </span>
          </div>

          {timeline.length === 0 ? (
            <div className="border-border text-muted-foreground flex min-h-0 flex-1 items-center justify-center rounded-lg border-2 border-dashed text-sm">
              Önizlemek için zaman çizelgesine klip ekle
            </div>
          ) : (
            <>
              <div ref={previewAreaRef} className="flex min-h-0 flex-1 items-center justify-center">
              <div
                ref={previewBoxRef}
                className="relative overflow-hidden rounded-lg bg-black"
                style={{
                  aspectRatio: `${resolutionWidth} / ${resolutionHeight}`,
                  width: previewWidth,
                  containerType: "inline-size",
                }}
              >
                <video
                  ref={previewVideoRef}
                  onTimeUpdate={handlePreviewTimeUpdate}
                  className="h-full w-full object-contain"
                />
                <video
                  ref={transitionVideoRef}
                  data-transition-overlay
                  className="absolute inset-0 hidden h-full w-full bg-black object-contain"
                />
                {imageLayers
                  .filter((l) => inPreview(l.key, l.startTime, l.endTime))
                  .map((l) => {
                    const posed = isPosed(l.key);
                    const marquee = l.motion === "marquee";
                    const crop = l.crop ?? NO_CROP;
                    const keptWidth = 1 - crop.left - crop.right;
                    const keptHeight = 1 - crop.top - crop.bottom;
                    return (
                      <div
                        key={`${l.key}-${l.motion}-${posed}`}
                        onMouseDown={(e) => startPreviewMove(e, "image", l.key, l.cx, l.cy, marquee)}
                        data-motion={posed ? "none" : l.motion}
                        data-posed={posed}
                        data-start={l.startTime}
                        data-end={l.endTime}
                        data-rotation={l.rotation}
                        className={cn(
                          "absolute",
                          marquee ? "cursor-ns-resize" : "cursor-move",
                          selectedLayer?.key === l.key && "outline-primary outline-2"
                        )}
                        style={{
                          left: `${posed && marquee ? 50 : l.cx * 100}%`,
                          top: `${l.cy * 100}%`,
                          width: `${l.widthPct * 100}%`,
                          aspectRatio: `${keptWidth} / ${keptHeight * (l.aspect ?? 1)}`,
                        }}
                      >
                        <div className="absolute inset-0 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={l.src}
                            alt=""
                            draggable={false}
                            onLoad={(e) => {
                              const { naturalWidth, naturalHeight } = e.currentTarget;
                              if (naturalWidth && naturalHeight / naturalWidth !== l.aspect) {
                                updateImage(l.key, { aspect: naturalHeight / naturalWidth });
                              }
                            }}
                            className="absolute max-w-none"
                            style={{
                              width: `${100 / keptWidth}%`,
                              left: `${(-crop.left / keptWidth) * 100}%`,
                              top: `${(-crop.top / keptHeight) * 100}%`,
                            }}
                          />
                        </div>
                        {posed && (
                          <>
                            {(
                              [
                                ["left-0 top-0 cursor-nwse-resize"],
                                ["left-full top-0 cursor-nesw-resize"],
                                ["left-0 top-full cursor-nesw-resize"],
                                ["left-full top-full cursor-nwse-resize"],
                              ] as const
                            ).map(([position]) => (
                              <div
                                key={position}
                                data-handle="resize"
                                title="Boyutlandır"
                                onMouseDown={(e) => startImageResize(e, l)}
                                className={cn(
                                  "bg-primary absolute z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white",
                                  position
                                )}
                              />
                            ))}
                            {(
                              [
                                ["left", "left-0 top-1/2 h-8 w-2 cursor-ew-resize"],
                                ["right", "left-full top-1/2 h-8 w-2 cursor-ew-resize"],
                                ["top", "left-1/2 top-0 h-2 w-8 cursor-ns-resize"],
                                ["bottom", "left-1/2 top-full h-2 w-8 cursor-ns-resize"],
                              ] as const
                            ).map(([side, position]) => (
                              <div
                                key={side}
                                data-handle={`crop-${side}`}
                                title="Kırp"
                                onMouseDown={(e) => startImageCrop(e, l, side)}
                                className={cn(
                                  "absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/60 bg-white",
                                  position
                                )}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}
                {strips
                  .filter((s) => inPreview(s.key, s.startTime, s.endTime))
                  .map((s) => {
                    const layout = layoutStrip(s.text, resolutionWidth, resolutionHeight, s.yPct);
                    return (
                      <div
                        key={s.key}
                        data-posed={isPosed(s.key)}
                        data-start={s.startTime}
                        data-end={s.endTime}
                        className="pointer-events-none absolute inset-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={layout.image}
                          alt=""
                          draggable={false}
                          onMouseDown={(e) => startPreviewMove(e, "strip", s.key, 0, s.yPct)}
                          className={cn(
                            "pointer-events-auto absolute max-w-none cursor-ns-resize",
                            selectedLayer?.key === s.key && "outline-primary outline-2"
                          )}
                          style={{
                            left: `${(layout.x / resolutionWidth) * 100}%`,
                            top: `${(layout.y / resolutionHeight) * 100}%`,
                            width: `${(layout.width / resolutionWidth) * 100}%`,
                          }}
                        />
                        {layout.lines.map((line, i) => (
                          <span
                            key={i}
                            className="absolute -translate-y-1/2 whitespace-nowrap text-white"
                            style={{
                              left: `${(layout.textX / resolutionWidth) * 100}%`,
                              top: `${(line.centerY / resolutionHeight) * 100}%`,
                              fontSize: `${(layout.fontSize / resolutionWidth) * 100}cqw`,
                              fontFamily: "var(--font-sans), sans-serif",
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                          >
                            {line.text}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                {overlays
                  .filter((o) => inPreview(o.key, o.startTime, o.endTime))
                  .map((o) => {
                    const posed = isPosed(o.key);
                    const marquee = o.motion === "marquee";
                    return (
                      <span
                        key={`${o.key}-${o.motion}-${posed}`}
                        onMouseDown={(e) => startPreviewMove(e, "text", o.key, o.cx, o.cy, marquee)}
                        data-motion={posed ? "none" : o.motion}
                        data-posed={posed}
                        data-start={o.startTime}
                        data-end={o.endTime}
                        data-rotation={0}
                        className={cn(
                          "absolute whitespace-nowrap select-none",
                          marquee ? "cursor-ns-resize" : "cursor-move",
                          selectedLayer?.key === o.key && "outline-primary outline-2",
                          !o.text.trim() && "opacity-60"
                        )}
                        style={{
                          left: `${posed && marquee ? 50 : o.cx * 100}%`,
                          top: `${o.cy * 100}%`,
                          fontSize: `${(o.fontSize / resolutionWidth) * 100}cqw`,
                          color: o.color,
                          fontFamily: "var(--font-sans), sans-serif",
                          fontWeight: 700,
                          lineHeight: 1.2,
                          WebkitTextStroke: `${(3 / resolutionWidth) * 100}cqw black`,
                          paintOrder: "stroke fill",
                        }}
                      >
                        {o.text || "Metin"}
                      </span>
                    );
                  })}
              </div>
              </div>
              {audioLayers.map((l) => (
                <audio
                  key={l.key}
                  src={l.src}
                  preload="auto"
                  ref={(el) => {
                    if (el) audioElsRef.current.set(l.key, el);
                    else audioElsRef.current.delete(l.key);
                  }}
                />
              ))}

              <div className="w-full shrink-0 space-y-3">
                <div
                  ref={progressBarRef}
                  onMouseDown={(e) => {
                    setScrubbing(true);
                    handleProgressSeek(e.clientX);
                  }}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setScrubHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
                  }}
                  onMouseLeave={() => setScrubHover(null)}
                  className="group/scrub relative flex h-5 w-full cursor-pointer items-center select-none"
                  role="slider"
                  aria-label="Oynatma konumu"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(totalDuration * 10) / 10}
                  aria-valuenow={Math.round(previewGlobalTime * 10) / 10}
                >
                  {(() => {
                    const pct = totalDuration > 0 ? (previewGlobalTime / totalDuration) * 100 : 0;
                    const active = scrubbing || scrubHover !== null;
                    return (
                      <>
                        <div
                          className={cn(
                            "bg-foreground/15 relative w-full overflow-hidden rounded-full transition-[height] duration-150",
                            active ? "h-1.5" : "h-1"
                          )}
                        >
                          {scrubHover !== null && (
                            <div
                              className="bg-foreground/20 absolute inset-y-0 left-0"
                              style={{ width: `${scrubHover * 100}%` }}
                            />
                          )}
                          <div className="bg-primary absolute inset-y-0 left-0" style={{ width: `${pct}%` }} />
                        </div>
                        {/* Scene boundaries */}
                        {totalDuration > 0 &&
                          timeline.slice(1).map((c, i) => (
                            <span
                              key={c.key}
                              className="bg-background/90 pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                              style={{ left: `${(cumulativeDurationBefore(i + 1) / totalDuration) * 100}%` }}
                            />
                          ))}
                        <span
                          className={cn(
                            "ring-primary pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-2 transition-transform duration-150",
                            active ? "scale-100" : "scale-75"
                          )}
                          style={{ left: `${pct}%` }}
                        />
                        {scrubHover !== null && (
                          <span
                            className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-sm px-1.5 py-0.5 text-[11px] font-medium tabular-nums shadow-md ring-1"
                            style={{ left: `${scrubHover * 100}%` }}
                          >
                            {formatClock(scrubHover * totalDuration)}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Button onClick={togglePreviewPlayback}>
                    {previewPlaying ? (
                      <>
                        <Pause className="size-4" />
                        Durdur
                      </>
                    ) : (
                      <>
                        <Play className="size-4" />
                        Önizle
                      </>
                    )}
                  </Button>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    <span className="text-foreground font-medium">{formatClock(previewGlobalTime)}</span> /{" "}
                    {formatClock(totalDuration)} · Sahne{" "}
                    {Math.min(previewIndex + 1, timeline.length)}/{timeline.length}
                  </span>

                  <label className="ml-auto flex items-center gap-2 text-xs">
                    Klip sesi
                    <Range
                      min={0}
                      max={1}
                      step={0.05}
                      value={previewVolume}
                      onChange={(e) => setPreviewVolume(Number(e.target.value))}
                      className="w-24"
                    />
                  </label>
                </div>
              </div>

            </>
          )}
        </CardContent>
      </Card>

        <div className="thin-scrollbar flex min-h-0 flex-col gap-3 overflow-y-auto">
          {selectedClip && (
            <Card size="sm" className="shrink-0">
              <CardContent>
                <h2 className="mb-3 text-sm font-semibold">Klip: {selectedClip.label}</h2>
                <ClipPanel
                  clip={selectedClip}
                  onChange={(patch) => updateClip(selectedClip.key, patch)}
                  onExtractAudio={() => extractClipAudio(selectedClip)}
                />
              </CardContent>
            </Card>
          )}

          <Card size="sm" className="shrink-0">
            <CardContent className="flex flex-col gap-4">
              {selectedAudio && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">Ses katmanı: {selectedAudio.label}</h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <VolumeControl
                      key={selectedAudio.key}
                      value={selectedAudio.volume}
                      onChange={(volume) => updateAudioLayer(selectedAudio.key, { volume })}
                    />
                    <label className="flex items-center gap-2">
                      Başlangıç (sn)
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Number(selectedAudio.start.toFixed(2))}
                        onChange={(e) => updateAudioLayer(selectedAudio.key, { start: Math.max(0, Number(e.target.value)) })}
                        className="border-input w-20 rounded border bg-transparent px-2 py-1"
                      />
                    </label>
                    {selectedAudio.kind !== "extracted" && (
                      <Toggle
                        checked={selectedAudio.loop}
                        onChange={(loop) => updateAudioLayer(selectedAudio.key, { loop })}
                        label="Tekrarla"
                      />
                    )}
                    <Button size="sm" variant="secondary" onClick={removeSelected} className="ml-auto">
                      <X className="size-3.5" />
                      Sil
                    </Button>
                  </div>
                </div>
              )}

              {selectedStrip && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">Şerit</h3>
                  <input
                    type="text"
                    placeholder="Şerit yazısı (büyük harfe çevrilir, uzunsa iki satıra iner)"
                    value={selectedStrip.text}
                    onChange={(e) => updateStrip(selectedStrip.key, { text: e.target.value })}
                    className="border-input rounded border bg-transparent px-2 py-1.5 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="flex items-center gap-2">
                      Yükseklik
                      <Range
                        min={0.1}
                        max={0.92}
                        step={0.01}
                        value={selectedStrip.yPct}
                        onChange={(e) => updateStrip(selectedStrip.key, { yPct: Number(e.target.value) })}
                        className="w-32"
                      />
                    </label>
                    <Button size="sm" variant="secondary" onClick={removeSelected} className="ml-auto">
                      <X className="size-3.5" />
                      Sil
                    </Button>
                  </div>
                </div>
              )}

              {selectedText && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">Yazı</h3>
                  <input
                    type="text"
                    placeholder="Metin"
                    value={selectedText.text}
                    onChange={(e) => updateOverlay(selectedText.key, { text: e.target.value })}
                    className="border-input rounded border bg-transparent px-2 py-1.5 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <Select
                      value={selectedText.motion}
                      onValueChange={(v) => v && updateOverlay(selectedText.key, { motion: v as MotionType })}
                    >
                      <SelectTrigger className="h-7 w-44 text-xs">
                        <SelectValue>{(value: MotionType) => MOTIONS.find((m) => m.value === value)?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2">
                      Boyut
                      <input
                        type="number"
                        min={16}
                        max={200}
                        value={selectedText.fontSize}
                        onChange={(e) => updateOverlay(selectedText.key, { fontSize: Number(e.target.value) || 48 })}
                        className="border-input w-16 rounded border bg-transparent px-2 py-1"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      Renk
                      <input
                        type="color"
                        value={selectedText.color}
                        onChange={(e) => updateOverlay(selectedText.key, { color: e.target.value })}
                        className="h-7 w-9 cursor-pointer bg-transparent"
                      />
                    </label>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          ["top", "Üst"],
                          ["center", "Orta"],
                          ["bottom", "Alt"],
                        ] as const
                      ).map(([position, label]) => (
                        <Button
                          key={position}
                          size="sm"
                          variant="secondary"
                          onClick={() => updateOverlay(selectedText.key, { cx: 0.5, cy: TEXT_POSITION_Y[position] })}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <Button size="sm" variant="secondary" onClick={removeSelected} className="ml-auto">
                      <X className="size-3.5" />
                      Sil
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {selectedText.motion === "marquee"
                      ? "Kayan yazı ekranı boydan boya geçer, önizlemede yalnızca yukarı aşağı sürüklenir."
                      : "Yerini önizlemede sürükleyerek ayarla."}{" "}
                    Durdururken seçili katman sabit görünür, hareketini Önizle ile izlersin.
                  </p>
                </div>
              )}

              {selectedImage && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">Görsel: {selectedImage.label}</h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <Select
                      value={selectedImage.motion}
                      onValueChange={(v) => v && updateImage(selectedImage.key, { motion: v as MotionType })}
                    >
                      <SelectTrigger className="h-7 w-44 text-xs">
                        <SelectValue>{(value: MotionType) => MOTIONS.find((m) => m.value === value)?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2">
                      Boyut
                      <Range
                        min={MIN_IMAGE_WIDTH}
                        max={MAX_IMAGE_WIDTH}
                        step={0.005}
                        value={selectedImage.widthPct}
                        onChange={(e) => updateImage(selectedImage.key, { widthPct: Number(e.target.value) })}
                        className="w-32"
                      />
                      {Math.round(selectedImage.widthPct * 100)}%
                    </label>
                    <label className="flex items-center gap-2">
                      Açı
                      <Range
                        min={-180}
                        max={180}
                        value={selectedImage.rotation}
                        onChange={(e) => updateImage(selectedImage.key, { rotation: Number(e.target.value) })}
                        className="w-32"
                      />
                      {selectedImage.rotation}°
                    </label>
                    <Button size="sm" variant="secondary" onClick={removeSelected} className="ml-auto">
                      <X className="size-3.5" />
                      Sil
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {CROP_SIDES.map(({ side, label }) => (
                      <label key={side} className="flex items-center gap-2">
                        {label}
                        <Range
                          min={0}
                          max={0.95}
                          step={0.005}
                          aria-label={`${label} kırpma`}
                          value={(selectedImage.crop ?? NO_CROP)[side]}
                          onChange={(e) => updateImage(selectedImage.key, cropPatch(selectedImage, side, Number(e.target.value)))}
                          className="w-24"
                        />
                        {Math.round((selectedImage.crop ?? NO_CROP)[side] * 100)}%
                      </label>
                    ))}
                    <Button size="sm" variant="secondary" onClick={() => resetCrop(selectedImage)}>
                      Kırpmayı sıfırla
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Önizlemede ortasından sürükleyerek taşı, yuvarlak köşelerden boyutlandır, beyaz
                    kenarlardan kırp. Durdururken seçili katman sabit görünür.
                  </p>
                </div>
              )}

              {!selectedLayer && (
                <p className="text-muted-foreground text-xs">
                  Çizelgedeki bir katmana tıklayınca ayarları burada açılır. Kenarlarından çekerek kırp,
                  ortasından tutup kaydır, kesimlere ve diğer katmanlara kendiliğinden hizalanır. Ctrl+B oynatma çizgisinde böler, Delete siler, Boşluk oynatır.
                </p>
              )}

            </CardContent>
          </Card>
        </div>
      </div>

          <Card size="sm" className="max-h-[44%] min-h-0 shrink-0">
            <CardContent className="thin-scrollbar flex min-h-0 flex-col gap-3 overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">
                  Zaman Çizelgesi ({timeline.length} klip{totalDuration > 0 && `, ~${totalDuration.toFixed(1)}sn`})
                </h2>
                <div className="ml-auto">
                  <Toggle checked={snapEnabled} onChange={setSnapEnabled} label="Hizala" />
                </div>
                <label className="text-muted-foreground flex items-center gap-2 text-xs">
                  Yakınlaştır
                  <Range
                    min={4}
                    max={100}
                    value={pxPerSec}
                    onChange={(e) => setPxPerSec(Number(e.target.value))}
                    className="w-28"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer")}>
                  {uploadingVideo ? <Loader2 className="size-3.5 animate-spin" /> : <Clapperboard className="size-3.5" />}
                  {uploadingVideo ? "Yükleniyor..." : "Video ekle"}
                  <input
                    type="file"
                    accept="video/*,.mkv"
                    multiple
                    disabled={uploadingVideo}
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                </label>
                <Button size="sm" variant="secondary" onClick={splitAtPlayhead} disabled={timeline.length === 0} title="Ctrl+B">
                  <Scissors className="size-3.5" />
                  Böl
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!selectedClip || selectedClip.audioExtracted}
                  onClick={() => selectedClip && extractClipAudio(selectedClip)}
                >
                  <AudioLines className="size-3.5" />
                  Sesi ayır
                </Button>
                <Button size="sm" variant="secondary" onClick={addStrip} disabled={timeline.length === 0}>
                  <RectangleHorizontal className="size-3.5" />
                  Şerit
                </Button>
                <Button size="sm" variant="secondary" onClick={addOverlay} disabled={timeline.length === 0}>
                  <Type className="size-3.5" />
                  Yazı
                </Button>
                <label
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "cursor-pointer",
                    timeline.length === 0 && "pointer-events-none opacity-50"
                  )}
                >
                  <ImagePlus className="size-3.5" />
                  PNG / Görsel
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} className="hidden" />
                </label>
                <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer")}>
                  <Music className="size-3.5" />
                  Müzik
                  <input type="file" accept="audio/*" onChange={(e) => handleAudioUpload(e, "music")} className="hidden" />
                </label>
                <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer")}>
                  <Mic className="size-3.5" />
                  Ses dosyası
                  <input type="file" accept="audio/*" onChange={(e) => handleAudioUpload(e, "voice")} className="hidden" />
                </label>
                <Select value="" onValueChange={(v) => v && applyTransition(v as TransitionType)}>
                  <SelectTrigger className="h-8 w-44 text-xs" disabled={timeline.length < 2}>
                    <SelectValue placeholder="Geçişi hepsine uygula" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSITIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {voiceLibrary.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      const clip = voiceLibrary.find((c) => c.id === v);
                      if (clip) addVoiceFromLibrary(clip);
                    }}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Seslendirme kütüphanesi" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {voiceLibrary.map((clip) => (
                        <SelectItem key={clip.id} value={clip.id}>
                          {clip.voice}: {clip.text.slice(0, 40)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {uploadError && <p className="text-destructive text-xs">{uploadError}</p>}

              {timeline.length === 0 ? (
                <label
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => handleBlockDrop(0)}
                  className="border-border text-muted-foreground flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-sm"
                >
                  Video seçmek için tıkla ya da kütüphaneden sürükle
                  <input
                    type="file"
                    accept="video/*,.mkv"
                    multiple
                    disabled={uploadingVideo}
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex gap-2">
                  <div className="text-muted-foreground flex w-14 shrink-0 flex-col gap-2 pt-0.5 text-[11px]">
                    <div className="h-5" />
                    <div className="flex h-16 items-center">Video</div>
                    <div className="flex h-6 items-center">Geçiş</div>
                    <div className="flex h-7 items-center">Görsel</div>
                    <div className="flex h-7 items-center">Şerit</div>
                    <div className="flex h-7 items-center">Yazı</div>
                    {audioLayers.map((l, i) => (
                      <div key={l.key} className="flex h-7 items-center">
                        Ses {i + 1}
                      </div>
                    ))}
                  </div>

                  <div className="thin-scrollbar min-w-0 flex-1 overflow-x-auto pb-2">
                    <div className="relative flex flex-col gap-2" style={{ width: timelineWidthPx }}>
                      <div
                        ref={rulerRef}
                        onMouseDown={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          seekPreview((e.clientX - rect.left) / pxPerSec);
                          setDrag({ kind: "playhead", key: "", mode: "move", startX: 0, orig: { a: 0, b: 0, c: 0 } });
                        }}
                        className="border-border relative h-5 cursor-pointer border-b select-none"
                      >
                        {Array.from({ length: Math.ceil(timelineWidthPx / pxPerSec / rulerStep) }, (_, i) => (
                          <span
                            key={i}
                            className="text-muted-foreground border-border absolute bottom-0 border-l pl-1 text-[9px] tabular-nums"
                            style={{ left: i * rulerStep * pxPerSec }}
                          >
                            {Math.floor((i * rulerStep) / 60)}:{String((i * rulerStep) % 60).padStart(2, "0")}
                          </span>
                        ))}
                      </div>

                      {timeline.slice(1).map((clip, i) => (
                        <div
                          key={clip.key + "-cut"}
                          data-cut
                          className="border-foreground/30 pointer-events-none absolute inset-y-0 z-20 border-l border-dashed"
                          style={{ left: clipLeftPx(i + 1) }}
                        />
                      ))}

                      {snapGuide !== null && (
                        <div
                          data-snap-guide
                          className="pointer-events-none absolute inset-y-0 z-30 w-px bg-yellow-400"
                          style={{ left: snapGuide * pxPerSec }}
                        />
                      )}

                      <div
                        className="bg-primary pointer-events-none absolute inset-y-0 z-30 w-0.5"
                        style={{ left: previewGlobalTime * pxPerSec }}
                      />

                      {/* Video track */}
                      <div className="relative h-16">
                        {timeline.map((clip, i) => (
                          <div
                            key={clip.key}
                            draggable
                            onDragStart={() => setDragIndex(i)}
                            onDragEnd={() => setDragIndex(null)}
                            onDragOver={(e: DragEvent) => e.preventDefault()}
                            onDrop={() => handleBlockDrop(i)}
                            onClick={() => {
                              setSelectedKey(clip.key);
                              setSelectedLayer(null);
                            }}
                            className={cn(
                              "group absolute top-0 flex h-16 cursor-grab flex-col overflow-hidden rounded-lg border-2 active:cursor-grabbing",
                              selectedKey === clip.key ? "border-primary" : "border-transparent"
                            )}
                            style={{
                              left: clipLeftPx(i),
                              width: Math.max(14, (clip.trimEnd - clip.trimStart) * pxPerSec),
                            }}
                          >
                            <video
                              src={clip.sourceUrl}
                              muted
                              preload="metadata"
                              className="bg-muted h-full w-full object-cover"
                            />
                            <GripVertical className="text-background/80 absolute top-0.5 left-2.5 size-3.5 drop-shadow" />
                            <span className="bg-background/85 absolute right-0 bottom-0 left-0 truncate px-1 text-[10px] tabular-nums">
                              {(clip.trimEnd - clip.trimStart).toFixed(1)}sn
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeClip(clip.key);
                              }}
                              className="bg-background/85 text-destructive absolute top-0.5 right-3 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <X className="size-3" />
                            </button>
                            {(["start", "end"] as const).map((side) => (
                              <TrimHandle
                                key={side}
                                side={side}
                                onSelect={() => {
                                  setSelectedKey(clip.key);
                                  setSelectedLayer(null);
                                }}
                                onDragStart={(mode, e) =>
                                  startDrag("clip", clip.key, { a: clip.trimStart, b: clip.trimEnd, c: 0 }, mode, e)
                                }
                              />
                            ))}
                          </div>
                        ))}

                        <label
                          onDragOver={(e: DragEvent) => e.preventDefault()}
                          onDrop={() => handleBlockDrop(timeline.length)}
                          title="Video ekle"
                          className="border-border text-muted-foreground absolute top-0 flex h-16 w-12 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-xs"
                          style={{ left: clipLeftPx(timeline.length) + 4 }}
                        >
                          {uploadingVideo ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                          <input
                            type="file"
                            accept="video/*,.mkv"
                            multiple
                            disabled={uploadingVideo}
                            onChange={handleVideoUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Transitions: their own row, on the video track the trim handles sit on top of them */}
                      <div className="relative h-6">
                        {timeline.slice(0, -1).map((clip, i) => (
                          <div
                            key={clip.key + "-transition"}
                            className="absolute top-0"
                            style={{ left: clipLeftPx(i + 1) - 12 }}
                          >
                            <Select
                              value={clip.transitionAfter}
                              onValueChange={(v) => v && applyTransition(v as TransitionType, i)}
                            >
                              <SelectTrigger
                                title={TRANSITIONS.find((t) => t.value === clip.transitionAfter)?.label}
                                className={cn(
                                  "h-6 w-6 shrink-0 justify-center rounded-full border p-0 shadow [&>svg]:hidden",
                                  clip.transitionAfter === "cut"
                                    ? "bg-background border-border"
                                    : "bg-primary border-primary text-primary-foreground"
                                )}
                              >
                                <ArrowLeftRight className="size-3" />
                              </SelectTrigger>
                              <SelectContent>
                                {TRANSITIONS.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>

                      {/* Image track */}
                      <div className="relative h-7">
                        {imageLayers.map((l) => (
                          <TrackBar
                            key={l.key}
                            left={l.startTime * pxPerSec}
                            width={(l.endTime - l.startTime) * pxPerSec}
                            selected={selectedLayer?.key === l.key}
                            className="border-pink-500/40 bg-pink-500/20 text-pink-700 dark:text-pink-300"
                            icon={<ImagePlus className="size-3 shrink-0" />}
                            label={l.label}
                            onSelect={() => selectLayer("image", l.key)}
                            onDragStart={(mode, e) =>
                              startDrag("image", l.key, { a: l.startTime, b: l.endTime, c: 0 }, mode, e)
                            }
                            onRemove={() => setImageLayers((prev) => prev.filter((x) => x.key !== l.key))}
                          />
                        ))}
                      </div>

                      {/* Strip track */}
                      <div className="relative h-7">
                        {strips.map((s) => (
                          <TrackBar
                            key={s.key}
                            left={s.startTime * pxPerSec}
                            width={(s.endTime - s.startTime) * pxPerSec}
                            selected={selectedLayer?.key === s.key}
                            className="border-sky-500/40 bg-sky-500/20 text-sky-700 dark:text-sky-300"
                            icon={<RectangleHorizontal className="size-3 shrink-0" />}
                            label={s.text || "Şerit"}
                            onSelect={() => selectLayer("strip", s.key)}
                            onDragStart={(mode, e) =>
                              startDrag("strip", s.key, { a: s.startTime, b: s.endTime, c: 0 }, mode, e)
                            }
                            onRemove={() => setStrips((prev) => prev.filter((x) => x.key !== s.key))}
                          />
                        ))}
                      </div>

                      {/* Text overlay track */}
                      <div className="relative h-7">
                        {overlays.map((o) => (
                          <TrackBar
                            key={o.key}
                            left={o.startTime * pxPerSec}
                            width={(o.endTime - o.startTime) * pxPerSec}
                            selected={selectedLayer?.key === o.key}
                            className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            icon={<Type className="size-3 shrink-0" />}
                            label={o.text || "Yazı"}
                            onSelect={() => selectLayer("text", o.key)}
                            onDragStart={(mode, e) =>
                              startDrag("text", o.key, { a: o.startTime, b: o.endTime, c: 0 }, mode, e)
                            }
                            onRemove={() => removeOverlay(o.key)}
                          />
                        ))}
                      </div>

                      {/* Audio tracks: one row per layer */}
                      {audioLayers.map((l) => (
                        <div key={l.key} className="relative h-7">
                          <TrackBar
                            left={l.start * pxPerSec}
                            width={(l.trimEnd - l.trimStart) * pxPerSec}
                            selected={selectedLayer?.key === l.key}
                            className={
                              l.kind === "extracted"
                                ? "border-violet-500/40 bg-violet-500/20 text-violet-700 dark:text-violet-300"
                                : "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            }
                            icon={
                              l.kind === "music" ? (
                                <Music className="size-3 shrink-0" />
                              ) : l.kind === "voice" ? (
                                <Mic className="size-3 shrink-0" />
                              ) : (
                                <AudioLines className="size-3 shrink-0" />
                              )
                            }
                            label={l.label}
                            onSelect={() => selectLayer("audio", l.key)}
                            onDragStart={(mode, e) =>
                              startDrag("audio", l.key, { a: l.trimStart, b: l.trimEnd, c: l.start }, mode, e)
                            }
                            onRemove={() => setAudioLayers((prev) => prev.filter((x) => x.key !== l.key))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>


      {fullscreenUrl && (
        <FullscreenViewer
          src={fullscreenUrl}
          alt="düzenlenmiş video"
          kind="video"
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </main>
  );
}
