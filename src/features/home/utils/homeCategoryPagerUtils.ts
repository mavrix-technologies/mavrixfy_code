import { clampPageIndex, resolveSettledPageIndex } from "@/utils/horizontalPagerUtils";
import type { MavrixfyCategory, MusicCategoryItem } from "../constants/homeNavConstants";

/** Returns the 0-based page index for a Home music category, defaulting to `0` ("All"). */
export function getHomeCategoryIndex(
  categories: readonly Pick<MusicCategoryItem, "id">[],
  categoryId: MavrixfyCategory
): number {
  const index = categories.findIndex((item) => item.id === categoryId);
  return index >= 0 ? index : 0;
}

/** Resolves a clamped Home category id for a 0-based page index. */
export function getHomeCategoryId(
  categories: readonly Pick<MusicCategoryItem, "id">[],
  index: number
): MavrixfyCategory {
  if (categories.length === 0) return "All";
  const clamped = clampPageIndex(index, categories.length);
  return categories[clamped]?.id ?? "All";
}

export { resolveSettledPageIndex as resolveHomeSettledPageIndex };

/** Determines whether a Home category page index should render live vs placeholder content. */
export function isHomeCategoryPageMounted(pageIndex: number, activeIndex: number): boolean {
  return Math.abs(pageIndex - activeIndex) <= 1;
}
