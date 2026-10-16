import bars from "../../../assets/branding/mavrixfy-bars.json";
import motion from "../../../assets/branding/launch-motion.json";

export const LAUNCH_REVEAL_MS = (bars.length - 1) * motion.staggerMs + motion.barDurationMs;

/** Pure frame math shared by every bar on one UI-thread clock. */
export function getLaunchBarFrame(elapsedMs: number, index: number) {
  "worklet";
  const time = Math.max(0, Math.min(1, (elapsedMs - index * motion.staggerMs) / motion.barDurationMs));
  const progress = 1 - (1 - time) ** 3;
  const scaleY = progress < motion.overshootAt
    ? motion.initialScaleY + (motion.overshootScaleY - motion.initialScaleY) * progress / motion.overshootAt
    : motion.overshootScaleY + (1 - motion.overshootScaleY) * (progress - motion.overshootAt) / (1 - motion.overshootAt);
  return { opacity: Math.min(1, progress / motion.opacityAt), translateY: motion.rise * (1 - progress), scaleY };
}
