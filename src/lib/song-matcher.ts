import type { Song } from "@/lib/musicData";
import { youtubeIdentity, youtubeLikedMetadata } from "@/services/liked-songs/likedSongFormat";
import { searchYouTubeMusic } from "@/services/youtube/YouTubeMusic";
import type { ParsedSong } from "@/types/import";

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&amp;/gi, "&").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function titleKey(value: string): string {
  return normalize(value
    .replace(/\s*[([]\s*(?:from|feat\.?|ft\.?|official audio|official video|lyrics?)\b[^)\]]*[)\]]/gi, " ")
    .replace(/\s+(?:feat\.?|ft\.?)\s+.*$/i, ""));
}
function artistNames(value: string): string[] {
  return value.replace(/\s*-\s*Topic$/i, "").split(/\s*(?:,|;|&|\bfeat\.?\s|\bft\.?\s|\bfeaturing\s|\bwith\s)\s*/i)
    .map(normalize).filter(name => name && !["unknown", "unknown artist", "various artists"].includes(name));
}
function versionKey(value: string): string {
  return [...new Set(normalize(value).match(/\b(remix|cover|live|unplugged|instrumental|slowed|sped|acoustic|karaoke|reprise|remaster(?:ed)?|radio edit|extended|lofi)\b/g) || [])]
    .map(word => word === "remastered" ? "remaster" : word).sort().join("|");
}
function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Import cancelled");
}

/** Verify recording identity before ranking; never take an unrelated first result. */
export function selectImportedSong(row: ParsedSong, candidates: Song[]): Song | null {
  const title = titleKey(row.title), artists = artistNames(row.artist);
  const duration = row.duration || 0;
  if (!title) return null;
  const ranked = candidates.flatMap(song => {
    if (!youtubeIdentity(song) || titleKey(song.title) !== title || versionKey(song.title) !== versionKey(row.title)) return [];
    const names = artistNames(song.artist), shared = artists.filter(name => names.includes(name)).length;
    if (artists.length && !shared) return [];
    const delta = duration > 0 && song.duration > 0 ? Math.abs(duration - song.duration) : 0;
    if (duration > 0 && song.duration > 0 && delta > Math.max(8, duration * 0.05)) return [];
    return [{ song, score: shared * 100 + (normalize(song.title) === normalize(row.title) ? 20 : 0)
      + (row.album && normalize(row.album) === normalize(song.album) ? 5 : 0) - delta }];
  }).sort((a, b) => b.score - a.score);
  // A title-only row with competing artists cannot safely choose a recording.
  if (!artists.length && new Set(ranked.map(item => normalize(item.song.artist))).size > 1) return null;
  const best = ranked[0]?.song;
  if (!best) return null;
  return { ...youtubeLikedMetadata({ ...best, album: best.album || row.album || "" }),
    ...(best.artistRefs?.length ? { artistRefs: best.artistRefs } : {}) };
}

export async function matchImportedSong(row: ParsedSong, signal: AbortSignal): Promise<Song | null> {
  checkCancelled(signal);
  const primaryArtist = artistNames(row.artist)[0] || "";
  const queries = [...new Set([(row.title + " " + primaryArtist).trim(), row.title.trim()])].filter(Boolean);
  for (const query of queries) {
    const results = await searchYouTubeMusic(query, "songs", signal);
    checkCancelled(signal);
    const song = selectImportedSong(row, results.songs);
    if (song) return song;
  }
  return null;
}

export function dedupeImportRows(rows: ParsedSong[]): ParsedSong[] {
  const unique = new Map<string, ParsedSong>();
  for (const row of rows) {
    const key = [normalize(row.title), normalize(row.artist), row.duration || 0].join("|");
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

/** Two catalog requests at most in flight; original row order is retained. */
export async function matchImportedSongs(rows: ParsedSong[], signal: AbortSignal,
  onProgress: (processed: number, found: number) => void): Promise<ParsedSong[]> {
  const results = [...rows];
  let cursor = 0, processed = 0, found = 0;
  async function worker() {
    while (cursor < rows.length) {
      checkCancelled(signal);
      const index = cursor++;
      const row = rows[index];
      try {
        const matchedSong = await matchImportedSong(row, signal);
        checkCancelled(signal);
        results[index] = { ...row, matchedSong: matchedSong || undefined, status: matchedSong ? "ready" : "error",
          message: matchedSong ? undefined : "No accurate match" };
        if (matchedSong) found++;
      } catch {
        checkCancelled(signal);
        results[index] = { ...row, matchedSong: undefined, status: "error", message: "Search unavailable" };
      }
      onProgress(++processed, found);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, worker));
  return results;
}
