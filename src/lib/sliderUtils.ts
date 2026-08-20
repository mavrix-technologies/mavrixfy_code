export const PLAYER_SLIDER_MINIMUM_TRACK_COLOR = "#F7FAFF";
export const PLAYER_SLIDER_MAXIMUM_TRACK_COLOR = "rgba(247,250,255,0.28)";
export const PLAYER_SLIDER_THUMB_COLOR = "#F7FAFF";
export const PLAYER_SLIDER_TOUCH_HEIGHT = 12;
export const PLAYER_SLIDER_THUMB_SIZE = 10;

export function clampUnit(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function progressFromGestureX(x: number, width: number): number {
  "worklet";
  const safeWidth = Math.max(1, width);
  return clampUnit(x / safeWidth);
}
