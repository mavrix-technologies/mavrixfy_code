import type { RecentlyPlayedItem } from "@/lib/storage";
import type { Song } from "@/lib/musicData";

export function historySong(item: RecentlyPlayedItem): Song {
  if (item.data && typeof item.data === "object" && typeof item.data.id === "string") return item.data as Song;
  return { id: item.id, title: item.name, artist: "Unknown artist", coverUrl: item.imageUrl,
    audioUrl: "", duration: 0, album: "", genre: "" };
}

const searchText = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
/** Saved recent entries represent each song's most recent play, not every play event. */
export function filterListeningHistory(items: RecentlyPlayedItem[], query: string, days: number, now = Date.now()): RecentlyPlayedItem[] {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
  return items.filter(item => {
    if (item.type !== "song" || !Number.isFinite(item.lastPlayed) || item.lastPlayed > now ||
      days > 0 && item.lastPlayed < cutoff.getTime()) return false;
    const song = historySong(item);
    const date = new Date(item.lastPlayed);
    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const haystack = searchText([song.title, song.artist, song.album, isoDate, date.toLocaleDateString()].join(" "));
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => b.lastPlayed - a.lastPlayed);
}
