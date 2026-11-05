import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { FFMPEG_PATH } from "@/lib/ffmpeg-path";
import { layoutStrip } from "@/lib/editor-strip";
import { motionAngleExpr, type ImageCrop, type MotionType } from "@/lib/editor-motion";

import { tServer } from "@/lib/i18n-server";
const VIDEOS_DIR = path.join(process.cwd(), "public", "videos");
// Bundled Inter (SIL OFL, see assets/fonts/Inter-OFL.txt), the same face the
// editor preview uses, so rendered text matches what was positioned on screen
// and rendering doesn't depend on fonts installed on this machine.
const BOLD_FONT_PATH = path.join(process.cwd(), "assets", "fonts", "Inter-Bold.ttf");
const PUBLIC_DIR = path.join(process.cwd(), "public");
// xfade needs duration > 0 to behave predictably — a "cut" transition maps to
// the "fade" style at a duration short enough to read as instant, so cut and
// every real transition style share the same xfade code path.
const CUT_DURATION = 0.05;
const CROSSFADE_DURATION = 0.6;
// Speech from two scenes laid over each other for a whole video transition is
// unintelligible, so sound changes over in a moment at the transition's middle.
const AUDIO_CROSSFADE = 0.08;
// Phones record each side on its own mic, so the same speech differs between
// ears and sounds doubled, and one earbud misses part of it. Both ears get the
// same mix instead. Assumes stereo input: normalized clips always are.
const BOTH_EARS = "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1";

export type TransitionType =
  | "cut"
  | "fade"
  | "fadeblack"
  | "dissolve"
  | "slideleft"
  | "slideright"
  | "wipeleft"
  | "wiperight"
  | "circleopen"
  | "radial";

export type EditorClipInput = {
  sourcePath: string;
  trimStart: number;
  trimEnd: number;
  transitionAfter: TransitionType;
  muteOriginal?: boolean;
  volume?: number;
};

export type EditorOverlayInput = {
  text: string;
  startTime: number;
  endTime: number;
  cx: number;
  cy: number;
  motion?: MotionType;
  fontSize?: number;
  color?: string;
};

export type EditorImageLayerInput = {
  sourcePath: string;
  startTime: number;
  endTime: number;
  cx: number;
  cy: number;
  widthPct: number;
  rotation: number;
  motion: MotionType;
  crop?: ImageCrop;
};

export type EditorAudioLayerInput = {
  sourcePath: string;
  start: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  loop?: boolean;
};

export type EditorStripInput = {
  text: string;
  startTime: number;
  endTime: number;
  yPct: number;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Timeline clips can be still images (masal-mode slideshow: clean reference/
// scene images with no video-generation motion/particle artifacts at all) —
// detected by extension, not by probing, since a still image has no
// meaningful "duration" to seek/trim like a real video clip does.
function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// Some source clips (e.g. a video job generated with "Ses üret" off) have no
// audio stream at all, not just a silent one — ffmpeg's `-af`/`-map 0:a` on
// such a source fails the whole filtergraph downstream ("Stream specifier
// ':a' ... matches no streams"). ffmpeg itself (no ffprobe needed) lists
// stream info on stderr for a plain `-i` probe.
function probeHasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_PATH, ["-i", filePath]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)));
    proc.on("error", () => resolve(false));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(tServer("ffmpeg hatası (kod {code}): {v1}", { code, v1: stderr.slice(-800) })));
    });
    proc.on("error", reject);
  });
}

// ffmpeg's filtergraph parser treats ':' as an option separator and '\' as
// its own escape char even inside a quoted value on Windows paths — escape
// both before embedding a path in a filter (fontfile=, textfile=).
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

