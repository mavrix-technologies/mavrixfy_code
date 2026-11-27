/** Clamps a 0-based page index cleanly within `[0, pageCount - 1]`. */
export function clampPageIndex(index: number, pageCount: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(pageCount) || pageCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(pageCount) - 1, Math.round(index)));
}

/** Computes the settled horizontal page index from scroll offset and page width. */
export function resolveSettledPageIndex(
  offsetX: number,
  pageWidth: number,
  pageCount: number
): number {
  if (!Number.isFinite(offsetX) || !Number.isFinite(pageWidth) || pageWidth <= 0 || pageCount <= 0) {
    return 0;
  }
  return clampPageIndex(offsetX / pageWidth, pageCount);
}

export type HorizontalSwipeDirection = "prev" | "next" | null;

/**
 * Resolves whether a horizontal pan gesture should switch to the previous or next page/tab.
 * - Swiping right (`translationX > 0` / `velocityX > 0`) navigates to `"prev"`.
 * - Swiping left (`translationX < 0` / `velocityX < 0`) navigates to `"next"`.
 */
export function resolveHorizontalSwipeDirection(params: {
  translationX: number;
  translationY: number;
  velocityX?: number;
  minDistance?: number;
  minVelocity?: number;
  maxVerticalRatio?: number;
}): HorizontalSwipeDirection {
  const {
    translationX,
    translationY,
    velocityX = 0,
    minDistance = 54,
    minVelocity = 360,
    maxVerticalRatio = 0.85,
  } = params;

  const absX = Math.abs(translationX);
  const absY = Math.abs(translationY);
  if (absX < 18 || absY > absX * maxVerticalRatio) {
    return null;
  }

  const triggeredByDistance = absX >= minDistance;
  const triggeredByFling = absX >= 22 && Math.abs(velocityX) >= minVelocity && Math.sign(velocityX) === Math.sign(translationX);
  if (!triggeredByDistance && !triggeredByFling) {
    return null;
  }

  return translationX > 0 ? "prev" : "next";
}
