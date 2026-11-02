// Layer animations. Each one exists twice, as a JS formula for the preview and
// an ffmpeg expression for the render, and the two must stay the same curve.
export type MotionType = "none" | "spin" | "sway" | "spinin" | "marquee";

export const MOTIONS: { value: MotionType; label: string }[] = [
  { value: "none", label: "Sabit" },
  { value: "spin", label: "Dönen" },
  { value: "sway", label: "Sallanan" },
  { value: "spinin", label: "Dönerek giren" },
  { value: "marquee", label: "Kayan (sağdan sola)" },
];

const SPIN_PERIOD = 3;
const SWAY_PERIOD = 2;
const SWAY_ANGLE = 0.25;
const SPIN_IN_TIME = 0.7;

export function motionAngle(motion: MotionType, t: number): number {
  if (motion === "spin") return (2 * Math.PI * t) / SPIN_PERIOD;
  if (motion === "sway") return SWAY_ANGLE * Math.sin((2 * Math.PI * t) / SWAY_PERIOD);
  if (motion === "spinin") return 4 * Math.PI * Math.max(0, 1 - t / SPIN_IN_TIME);
  return 0;
}

// For ffmpeg's rotate filter, where t is the layer's own time. Null means the
// layer never rotates and can skip the filter.
export function motionAngleExpr(motion: MotionType, baseRadians: number): string | null {
  const base = baseRadians.toFixed(4);
  if (motion === "spin") return `${base}+2*PI*t/${SPIN_PERIOD}`;
  if (motion === "sway") return `${base}+${SWAY_ANGLE}*sin(2*PI*t/${SWAY_PERIOD})`;
  if (motion === "spinin") return `${base}+4*PI*max(0,1-t/${SPIN_IN_TIME})`;
  return baseRadians !== 0 ? base : null;
}

// Fractions of the source image removed from each side. A layer's width and
// centre always describe the cropped result, in preview and render alike.
export type ImageCrop = { left: number; top: number; right: number; bottom: number };
export const NO_CROP: ImageCrop = { left: 0, top: 0, right: 0, bottom: 0 };

export const TEXT_POSITION_Y = { top: 0.08, center: 0.5, bottom: 0.92 } as const;
