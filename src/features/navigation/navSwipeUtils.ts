import {
  clampPageIndex,
  resolveHorizontalSwipeDirection,
  type HorizontalSwipeDirection,
} from "@/utils/horizontalPagerUtils";
import { getTabHref, NAV_ITEMS, type VisibleRoute } from "./navTabConstants";

export function getNavTabIndex(route: VisibleRoute): number {
  const idx = NAV_ITEMS.findIndex((item) => item.route === route);
  return idx >= 0 ? idx : 0;
}

export function getNavTabRouteAtIndex(index: number): VisibleRoute {
  const clamped = clampPageIndex(index, NAV_ITEMS.length);
  return NAV_ITEMS[clamped]?.route ?? "index";
}

export function getAdjacentNavRoute(
  currentRoute: VisibleRoute,
  delta: -1 | 1
): VisibleRoute | null {
  const currentIndex = getNavTabIndex(currentRoute);
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= NAV_ITEMS.length) {
    return null;
  }
  return NAV_ITEMS[nextIndex]?.route ?? null;
}

export function getAdjacentNavHref(
  currentRoute: VisibleRoute,
  direction: Exclude<HorizontalSwipeDirection, null>
): string | null {
  const delta: -1 | 1 = direction === "prev" ? -1 : 1;
  const target = getAdjacentNavRoute(currentRoute, delta);
  return target ? getTabHref(target) : null;
}

export function resolveNavTabSwipeDirection(params: {
  translationX: number;
  translationY: number;
  velocityX?: number;
}): HorizontalSwipeDirection {
  return resolveHorizontalSwipeDirection({
    ...params,
    minDistance: 52,
    minVelocity: 340,
    maxVerticalRatio: 0.78,
  });
}

export type InnerHorizontalPagerBoundary = {
  /** Whether an inner horizontal pager blocks swiping right to the previous nav tab. */
  blockPrev: boolean;
  /** Whether an inner horizontal pager blocks swiping left to the next nav tab. */
  blockNext: boolean;
};

/** Determines whether a main nav swipe in `direction` is allowed given inner horizontal state. */
export function canSwipeNavInDirection(
  currentRoute: VisibleRoute,
  direction: Exclude<HorizontalSwipeDirection, null>,
  boundary: InnerHorizontalPagerBoundary
): boolean {
  if (direction === "prev" && boundary.blockPrev) return false;
  if (direction === "next" && boundary.blockNext) return false;
  const delta: -1 | 1 = direction === "prev" ? -1 : 1;
  return getAdjacentNavRoute(currentRoute, delta) !== null;
}
