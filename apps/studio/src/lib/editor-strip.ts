// Lower-third strip geometry, shared by the editor preview and the ffmpeg
// render so text sits in the same place in both. Numbers describe the cropped
// PNGs in public/strips/.
const IMG_W = 1059;
const IMG_H = 209;
const BAR_CENTER_Y = 101;
const TEXT_LEFT = 287;
const TEXT_RIGHT = 1023;
const BASE_FONT = 44;
// Conservative average width of an Inter Bold capital, in em. ffmpeg can't
// measure text before drawing it, so wrapping/shrinking works from this.
const CHAR_EM = 0.63;

export const STRIP_DEFAULT_Y = 0.77;

export type StripLayout = {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textX: number;
  fontSize: number;
  lines: { text: string; centerY: number }[];
};

function bestTwoLines(text: string): string[] {
  const words = text.split(/\s+/);
  let best = [text];
  let bestLongest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const longest = Math.max(a.length, b.length);
    if (longest < bestLongest) {
      bestLongest = longest;
      best = [a, b];
    }
  }
  return best;
}

export function layoutStrip(rawText: string, canvasW: number, canvasH: number, yPct: number): StripLayout {
  const text = rawText.trim().toLocaleUpperCase("tr-TR");
  const width = Math.round(canvasW * (canvasH > canvasW ? 0.96 : 0.56));
  const scale = width / IMG_W;
  const room = (TEXT_RIGHT - TEXT_LEFT) * scale;
  const widthOf = (lines: string[], size: number) =>
    Math.max(...lines.map((l) => l.length)) * size * CHAR_EM;

  let fontSize = BASE_FONT * scale;
  let lines = [text];
  if (widthOf(lines, fontSize) > room) {
    lines = bestTwoLines(text);
    const needed = widthOf(lines, fontSize);
    if (needed > room) fontSize *= room / needed;
  }

  const x = Math.round(canvasW * 0.02);
  const barCenter = canvasH * yPct;
  const gap = fontSize + 8 * scale;
  return {
    image: "/strips/lower-third.png",
    x,
    y: Math.round(barCenter - BAR_CENTER_Y * scale),
    width,
    height: Math.round(IMG_H * scale),
    textX: Math.round(x + TEXT_LEFT * scale),
    fontSize: Math.round(fontSize),
    lines: lines.map((t, i) => ({
      text: t,
      centerY: Math.round(barCenter + (i - (lines.length - 1) / 2) * gap),
    })),
  };
}