export async function renderTimeline(params: {
  id: string;
  clips: EditorClipInput[];
  width: number;
  height: number;
  fps: number;
  musicPath?: string;
  musicVolume: number;
  voicePath?: string;
  voiceVolume: number;
  voiceStartTime: number;
  overlays: EditorOverlayInput[];
  audioLayers?: EditorAudioLayerInput[];
  strips?: EditorStripInput[];
  imageLayers?: EditorImageLayerInput[];
}): Promise<string> {
  const { id, clips, width, height, fps, musicPath, musicVolume, voicePath, voiceVolume, voiceStartTime, overlays } =
    params;
  const audioLayers = params.audioLayers ?? [];
  const strips = params.strips ?? [];
  const imageLayers = params.imageLayers ?? [];
  if (clips.length === 0) throw new Error("En az 1 klip gerekli");

  const workDir = path.join(VIDEOS_DIR, `.editor-${id}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    // Stage 1: normalize + trim each clip to a shared resolution/fps/codec.
    // The library's clips can come from different projects with different
    // aspect ratios (portrait/landscape/square) — scale+pad avoids distortion,
    // and matching codec/fps/samplerate is required for xfade/acrossfade to
    // work across clips at all.
    const normalized: { path: string; duration: number }[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const duration = Math.max(0.2, clip.trimEnd - clip.trimStart);
      const outPath = path.join(workDir, `norm_${i}.mp4`);
      const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`;
      const isImage = isImagePath(clip.sourcePath);
      // Still images never carry audio and have no inherent timeline to seek/
      // trim — `-loop 1 -t duration` turns them into a fixed-length silent
      // clip instead of `-ss/-to` on a real video stream.
      const hasAudio = isImage ? false : await probeHasAudioStream(clip.sourcePath);
      await runFfmpeg(
        isImage
          ? [
              "-y",
              "-loop",
              "1",
              "-t",
              String(duration),
              "-i",
              clip.sourcePath,
              "-f",
              "lavfi",
              "-i",
              "anullsrc=channel_layout=stereo:sample_rate=48000",
              "-vf",
              vf,
              "-map",
              "0:v",
              "-map",
              "1:a",
              "-shortest",
              "-c:v",
              "libx264",
              "-pix_fmt",
              "yuv420p",
              "-preset",
              "veryfast",
              "-crf",
              "18",
              "-c:a",
              "aac",
              "-ar",
              "48000",
              "-ac",
              "2",
              outPath,
            ]
          : hasAudio
          ? [
              "-y",
              "-ss",
              String(clip.trimStart),
              "-to",
              String(clip.trimEnd),
              "-i",
              clip.sourcePath,
              "-vf",
              vf,
              // Muted clips keep a silent audio track (rather than dropping the
              // stream) so every normalized segment has the same stream layout —
              // the xfade/acrossfade chain and final amix don't need to
              // special-case clips with no audio.
              "-af",
              clip.muteOriginal ? "volume=0" : `volume=${clip.volume ?? 1}`,
              "-c:v",
              "libx264",
              "-pix_fmt",
              "yuv420p",
              "-preset",
              "veryfast",
              "-crf",
              "18",
              "-c:a",
              "aac",
              "-ar",
              "48000",
              "-ac",
              "2",
              outPath,
            ]
          : [
              // Source has no audio stream at all (e.g. a scene generated with
              // "Ses üret" off) — `-af`/`-map 0:a` would fail with no stream
              // to reference, so synthesize a silent track instead of one.
              "-y",
              "-ss",
              String(clip.trimStart),
              "-to",
              String(clip.trimEnd),
              "-i",
              clip.sourcePath,
              "-f",
              "lavfi",
              "-i",
              "anullsrc=channel_layout=stereo:sample_rate=48000",
              "-vf",
              vf,
              "-map",
              "0:v",
              "-map",
              "1:a",
              "-shortest",
              "-c:v",
              "libx264",
              "-pix_fmt",
              "yuv420p",
              "-preset",
              "veryfast",
              "-crf",
              "18",
              "-c:a",
              "aac",
              "-ar",
              "48000",
              "-ac",
              "2",
              outPath,
            ]
      );
      normalized.push({ path: outPath, duration });
    }

    // Stage 2: chain xfade (video) + acrossfade (audio) pairwise across all
    // clips, tracking the merged timeline's running duration so each
    // subsequent transition's offset lands in the right place.
    const inputArgs: string[] = [];
    let inputCount = 0;
    const addInput = (...args: string[]): number => {
      inputArgs.push(...args);
      return inputCount++;
    };
    normalized.forEach((n) => addInput("-i", n.path));

    // `[0:v]`/`[0:a]` are raw input references, not filter_complex pad labels
    // — `-map` only accepts bracketed names that a filter actually produced.
    // Passing clip 0 through a no-op filter first guarantees videoLabel/
    // audioLabel are always real pads, even with a single clip and no other
    // filters (xfade/drawtext/amix) in the chain at all.
    const filters: string[] = ["[0:v]null[v0]"];
    const transitionLength = (type: TransitionType) => (type === "cut" ? CUT_DURATION : CROSSFADE_DURATION);
    const audioOverlap = (length: number) => Math.min(length, AUDIO_CROSSFADE);
    // Each clip's sound is cut to exact length here. The normalized files run
    // a little long (AAC pads them), and across many clips that adds up to
    // audible lag behind the picture. apad covers audio that runs short.
    normalized.forEach(({ duration }, i) => {
      const before = i > 0 ? transitionLength(clips[i - 1].transitionAfter) : 0;
      const after = i < normalized.length - 1 ? transitionLength(clips[i].transitionAfter) : 0;
      const from = Math.min((before - audioOverlap(before)) / 2, duration * 0.25);
      const to = Math.max(duration - (after - audioOverlap(after)) / 2, duration * 0.75);
      filters.push(`[${i}:a]${BOTH_EARS},apad,atrim=start=${from.toFixed(3)}:end=${to.toFixed(3)},asetpts=PTS-STARTPTS[clipa${i}]`);
    });
    let videoLabel = "[v0]";
    let audioLabel = "[clipa0]";
    let runningDuration = normalized[0].duration;
    // Every transition overlaps two clips, so the render ends up shorter than
    // the editor's plain sum of clip lengths (0.05s per cut, more per crossfade).
    // Layers are timed against the editor's timeline; mapTime() converts, or
    // detached audio would slowly slip out of sync across many clips.
    const renderStarts: number[] = [0];

    for (let i = 1; i < normalized.length; i++) {
      const type = clips[i - 1].transitionAfter;
      const transitionDuration = transitionLength(type);
      // xfade's own "dissolve" is random per-pixel noise, which looks like a
      // broken encode; "Erime" means a smooth blend, same as the preview.
      const xfadeStyle = type === "cut" || type === "dissolve" ? "fade" : type;
      const offset = Math.max(0, runningDuration - transitionDuration);
      renderStarts.push(offset);
      const vOut = `[v${i}]`;
      const aOut = `[a${i}]`;
      filters.push(
        `${videoLabel}[${i}:v]xfade=transition=${xfadeStyle}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${vOut}`
      );
      filters.push(`${audioLabel}[clipa${i}]acrossfade=d=${audioOverlap(transitionDuration)}${aOut}`);
      videoLabel = vOut;
      audioLabel = aOut;
      runningDuration = runningDuration + normalized[i].duration - transitionDuration;
    }

    const mapTime = (t: number): number => {
      let editorStart = 0;
      for (let i = 0; i < normalized.length; i++) {
        const duration = normalized[i].duration;
        if (t < editorStart + duration) return renderStarts[i] + Math.max(0, t - editorStart);
        editorStart += duration;
      }
      return runningDuration;
    };

    // Where a visual layer stops. The last moments of a clip overlap the next
    // one, so a time near a clip's end maps inside the transition; a layer that
    // belongs to the clip has to be gone before the next scene starts showing.
    const mapEnd = (t: number): number => {
      let editorStart = 0;
      for (let i = 0; i < normalized.length; i++) {
        const duration = normalized[i].duration;
        if (t <= editorStart + duration + 1e-6) {
          const sceneEnd = i + 1 < normalized.length ? renderStarts[i + 1] : runningDuration;
          return Math.min(renderStarts[i] + Math.max(0, t - editorStart), sceneEnd);
        }
        editorStart += duration;
      }
      return runningDuration;
    };

    // Images and animated text go through here. The input is looped into real
    // frames because rotate needs a stream to animate, and it runs on the
    // layer's own clock, with setpts placing it on the timeline afterwards.
    let motionCount = 0;
    const addMotionLayer = (
      sourcePath: string,
      layer: {
        startTime: number;
        endTime: number;
        cx: number;
        cy: number;
        widthPct?: number;
        rotation?: number;
        motion: MotionType;
        crop?: ImageCrop;
      }
    ) => {
      const start = mapTime(layer.startTime);
      const end = mapEnd(layer.endTime);
      const duration = Math.max(0.1, end - start);
      const index = addInput("-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(3), "-i", sourcePath);
      const chain = ["format=rgba"];
      if (layer.crop) {
        const { left, top, right, bottom } = layer.crop;
        chain.push(`crop=iw*${(1 - left - right).toFixed(4)}:ih*${(1 - top - bottom).toFixed(4)}:iw*${left.toFixed(4)}:ih*${top.toFixed(4)}`);
      }
      if (layer.widthPct) chain.push(`scale=${Math.round(width * layer.widthPct)}:-1`);
      const angle = motionAngleExpr(layer.motion, ((layer.rotation ?? 0) * Math.PI) / 180);
      if (angle) chain.push(`rotate=a='${angle}':c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
      chain.push(`setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`);
      const n = motionCount++;
      const x =
        layer.motion === "marquee"
          ? `W-(W+w)*(t-${start.toFixed(3)})/${duration.toFixed(3)}`
          : `${(layer.cx * width).toFixed(1)}-w/2`;
      const y = `${(layer.cy * height).toFixed(1)}-h/2`;
      filters.push(`[${index}:v]${chain.join(",")}[motionimg${n}]`);
      // -t rounds up to whole frames, so enable is what ends the layer on time.
      filters.push(
        `${videoLabel}[motionimg${n}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})'[motion${n}]`
      );
      videoLabel = `[motion${n}]`;
    };

    for (const image of imageLayers) addMotionLayer(image.sourcePath, image);

    // Lower-third strips: the blank PNG plus its text, each its own layer.
    for (let i = 0; i < strips.length; i++) {
      const strip = strips[i];
      const layout = layoutStrip(strip.text, width, height, strip.yPct);
      const imageIndex = addInput("-i", path.join(PUBLIC_DIR, layout.image.replace(/^\//, "")));
      const enable = `enable='between(t\\,${mapTime(strip.startTime).toFixed(3)}\\,${mapEnd(strip.endTime).toFixed(3)})'`;
      filters.push(`[${imageIndex}:v]scale=${layout.width}:${layout.height}[stripimg${i}]`);
      filters.push(`${videoLabel}[stripimg${i}]overlay=${layout.x}:${layout.y}:${enable}[strip${i}]`);
      videoLabel = `[strip${i}]`;
      for (let l = 0; l < layout.lines.length; l++) {
        const line = layout.lines[l];
        if (!line.text) continue;
        const textFile = path.join(workDir, `strip_${i}_${l}.txt`);
        await fs.writeFile(textFile, line.text, "utf8");
        const outLabel = `[striptext${i}_${l}]`;
        filters.push(
          `${videoLabel}drawtext=fontfile='${escapeFilterPath(BOLD_FONT_PATH)}':textfile='${escapeFilterPath(textFile)}':fontsize=${layout.fontSize}:fontcolor=white:x=${layout.textX}:y=${line.centerY}-${(layout.fontSize * 0.5).toFixed(1)}:${enable}${outLabel}`
        );
        videoLabel = outLabel;
      }
    }

    // Stage 3: burn in text overlays sequentially. Text goes through a temp
    // file (textfile=) rather than inline text= — sidesteps drawtext's
    // colon/quote/backslash escaping entirely and handles Turkish characters
    // (ç, ş, ğ, ı, ö, ü) cleanly.
    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      const textFile = path.join(workDir, `overlay_${i}.txt`);
      await fs.writeFile(textFile, ov.text, "utf8");
      const fontSize = ov.fontSize ?? 48;
      const fontColor = (ov.color ?? "#ffffff").replace("#", "0x");
      if (ov.motion && ov.motion !== "none") {
        // drawtext can't rotate, so moving text becomes a tight transparent
        // PNG first and animates like any image layer.
        const pngPath = path.join(workDir, `overlay_${i}.png`);
        const canvas = `${Math.ceil(ov.text.length * fontSize * 0.75 + fontSize)}x${Math.ceil(fontSize * 1.7)}`;
        await runFfmpeg([
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=black@0:s=${canvas},format=rgba`,
          "-vf",
          `drawtext=fontfile='${escapeFilterPath(BOLD_FONT_PATH)}':textfile='${escapeFilterPath(textFile)}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`,
          "-frames:v",
          "1",
          pngPath,
        ]);
        addMotionLayer(pngPath, {
          startTime: ov.startTime,
          endTime: ov.endTime,
          cx: ov.cx,
          cy: ov.cy,
          motion: ov.motion,
        });
        continue;
      }
      const outLabel = `[vt${i}]`;
      filters.push(
        `${videoLabel}drawtext=fontfile='${escapeFilterPath(BOLD_FONT_PATH)}':textfile='${escapeFilterPath(textFile)}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=3:bordercolor=black:x=${(ov.cx * width).toFixed(1)}-text_w/2:y=${(ov.cy * height).toFixed(1)}-text_h/2:enable='between(t\\,${mapTime(ov.startTime).toFixed(3)}\\,${mapEnd(ov.endTime).toFixed(3)})'${outLabel}`
      );
      videoLabel = outLabel;
    }

    // Stage 4: mix in an optional voiceover (plays once at voiceStartTime,
    // padded with silence rather than looped — looping would make speech
    // stutter/restart mid-sentence if it's shorter than the clip) and/or
    // background music (looped to fill the final duration). Both can be
    // present at once, so build the mix dynamically from however many extra
    // tracks are actually supplied.
    // adelay can't be used here: followed by apad and atrim its delay vanishes
    // and every track plays from the start.
    const placeAudio = (seconds: number) =>
      `asetpts=PTS-STARTPTS+${seconds.toFixed(3)}/TB,aresample=async=1:first_pts=0`;
    const extraTracks: string[] = [];
    if (voicePath) {
      const voiceIndex = addInput("-i", voicePath);
      filters.push(
        `[${voiceIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,${placeAudio(Math.max(0, voiceStartTime))},apad,atrim=0:${runningDuration.toFixed(3)},volume=${voiceVolume}[voice]`
      );
      extraTracks.push("[voice]");
    }
    if (musicPath) {
      const musicIndex = addInput("-i", musicPath);
      filters.push(
        `[${musicIndex}:a]aloop=loop=-1:size=2e9,atrim=0:${runningDuration.toFixed(3)},volume=${musicVolume}[music]`
      );
      extraTracks.push("[music]");
    }
    for (let i = 0; i < audioLayers.length; i++) {
      const layer = audioLayers[i];
      // A video layer can have no audio stream (see probeHasAudioStream).
      if (!(await probeHasAudioStream(layer.sourcePath))) continue;
      const layerIndex = addInput("-i", layer.sourcePath);
      const duration = Math.max(0.1, layer.trimEnd - layer.trimStart);
      // Sound detached from a clip gets the same treatment as the clip itself.
      const format = `aformat=sample_rates=48000:channel_layouts=stereo${clips.some((c) => c.sourcePath === layer.sourcePath) ? `,${BOTH_EARS}` : ""}`;
      const source = layer.loop
        ? `atrim=start=${layer.trimStart.toFixed(3)},asetpts=PTS-STARTPTS,${format},aloop=loop=-1:size=2e9,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS`
        : `atrim=start=${layer.trimStart.toFixed(3)}:end=${layer.trimEnd.toFixed(3)},asetpts=PTS-STARTPTS,${format}`;
      filters.push(
        `[${layerIndex}:a]${source},volume=${layer.volume},${placeAudio(mapTime(layer.start))},apad,atrim=0:${runningDuration.toFixed(3)}[layer${i}]`
      );
      extraTracks.push(`[layer${i}]`);
    }
    if (extraTracks.length > 0) {
      // Layers keep their own loudness: amix's default normalization would
      // quiet everything as tracks are added, which a detached clip track
      // should not do. The limiter catches the sum.
      const mix = audioLayers.length > 0 ? ":normalize=0,alimiter=limit=0.95:level=0" : "";
      filters.push(
        `${audioLabel}${extraTracks.join("")}amix=inputs=${1 + extraTracks.length}:duration=first:dropout_transition=0${mix}[aout]`
      );
      audioLabel = "[aout]";
    }

    const outputFilename = `${id}-edit.mp4`;
    const outputPath = path.join(VIDEOS_DIR, outputFilename);

    await runFfmpeg([
      "-y",
      ...inputArgs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      videoLabel,
      "-map",
      audioLabel,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      outputPath,
    ]);

    return `/videos/${outputFilename}`;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
