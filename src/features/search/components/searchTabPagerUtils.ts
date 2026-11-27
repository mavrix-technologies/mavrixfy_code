import type { ResultFilter } from "@/lib/searchRepository";
import { RESULT_FILTERS } from "../types";

export const SEARCH_TAB_FILTERS: readonly ResultFilter[] = RESULT_FILTERS.map((item) => item.key);

/** Returns the 0-based tab index for a search filter, defaulting to Songs (0). */
export function getSearchTabIndex(filter: ResultFilter): number {
  const index = SEARCH_TAB_FILTERS.indexOf(filter);
  return index >= 0 ? index : 0;
}

/** Maps a pager index back to a valid search result filter, clamped to bounds. */
export function getSearchTabFilter(index: number): ResultFilter {
  const clamped = Math.max(0, Math.min(SEARCH_TAB_FILTERS.length - 1, Math.round(index)));
  return SEARCH_TAB_FILTERS[clamped] ?? "songs";
}

/** Computes the settled horizontal page index from scroll offset and page width. */
export function resolveSettledPageIndex(
  offsetX: number,
  pageWidth: number,
  pageCount: number = SEARCH_TAB_FILTERS.length
): number {
  if (!Number.isFinite(offsetX) || !Number.isFinite(pageWidth) || pageWidth <= 0 || pageCount <= 0) {
    return 0;
  }
  const rawIndex = Math.round(offsetX / pageWidth);
  return Math.max(0, Math.min(pageCount - 1, rawIndex));
}

/** Builds an explicit screen-reader label for non-song search rows. */
export function buildSearchRowAccessibilityLabel(
  kind: "artists" | "albums" | "playlists",
  title: string,
  subtitle: string
): string {
  const kindLabel = kind === "artists" ? "Artist" : kind === "albums" ? "Album" : "Playlist";
  const cleanTitle = title.trim() || kindLabel;
  const cleanSubtitle = subtitle.trim();
  if (!cleanSubtitle || cleanSubtitle.toLowerCase() === kindLabel.toLowerCase()) {
    return `${cleanTitle}, ${kindLabel}`;
  }
  return `${cleanTitle}, ${kindLabel}, ${cleanSubtitle}`;
}
