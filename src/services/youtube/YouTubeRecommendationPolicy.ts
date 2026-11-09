import type { Song } from "@/lib/musicData";

const normalized = (value: string | undefined) => String(value || "").normalize("NFKC").toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const unknownArtists = new Set(["", "unknown", "unknown artist", "youtube music", "mavrixfy music", "various artists"]);
function artistKey(song: Song): string {
  const artist = normalized(song.artist);
  return unknownArtists.has(artist) ? "" : artist;
}
function recordingTitle(song: Song): string {
  // Only remove display labels. Live/remix/acoustic/cover qualifiers remain
  // significant, as do non-Latin letters and their combining marks.
  return normalized(String(song.title || "")
    .replace(/[([]\s*(?:official\s+(?:music\s+)?(?:audio|video)|lyrics?|lyric\s+video)\s*[)\]]/gi, "")
    .replace(/\s*[-–—|]\s*(?:official\s+(?:music\s+)?(?:audio|video)|lyrics?|lyric\s+video)\s*$/gi, ""));
}
const idKey = (song: Song) => (song.youtubeVideoId || song.videoId || song.id).replace(/^youtube_/, "");
function sameRecording(a: Song, b: Song): boolean {
  const artist = artistKey(a), title = recordingTitle(a);
  return Boolean(artist && title && artist === artistKey(b) && title === recordingTitle(b) &&
    Number.isFinite(a.duration) && a.duration > 0 && Number.isFinite(b.duration) && b.duration > 0 &&
    Math.abs(a.duration - b.duration) <= 2);
}

/** Preserve provider relevance order, with exact-identity filtering and soft artist diversity. */
export function rankYouTubeCandidates(candidates: Song[], excluded: Song[], limit = 24, recentIds: ReadonlySet<string> = new Set()): Song[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const ids = new Set(excluded.map(idKey));
  const recordings = [...excluded];
  const artists = new Map<string, number>();
  const preferred: Song[] = [], repeatedArtists: Song[] = [], recent: Song[] = [];
  for (const song of candidates) {
    if (!song?.id || ids.has(idKey(song)) || recordings.some(item => sameRecording(item, song))) continue;
    ids.add(idKey(song)); recordings.push(song);
    // A bounded recent list is a soft fallback, so a short provider response
    // does not turn a valid radio into an empty queue.
    if (recentIds.has(song.id)) { recent.push(song); continue; }
    const artist = artistKey(song);
    const count = artist ? artists.get(artist) || 0 : 0;
    if (artist && count >= 2) { repeatedArtists.push(song); continue; }
    if (artist) artists.set(artist, count + 1);
    preferred.push(song);
  }
  return [...preferred, ...repeatedArtists, ...recent].slice(0, Math.floor(limit));
}

/** Recent history remains ordered; select different artists before repeated ones. */
export function selectYouTubeRadioSeeds(seeds: Song[], limit = 4): Song[] {
  const selected: Song[] = [], deferred: Song[] = [];
  const ids = new Set<string>(), artists = new Set<string>();
  const recordings: Song[] = [];
  const count = Number.isFinite(limit) ? Math.min(4, Math.max(0, Math.floor(limit))) : 4;
  for (const seed of seeds.slice(0, 20)) {
    if (!seed?.id || ids.has(idKey(seed)) || recordings.some(item => sameRecording(item, seed))) continue;
    ids.add(idKey(seed));
    recordings.push(seed);
    const artist = artistKey(seed);
    if (artist && artists.has(artist)) deferred.push(seed);
    else { if (artist) artists.add(artist); selected.push(seed); }
  }
  return [...selected, ...deferred].slice(0, count);
}

/** One large first radio must not consume the entire candidate budget. */
export function interleaveYouTubeRadio(batches: Song[][]): Song[] {
  const blended: Song[] = [];
  const length = Math.max(0, ...batches.map(batch => batch.length));
  for (let index = 0; index < length; index++) for (const batch of batches) if (batch[index]) blended.push(batch[index]);
  return blended;
}
