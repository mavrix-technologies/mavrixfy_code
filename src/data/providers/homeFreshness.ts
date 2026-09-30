import type { Song } from "@/lib/musicData";

const COMPILATION_ALBUM_PATTERN =
  /\b(trending|mix|love songs|wedding|dance|special|hits|playlist|top|best|collection|nonstop|non stop|mashup|jukebox|devotional|bhakti|bhajan|shivratri|romantic|party|workout|chill|viral|reels|classical|learn|practice|world music day|music day|greatest|nostalgia)\b/i;

export const getCurrentYear = () => new Date().getFullYear();

export function isCompilationAlbum(name: string): boolean {
  return COMPILATION_ALBUM_PATTERN.test(name);
}

export function isLikelyNewReleaseSong(song: Pick<Song, "year" | "album">, currentYear = getCurrentYear()): boolean {
  const year = Number.parseInt(String(song.year || ""), 10);
  return (year === currentYear || year === currentYear - 1) &&
    !isCompilationAlbum(song.album);
}
