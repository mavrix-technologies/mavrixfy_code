import AsyncStorage from "@react-native-async-storage/async-storage";

import { buildAppApiUrl } from "@/lib/api-config";
import { getBestImageUrl, Song, type JioSaavnImage } from "@/lib/musicData";
import { sortedCopy } from "@/lib/arrayUtils";

const DAILY_NEW_RELEASE_CACHE_KEY = "@mavrixfy_daily_new_release_songs_v4";
const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;
const DEFAULT_LIMIT = 10;

const NEW_RELEASE_QUERIES = [
  `new release hindi songs ${CURRENT_YEAR}`,
  `hindi new releases ${CURRENT_YEAR}`,
  `latest hindi songs ${CURRENT_YEAR}`,
  `new hindi songs ${CURRENT_YEAR}`,
  `new bollywood songs ${CURRENT_YEAR}`,
  `new hindi movie songs ${CURRENT_YEAR}`,
  `official hindi movie songs ${CURRENT_YEAR}`,
  `latest bollywood movie songs ${CURRENT_YEAR}`,
  `new bollywood film songs ${CURRENT_YEAR}`,
  `latest hindi film songs ${CURRENT_YEAR}`,
  `hindi movie songs ${CURRENT_YEAR}`,
  `t-series new hindi movie songs ${CURRENT_YEAR}`,
  `yrf new hindi movie songs ${CURRENT_YEAR}`,
  `zee music new hindi movie songs ${CURRENT_YEAR}`,
  `saregama new hindi movie songs ${CURRENT_YEAR}`,
] as const;

const NEW_RELEASE_ALBUM_QUERIES = [
  `new hindi movie songs ${CURRENT_YEAR}`,
  `latest bollywood movie songs ${CURRENT_YEAR}`,
  `new bollywood songs ${CURRENT_YEAR}`,
  `t-series new hindi movie songs ${CURRENT_YEAR}`,
  `yrf new hindi movie songs ${CURRENT_YEAR}`,
  `zee music new hindi movie songs ${CURRENT_YEAR}`,
  `saregama new hindi movie songs ${CURRENT_YEAR}`,
] as const;

const OFFICIAL_LABEL_TERMS = [
  "t-series",
  "yrf",
  "zee music",
  "saregama",
  "sony music",
  "tips",
  "panorama music",
  "universal music",
  "warner music",
  "times music",
  "hitz music",
  "venus",
  "eros music",
  "jjust music",
  "maddock",
] as const;

const COMPILATION_ALBUM_PATTERN =
  /\b(trending|mix|love songs|wedding|dance|special|hits|playlist|top|best|collection|nonstop|non stop|mashup|jukebox|devotional|bhakti|bhajan|shivratri|romantic|party|workout|chill|viral|reels|classical|learn|practice)\b/i;
const NON_MOVIE_RELEASE_PATTERN =
  /\b(devotional|bhakti|bhajan|chalisa|hanuman|ram|shri|siya|ayodhya|shivratri|shiv|aarti|mantra|stotra|stuti|laxmi|mahalaxmi|alakh|niranjan|classical|learn|practice|web series|series|season|episode|tv|event song|insta mix|remix|cover|slowed|nightcore|8d|instrumental|karaoke|lofi)\b/i;

type DailySongCache = {
  dateKey: string;
  songs: Song[];
};

type NewReleaseSongCandidate = {
  song: Song;
  albumKey: string;
  officialScore: number;
  movieScore: number;
  resultRank: number;
};

type NewReleaseAlbumCandidate = {
  id: string;
  name: string;
  year: number;
  language: string;
  resultRank: number;
};

export type DailyNewReleaseSongOptions = {
  forceRefresh?: boolean;
  limit?: number;
};

export async function clearDailyNewReleaseSongCache(): Promise<void> {
  await AsyncStorage.removeItem(DAILY_NEW_RELEASE_CACHE_KEY).catch(() => undefined);
}

function getTodayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&quot;/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unwrapSongResults(payload: any): any[] {
  const candidates = [
    payload?.data?.results,
    payload?.data?.songs?.results,
    payload?.data?.songs,
    payload?.results,
    payload?.songs?.results,
    payload?.songs,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function unwrapAlbumResults(payload: any): any[] {
  const candidates = [
    payload?.data?.results,
    payload?.data?.albums?.results,
    payload?.data?.albums,
    payload?.results,
    payload?.albums?.results,
    payload?.albums,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function getImageList(value: unknown): JioSaavnImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as { quality?: unknown; url?: unknown; link?: unknown };
      const url = cleanText(record.url || record.link);
      if (!url) return null;
      return {
        quality: cleanText(record.quality),
        url,
      };
    })
    .filter((item): item is JioSaavnImage => Boolean(item));
}

function getBestAudioUrl(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";

  const qualityRank: Record<string, number> = {
    "320kbps": 5,
    "160kbps": 4,
    "96kbps": 3,
    "48kbps": 2,
    "12kbps": 1,
  };

  const candidates = value
    .map((item) => {
      if (typeof item === "string") {
        const url = item.trim();
        return url ? { quality: "", url } : null;
      }
      if (!item || typeof item !== "object") return null;
      const record = item as { quality?: unknown; url?: unknown; link?: unknown };
      const url = cleanText(record.url || record.link);
      if (!url) return null;
      return { quality: cleanText(record.quality), url };
    })
    .filter((item): item is { quality: string; url: string } => Boolean(item));

  return sortedCopy(
    candidates,
    (left, right) => (qualityRank[right.quality] || 0) - (qualityRank[left.quality] || 0)
  )[0]?.url || "";
}

function getArtistName(raw: any): string {
  const primaryArtists = cleanText(raw?.primaryArtists || raw?.primary_artists);
  if (primaryArtists) return primaryArtists;

  const primary = Array.isArray(raw?.artists?.primary) ? raw.artists.primary : [];
  const primaryNames = primary.flatMap((artist: any) => {
    const name = cleanText(artist?.name);
    return name ? [name] : [];
  });
  if (primaryNames.length > 0) return primaryNames.join(", ");

  const all = Array.isArray(raw?.artists?.all) ? raw.artists.all : [];
  const allNames = all.flatMap((artist: any) => {
    const name = cleanText(artist?.name);
    return name ? [name] : [];
  });
  return allNames.length > 0 ? Array.from(new Set(allNames)).slice(0, 3).join(", ") : "Unknown Artist";
}

function getOfficialScore(label: string, copyright: string): number {
  const text = `${label} ${copyright}`.toLowerCase();
  let score = label ? 18 : 0;
  if (copyright.includes("℗") || copyright.includes("©")) score += 18;
  for (const term of OFFICIAL_LABEL_TERMS) {
    if (text.includes(term)) score += 70;
  }
  return score;
}

function getMovieScore(title: string, album: string): number {
  const titleKey = normalizeKey(title);
  const albumKey = normalizeKey(album);
  if (!albumKey || albumKey === titleKey || /^\d{4}$/.test(albumKey)) return 0;

  const titleHasMovieSource = /\bfrom\s+["“(]?/i.test(title);
  if (COMPILATION_ALBUM_PATTERN.test(album) && !titleHasMovieSource) return 0;

  const wordCount = albumKey.split(/\s+/).filter(Boolean).length;
  let score = wordCount >= 2 ? 58 : 24;
  if (titleHasMovieSource || /\b(movie|film|soundtrack|ost)\b/i.test(album)) score += 30;
  return score;
}

function normalizeAlbumCandidate(raw: any, resultRank: number): NewReleaseAlbumCandidate | null {
  const id = cleanText(raw?.id || raw?.albumId || raw?.albumid || raw?._id);
  const name = cleanText(raw?.name || raw?.title);
  if (!id || !name) return null;

  const language = cleanText(raw?.language || raw?.lang).toLowerCase();
  if (language && language !== "hindi") return null;

  const year = Number.parseInt(cleanText(raw?.year), 10);
  if (year !== CURRENT_YEAR && year !== PREVIOUS_YEAR) return null;
  if (COMPILATION_ALBUM_PATTERN.test(name) || NON_MOVIE_RELEASE_PATTERN.test(name)) return null;

  return {
    id,
    name,
    year,
    language,
    resultRank,
  };
}

function normalizeNewReleaseCandidate(raw: any, resultRank: number): NewReleaseSongCandidate | null {
  const type = cleanText(raw?.type).toLowerCase();
  if (type && type !== "song") return null;

  const id = cleanText(raw?.id || raw?.songid || raw?.songId || raw?._id);
  const title = cleanText(raw?.name || raw?.title || raw?.song);
  if (!id || !title) return null;

  const downloadUrl = raw?.downloadUrl ?? raw?.download_url ?? raw?.audioUrl ?? raw?.audio_url ?? raw?.media_url;
  const audioUrl = getBestAudioUrl(downloadUrl);
  if (!audioUrl) return null;

  const images = getImageList(raw?.image || raw?.images);
  const album = typeof raw?.album === "string"
    ? cleanText(raw.album)
    : cleanText(raw?.album?.name || raw?.more_info?.album);
  const language = cleanText(raw?.language || raw?.lang).toLowerCase();
  if (language && language !== "hindi") return null;

  const label = cleanText(raw?.label || raw?.more_info?.label);
  const copyright = cleanText(raw?.copyright || raw?.more_info?.copyright);
  const officialScore = getOfficialScore(label, copyright);
  const movieScore = getMovieScore(title, album);

  const song: Song = {
    id,
    title,
    artist: getArtistName(raw),
    album,
    duration: Number(raw?.duration || raw?.more_info?.duration || 0) || 0,
    coverUrl: images.length > 0 ? getBestImageUrl(images) : cleanText(raw?.imageUrl || raw?.image_url),
    genre: language,
    audioUrl,
    year: cleanText(raw?.year || raw?.releaseDate || raw?.release_date),
    language,
    source: "jiosaavn",
    playCount: Number(raw?.playCount || raw?.play_count || 0) || 0,
  };

  return {
    song,
    albumKey: normalizeKey(album),
    officialScore,
    movieScore,
    resultRank,
  };
}

function getSongKey(song: Song): string {
  return song.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreNewReleaseCandidate(candidate: NewReleaseSongCandidate): number {
  const { song } = candidate;
  const text = `${song.title} ${song.artist} ${song.album} ${song.genre} ${song.language}`.toLowerCase();
  const year = Number.parseInt(String(song.year || ""), 10);
  let score = 0;

  if (year === CURRENT_YEAR) score += 520;
  else if (year === PREVIOUS_YEAR) score += 140;
  else if (Number.isFinite(year)) score -= 300;

  score += candidate.officialScore * 0.8;
  score += candidate.movieScore >= 40 ? 180 : candidate.movieScore;
  if (text.includes("hindi")) score += 42;
  if (text.includes("bollywood")) score += 42;
  if (text.includes("movie") || text.includes("film")) score += 34;
  if (text.includes("latest") || text.includes("new")) score += 58;
  if (text.includes("trending") || text.includes("viral")) score -= 20;
  if (song.playCount && song.playCount > 0) score += Math.min(Math.log10(song.playCount) * 3, 28);
  if (/\b(remix|cover|slowed|nightcore|8d|instrumental|karaoke)\b/.test(text)) score -= 70;
  score += Math.max(0, 44 - candidate.resultRank);

  return score;
}

function isCleanNewRelease(candidate: NewReleaseSongCandidate): boolean {
  const song = candidate.song;
  const text = `${song.title} ${song.album} ${song.artist} ${song.genre} ${song.language}`;
  const year = Number.parseInt(String(song.year || ""), 10);
  const isFreshYear = year === CURRENT_YEAR || year === PREVIOUS_YEAR;
  const isCompilation = COMPILATION_ALBUM_PATTERN.test(song.album) && candidate.movieScore < 40;

  return (
    isFreshYear &&
    candidate.officialScore >= 40 &&
    !isCompilation &&
    !NON_MOVIE_RELEASE_PATTERN.test(text)
  );
}

function dedupeAndRankSongs(candidates: NewReleaseSongCandidate[], limit: number): Song[] {
  const bestBySongKey = new Map<string, NewReleaseSongCandidate>();
  for (const candidate of candidates.filter(isCleanNewRelease)) {
    const key = getSongKey(candidate.song);
    const previous = bestBySongKey.get(key);
    if (!previous || scoreNewReleaseCandidate(candidate) > scoreNewReleaseCandidate(previous)) {
      bestBySongKey.set(key, candidate);
    }
  }

  const sorted = sortedCopy(
    Array.from(bestBySongKey.values()),
    (left, right) => scoreNewReleaseCandidate(right) - scoreNewReleaseCandidate(left)
  );
  const selected: NewReleaseSongCandidate[] = [];
  const usedAlbums = new Set<string>();
  const selectedKeys = new Set<string>();

  for (const candidate of sorted) {
    if (candidate.albumKey && usedAlbums.has(candidate.albumKey)) continue;
    if (candidate.albumKey) usedAlbums.add(candidate.albumKey);
    selected.push(candidate);
    selectedKeys.add(getSongKey(candidate.song));
    if (selected.length >= limit) break;
  }

  for (const candidate of sorted) {
    if (selected.length >= limit) break;
    const key = getSongKey(candidate.song);
    if (selectedKeys.has(key)) continue;
    selected.push(candidate);
    selectedKeys.add(key);
  }

  return selected.map((candidate) => candidate.song);
}

async function readCachedDailySongs(limit: number): Promise<Song[] | null> {
  const raw = await AsyncStorage.getItem(DAILY_NEW_RELEASE_CACHE_KEY).catch(() => null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as DailySongCache;
    if (parsed.dateKey !== getTodayKey() || !Array.isArray(parsed.songs)) return null;
    return parsed.songs.slice(0, limit);
  } catch {
    return null;
  }
}

async function writeCachedDailySongs(songs: Song[]): Promise<void> {
  const payload: DailySongCache = {
    dateKey: getTodayKey(),
    songs,
  };
  await AsyncStorage.setItem(DAILY_NEW_RELEASE_CACHE_KEY, JSON.stringify(payload)).catch(() => undefined);
}

async function searchSongs(query: string, limit: number, forceRefresh: boolean): Promise<NewReleaseSongCandidate[]> {
  const params = [
    `query=${encodeURIComponent(query)}`,
    `limit=${Math.max(limit * 4, 40)}`,
    "page=1",
  ];
  if (forceRefresh) {
    params.push("refresh=1", `ts=${Date.now()}`);
  }

  const response = await fetch(`${buildAppApiUrl("/search/songs")}?${params.join("&")}`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = await response.json().catch(() => null);
  return unwrapSongResults(payload)
    .map((raw, index) => normalizeNewReleaseCandidate(raw, index))
    .filter((song): song is NewReleaseSongCandidate => Boolean(song));
}

async function searchAlbums(query: string, limit: number, forceRefresh: boolean): Promise<NewReleaseAlbumCandidate[]> {
  const params = [
    `query=${encodeURIComponent(query)}`,
    `limit=${Math.max(limit, 8)}`,
    "page=1",
  ];
  if (forceRefresh) {
    params.push("refresh=1", `ts=${Date.now()}`);
  }

  const response = await fetch(`${buildAppApiUrl("/search/albums")}?${params.join("&")}`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = await response.json().catch(() => null);
  return unwrapAlbumResults(payload)
    .map((raw, index) => normalizeAlbumCandidate(raw, index))
    .filter((album): album is NewReleaseAlbumCandidate => Boolean(album));
}

async function fetchAlbumSongs(
  album: NewReleaseAlbumCandidate,
  albumRank: number,
  forceRefresh: boolean
): Promise<NewReleaseSongCandidate[]> {
  const params = [`id=${encodeURIComponent(album.id)}`];
  if (forceRefresh) {
    params.push("refresh=1", `ts=${Date.now()}`);
  }

  const response = await fetch(`${buildAppApiUrl("/albums")}?${params.join("&")}`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = await response.json().catch(() => null);
  const albumData = payload?.data || {};
  return unwrapSongResults(payload)
    .map((raw, index) => normalizeNewReleaseCandidate(
      {
        ...raw,
        album: raw?.album || {
          id: album.id,
          name: albumData?.name || album.name,
        },
        language: raw?.language || albumData?.language || album.language,
        year: raw?.year || albumData?.year || album.year,
      },
      albumRank * 50 + index
    ))
    .filter((song): song is NewReleaseSongCandidate => Boolean(song));
}

async function fetchAlbumNewReleaseSongs(limit: number, forceRefresh: boolean): Promise<NewReleaseSongCandidate[]> {
  const albumResults = await Promise.all(
    NEW_RELEASE_ALBUM_QUERIES.map((query) => searchAlbums(query, 8, forceRefresh))
  );
  const seen = new Set<string>();
  const albums: NewReleaseAlbumCandidate[] = [];

  for (const album of albumResults.flat()) {
    if (seen.has(album.id)) continue;
    seen.add(album.id);
    albums.push(album);
  }

  const rankedAlbums = sortedCopy(albums, (left, right) => {
    if (left.year !== right.year) return right.year - left.year;
    return left.resultRank - right.resultRank;
  }).slice(0, Math.max(limit, 10));

  const songResults = await Promise.all(
    rankedAlbums.map((album, index) => fetchAlbumSongs(album, index, forceRefresh))
  );
  return songResults.flat();
}

export async function getDailyNewReleaseSongs(options?: DailyNewReleaseSongOptions): Promise<Song[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh) {
    const cached = await readCachedDailySongs(limit);
    if (cached && cached.length > 0) return cached;
  }

  const [albumSongs, searchSongResults] = await Promise.all([
    fetchAlbumNewReleaseSongs(limit, forceRefresh),
    Promise.all(NEW_RELEASE_QUERIES.map((query) => searchSongs(query, limit, forceRefresh))),
  ]);
  const songs = dedupeAndRankSongs([...albumSongs, ...searchSongResults.flat()], limit);
  if (songs.length > 0) {
    await writeCachedDailySongs(songs);
  }
  return songs;
}
