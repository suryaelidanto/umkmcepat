export const MOTION_INTENSITIES = [
  "minimal",
  "moderate",
  "expressive",
] as const;

export type MotionIntensity = (typeof MOTION_INTENSITIES)[number];

export function resolveMotionIntensity(
  preference: string | null | undefined,
): MotionIntensity {
  if (preference === "minimal" || preference === "expressive") {
    return preference;
  }
  return "moderate";
}

const MOTION_MARKER_PATTERN = /@keyframes|animation\s*:|animate-/i;

export function hasAuthoredMotionMarker(content: string): boolean {
  return MOTION_MARKER_PATTERN.test(content);
}

export const MOTION_MISSING_REASON = "motion_missing";

export function buildMotionPromptLine(
  intensity: MotionIntensity,
  motionOptOut: boolean,
): string {
  if (motionOptOut) {
    return "\nMotion: the owner explicitly opted out of animation. Do not add keyframes, animation, or motion classes.";
  }
  return `\nMotion intensity: ${intensity}. Author ONE deliberate entrance or scroll moment using the @keyframes preset in src/index.css (class .umkm-motion or your own keyframes). Content must stay visible without JavaScript and under prefers-reduced-motion. Never animate layout-driving properties.`;
}
