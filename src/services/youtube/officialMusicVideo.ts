export interface OfficialMusicVideoQuery {
  title: string;
  artist: string;
  durationSeconds: number;
  artistChannelIds: string[];
}

export interface OfficialMusicVideoCandidate {
  videoId: string;
  title: string;
  durationSeconds: number;
  musicVideoType: string;
  artists: Array<{ id?: string; name: string }>;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\[(]\s*(?:from\b|feat\.?\b|ft\.?\b|featuring\b|official\b|music\s+video\b|hd\b|4k\b)[^\])]*[\])]/g, " ")
    .replace(/\b(official\s+)?(music\s+)?video\b|\bofficial\s+audio\b|\blyrics?\b|\b4k\b|\bhd\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesArtist(query: OfficialMusicVideoQuery, candidate: OfficialMusicVideoCandidate): boolean {
  const ids = new Set(query.artistChannelIds.map(id => id.replace(/^youtube_artist_/, "")));
  if (ids.size && candidate.artists.some(artist => artist.id && ids.has(artist.id))) return true;

  const wanted = query.artist.split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+|\s*[&,]\s*/i).map(normalize).filter(Boolean);
  const found = candidate.artists.map(artist => normalize(artist.name));
  return wanted.some(name => found.includes(name));
}

function coreTitle(value: string): string {
  // Labels sometimes rename the existing official video with a version suffix.
  // This is a muted visual lookup; an exact recording title remains preferred.
  return normalize(value.replace(/(?:\s+[-–—]\s+|[\[(])(?:lo[\s-]?fi|remix|extended|live|acoustic|unplugged|slowed|sped\s+up)\b[^\])]*(?:[\])]|$)/gi, " "));
}

/** Start with the clean title; long credit lists can hide official search results. */
export function officialMusicVideoSearchQueries(query: OfficialMusicVideoQuery): string[] {
  const title = normalize(query.title);
  return [`${title} official video`, `${query.artist} ${title} official music video`];
}

/** Require official classification and song identity; allow music-video intro/outro time. */
export function selectOfficialMusicVideo(
  candidates: OfficialMusicVideoCandidate[],
  query: OfficialMusicVideoQuery
): string | null {
  const title = normalize(query.title);
  if (!title || !normalize(query.artist)) return null;
  const maxDurationDelta = Math.max(60, query.durationSeconds * 0.25);
  const matches = candidates.filter(candidate =>
    /^[\w-]{11}$/.test(candidate.videoId) &&
    candidate.musicVideoType === "MUSIC_VIDEO_TYPE_OMV" &&
    !/\b(?:lyrics?|lyrical|visuali[sz]er|official\s+audio)\b/i.test(candidate.title) &&
    coreTitle(candidate.title) === coreTitle(query.title) &&
    matchesArtist(query, candidate) &&
    (!query.durationSeconds || !candidate.durationSeconds ||
      Math.abs(candidate.durationSeconds - query.durationSeconds) <= maxDurationDelta)
  );
  // Prefer the exact title, then preserve the server's relevance order.
  // The visually correct music video may include an intro absent from the audio.
  matches.sort((a, b) => Number(normalize(a.title) !== title) - Number(normalize(b.title) !== title));
  return matches[0]?.videoId ?? null;
}
