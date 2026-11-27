import type { HomeListItem } from "./buildHomeSections";

/** Refresh changes the visible window, not identities or stored provider data. */
export function rotateDiscovery<T>(items: T[], revision: number): T[] {
  if (items.length < 2 || revision <= 0) return items;
  const offset = Math.floor(revision) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function varyHomeRows(rows: HomeListItem[], revision: number): HomeListItem[] {
  return rows.map(row => {
    if (row.type === "category") {
      if (/chart|trending|popular|new.arrival|new.release/i.test(row.category.id)) return row;
      return { ...row, category: { ...row.category, results: rotateDiscovery(row.category.results, revision) } };
    }
    if (row.type !== "youtube-section" || row.section.category === "new-releases" || row.section.category === "trending") return row;
    return { ...row, section: { ...row.section,
      songs: rotateDiscovery(row.section.songs, revision),
      playlists: rotateDiscovery(row.section.playlists, revision),
    } };
  });
}
