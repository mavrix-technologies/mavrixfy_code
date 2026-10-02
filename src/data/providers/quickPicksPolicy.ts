import type { Song } from "@/lib/musicData";
import { isLikelyNewReleaseSong } from "./homeFreshness";

const UNWANTED_VERSION = /\b(remix|re[ -]?mix|mash[ -]?up|slowed|sped[ -]?up|speed[ -]?up|nightcore|lo[ -]?fi|reverb|karaoke|cover|tribute|preview|snippet|teaser|ringtone|sample|bootleg|unofficial|fan[ -]?made|8d|dj[ -]?mix|reels? version)\b/i;

export function canonicalSongKey(text: string): string {
  return text.normalize("NFKC").toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

/** Metadata screening, not proof of label ownership or an audio fingerprint match. */
export function isEligibleQuickPickSong(song: Song): boolean {
  if (!song || !song.id || typeof song.title !== "string" || typeof song.artist !== "string" ||
      !song.title.trim() || !song.artist.trim()) return false;
  if (/^(unknown|unknown artist)$/i.test(song.title.trim()) || /^(unknown|unknown artist)$/i.test(song.artist.trim())) return false;
  if (!Number.isFinite(song.duration) || song.duration < 60) return false;
  if (UNWANTED_VERSION.test(`${song.title} ${song.album}`)) return false;
  try {
    const url = new URL(song.audioUrl);
    return url.protocol === "https:" && !/(?:^|[\/_.-])(preview|sample|snippet|teaser)(?:[\/_.-]|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Preserve editorial order while limiting duplicates and repeated artists. */
export function selectQuickPickSongs(songs: readonly Song[], limit = 18): Song[] {
  const selected: Song[] = [];
  const ids = new Set<string>();
  const recordings = new Set<string>();
  const artistCounts = new Map<string, number>();
  for (const song of songs) {
    if (selected.length >= limit) break;
    if (!isEligibleQuickPickSong(song) || ids.has(song.id)) continue;
    const artist = song.artist.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
    const recording = `${canonicalSongKey(song.title)}:${artist}`;
    const count = artistCounts.get(artist) ?? 0;
    if (recordings.has(recording) || count >= 2) continue;
    ids.add(song.id);
    recordings.add(recording);
    artistCounts.set(artist, count + 1);
    selected.push(song);
  }
  return selected;
}

export function buildQuickPicksPool(trendingSongs: Song[], bollywoodSongs: Song[], releaseSongs: Song[]) {
  const trending = selectQuickPickSongs(trendingSongs);
  const bollywood = selectQuickPickSongs(bollywoodSongs);
  const latest = selectQuickPickSongs(releaseSongs.filter(song => isLikelyNewReleaseSong(song)));
  const groups = [latest, trending, bollywood];
  const balanced: Song[] = [];
  for (let index = 0; index < Math.max(...groups.map(group => group.length)); index++) {
    for (const group of groups) {
      if (group[index]) balanced.push(group[index]);
    }
  }
  return { trending, bollywood, latest, all: selectQuickPickSongs(balanced, 24) };
}
