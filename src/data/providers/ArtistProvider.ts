import AsyncStorage from "@react-native-async-storage/async-storage";

import { JioSaavnImage, JioSaavnSong } from "@/lib/musicData";
import { getApiUrl } from "@/lib/query-client";
import { compactMap, mapFilter, sortedCopy } from "@/lib/arrayUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JioSaavnArtist {
  id: string;
  name: string;
  url: string;
  image: JioSaavnImage[];
  followerCount?: number | null;
  fanCount?: number | null;
  isVerified?: boolean | null;
  dominantLanguage?: string | null;
  bio?: { text: string | null; title: string | null }[];
  topSongs: JioSaavnSong[];
  topAlbums: JioSaavnArtistAlbum[];
  similarArtists: JioSaavnSimilarArtist[];
}

export interface JioSaavnArtistAlbum {
  id: string;
  name: string;
  year?: number | null;
  songCount?: number | null;
  url: string;
  image: JioSaavnImage[];
  songs?: JioSaavnSong[];
}

export interface JioSaavnSimilarArtist {
  id: string;
  name: string;
  url: string;
  image: JioSaavnImage[];
}

// Lightweight card shown in home feed rows
export interface ArtistCard {
  id: string;
  name: string;
  image: JioSaavnImage[];
  followerCount?: number | null;
  fanCount?: number | null;
  isVerified?: boolean | null;
  dominantLanguage?: string | null;
  rank?: number;
  rankingScore?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ARTIST_CACHE_PREFIX = "@mavrixfy_artist";
const ARTIST_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const FEATURED_ARTISTS_CACHE_KEY = "@mavrixfy_featured_artists_v5";
const FEATURED_ARTISTS_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const FEATURED_ARTIST_QUERY_LIMIT = 12;
const FEATURED_ARTIST_SHOWCASE_LIMIT = 12;
const FEATURED_ARTIST_ROTATION_WINDOW_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;



// Search queries used to discover popular artists dynamically
// No fixed IDs — results come from the live API
const POPULAR_ARTIST_QUERIES = [
  "arijit singh",
  "shreya ghoshal",
  "badshah",
  "jubin nautiyal",
  "guru randhawa",
  "ap dhillon",
  "lata mangeshkar",
  "kishore kumar",
  "sonu nigam",
  "armaan malik",
  "darshan raval",
  "b praak",
  "pritam",
  "vishal mishra",
  "anuv jain",
  "karan aujla",
  "shubh",
  "alka yagnik",
  "kumar sanu",
  "neha kakkar",
  "yo yo honey singh",
  "diljit dosanjh",
  "sidhu moose wala",
  "mohammad rafi",
  "anirudh ravichander",
  "kk",
  "mohit chauhan",
  "ar rahman",
  "amit trivedi",
  "sachin-jigar",
  "sunidhi chauhan",
  "shilpa rao",
  "jonita gandhi",
  "asees kaur",
  "tulsi kumar",
  "king",
  "divine",
  "raftaar",
  "emiway bantai",
  "udit narayan",
  "sid sriram",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstArray(...values: unknown[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const obj = value as any;
      if (Array.isArray(obj.results)) return obj.results;
      if (Array.isArray(obj.songs)) return obj.songs;
      if (Array.isArray(obj.albums)) return obj.albums;
      if (Array.isArray(obj.artists)) return obj.artists;
      if (Array.isArray(obj?.artists?.results)) return obj.artists.results;
    }
  }
  return [];
}

function normalizeImage(raw: unknown): JioSaavnImage[] {
  if (typeof raw === "string") {
    const url = raw.trim();
    return url ? [{ quality: "", url }] : [];
  }
  if (!Array.isArray(raw)) return [];
  return mapFilter(raw, (item: any) => {
      if (typeof item === "string") {
        const url = item.trim();
        return url ? { quality: "", url } : null;
      }
      const url = toStr(item?.url) || toStr(item?.link);
      return url ? { quality: toStr(item?.quality), url } : null;
    }, (x): x is JioSaavnImage => Boolean(x));
}

function normalizeSong(raw: any): JioSaavnSong | null {
  const id = toStr(raw?.id);
  const name = toStr(raw?.name) || toStr(raw?.title);
  if (!id || !name) return null;

  const dl = raw?.downloadUrl ?? raw?.download_url;
  const au = raw?.audioUrl ?? raw?.audio_url ?? raw?.media_url;

  return {
    id,
    name,
    type: toStr(raw?.type) || "song",
    year: toStr(raw?.year),
    duration: Number(raw?.duration ?? 0),
    language: toStr(raw?.language),
    album: {
      id: toStr(raw?.album?.id),
      name: toStr(raw?.album?.name) || toStr(raw?.album),
      url: toStr(raw?.album?.url),
    },
    artists: {
      primary: Array.isArray(raw?.artists?.primary)
        ? raw.artists.primary.map((a: any) => ({
            id: toStr(a?.id),
            name: toStr(a?.name),
            image: normalizeImage(a?.image),
            url: toStr(a?.url),
          }))
        : [],
      featured: [],
      all: [],
    },
    image: normalizeImage(raw?.image),
    downloadUrl: dl,
    audioUrl: au ?? dl,
    url: toStr(raw?.url),
  };
}

function normalizeArtist(raw: any): JioSaavnArtist | null {
  const source = raw?.data ?? raw;
  const id = toStr(source?.id);
  const name = toStr(source?.name) || toStr(source?.title);
  if (!id || !name) return null;

  const topSongs = mapFilter(firstArray(source?.topSongs, source?.top_songs, source?.songs), normalizeSong, (x): x is JioSaavnSong => Boolean(x));

  const topAlbums = compactMap(firstArray(source?.topAlbums, source?.top_albums, source?.albums), (a: any) => {
          const aid = toStr(a?.id);
          const aname = toStr(a?.name) || toStr(a?.title);
          if (!aid || !aname) return null;
          return {
            id: aid,
            name: aname,
            year: toNumber(a?.year),
            songCount: toNumber(a?.songCount ?? a?.song_count),
            url: toStr(a?.url),
            image: normalizeImage(a?.image),
            songs: Array.isArray(a?.songs)
              ? compactMap(a.songs, normalizeSong)
              : [],
          };
        }) as JioSaavnArtistAlbum[];

  const similarArtists = compactMap(firstArray(source?.similarArtists, source?.similar_artists), (a: any) => {
          const sid = toStr(a?.id);
          const sname = toStr(a?.name) || toStr(a?.title);
          if (!sid || !sname) return null;
          return {
            id: sid,
            name: sname,
            url: toStr(a?.url),
            image: normalizeImage(a?.image),
          };
        }) as JioSaavnSimilarArtist[];

  return {
    id,
    name,
    url: toStr(source?.url),
    image: normalizeImage(source?.image),
    followerCount: toNumber(source?.followerCount ?? source?.follower_count),
    fanCount: toNumber(source?.fanCount ?? source?.fan_count),
    isVerified: typeof source?.isVerified === "boolean" ? source.isVerified : null,
    dominantLanguage: toStr(source?.dominantLanguage ?? source?.dominant_language) || null,
    bio: Array.isArray(source?.bio) ? source.bio : [],
    topSongs,
    topAlbums,
    similarArtists,
  };
}

function normalizeArtistCard(raw: any): ArtistCard | null {
  const source = raw?.data ?? raw;
  const id = toStr(source?.id);
  const name = toStr(source?.name) || toStr(source?.title);
  if (!id || !name) return null;
  return {
    id,
    name,
    image: normalizeImage(source?.image),
    followerCount: toNumber(source?.followerCount ?? source?.follower_count),
    fanCount: toNumber(source?.fanCount ?? source?.fan_count),
    isVerified: typeof source?.isVerified === "boolean" ? source.isVerified : null,
    dominantLanguage: toStr(source?.dominantLanguage ?? source?.dominant_language) || null,
  };
}

function scoreCountSignal(value: number | null | undefined, maxScore: number): number {
  if (!value || value <= 0) return 0;
  return Math.min(Math.log10(value + 1) * 11.5, maxScore);
}

function calculateArtistRankingScore(artist: ArtistCard, sourceIndex: number): number {
  const language = artist.dominantLanguage?.toLowerCase() ?? "";
  const hasRegionalPull = /^(hindi|punjabi|tamil|telugu|malayalam|kannada|bengali|marathi|gujarati|urdu)$/.test(language);
  const followerScore = scoreCountSignal(artist.followerCount, 74);
  const fanScore = scoreCountSignal(artist.fanCount, 70);
  const popularityScore = Math.max(followerScore, fanScore);
  const seedScore = Math.max(32, 76 - sourceIndex * 1.8);

  const rawScore =
    (popularityScore > 0 ? popularityScore : seedScore) +
    (artist.isVerified ? 12 : 0) +
    (hasRegionalPull ? 7 : 0) +
    (artist.image.length > 0 ? 4 : 0) +
    Math.max(0, 10 - sourceIndex * 0.35);

  return Math.max(1, Math.min(100, Math.round(rawScore)));
}

function rankFeaturedArtists(artists: ArtistCard[]): ArtistCard[] {
  const scoredArtists = artists.map((artist, index) => ({
    artist,
    index,
    score: calculateArtistRankingScore(artist, index),
  }));

  return sortedCopy(scoredArtists, (left, right) => right.score - left.score || left.index - right.index)
    .map(({ artist, score }, index) => ({
      ...artist,
      rank: index + 1,
      rankingScore: score,
    }));
}

function getFeaturedArtistShowcaseWindow(): number {
  return Math.floor(Date.now() / FEATURED_ARTIST_ROTATION_WINDOW_MS);
}

function buildFeaturedArtistShowcase(artists: ArtistCard[]): ArtistCard[] {
  const ranked = rankFeaturedArtists(artists);
  const limit = Math.min(FEATURED_ARTIST_SHOWCASE_LIMIT, ranked.length);
  if (limit === 0) return [];

  const chunkCount = Math.max(1, Math.ceil(ranked.length / limit));
  const chunkIndex = getFeaturedArtistShowcaseWindow() % chunkCount;
  const start = chunkIndex * limit;
  const selected = ranked.slice(start, start + limit);
  if (selected.length < limit) {
    selected.push(...ranked.slice(0, limit - selected.length));
  }

  return selected.map((artist, index) => ({
    ...artist,
    rank: index + 1,
  }));
}

// ─── Cache ────────────────────────────────────────────────────────────────────

async function getCachedArtist(id: string): Promise<JioSaavnArtist | null> {
  try {
    const [[, data], [, time]] = await AsyncStorage.multiGet([
      `${ARTIST_CACHE_PREFIX}:${id}`,
      `${ARTIST_CACHE_PREFIX}:${id}:time`,
    ]);
    if (!data || !time) return null;
    if (Date.now() - Number(time) > ARTIST_CACHE_TTL_MS) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function setCachedArtist(id: string, artist: JioSaavnArtist): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [`${ARTIST_CACHE_PREFIX}:${id}`, JSON.stringify(artist)],
      [`${ARTIST_CACHE_PREFIX}:${id}:time`, String(Date.now())],
    ]);
  } catch {}
}

async function getCachedFeaturedArtists(): Promise<ArtistCard[] | null> {
  try {
    const [[, data], [, time]] = await AsyncStorage.multiGet([
      FEATURED_ARTISTS_CACHE_KEY,
      `${FEATURED_ARTISTS_CACHE_KEY}:time`,
    ]);
    if (!data || !time) return null;
    if (Date.now() - Number(time) > FEATURED_ARTISTS_CACHE_TTL_MS) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function setCachedFeaturedArtists(artists: ArtistCard[]): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [FEATURED_ARTISTS_CACHE_KEY, JSON.stringify(artists)],
      [`${FEATURED_ARTISTS_CACHE_KEY}:time`, String(Date.now())],
    ]);
  } catch {}
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchArtistRaw(id: string, songCount = 20): Promise<JioSaavnArtist | null> {
  const appBase = getApiUrl().replace(/\/+$/, "");
  const urls = [
    `${appBase}/api/artists/${encodeURIComponent(id)}?songCount=${songCount}&albumCount=10&sortBy=popularity&sortOrder=desc`,
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json?.data ?? json;
      const normalized = normalizeArtist(data);
      if (!normalized) throw new Error("parse failed");
      return normalized;
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") return r.value;
  }
  return null;
}

/** Search artists by name — returns lightweight ArtistCard[] */
export async function searchArtists(query: string): Promise<ArtistCard[]> {
  const q = query.trim();
  if (!q) return [];

  const appBase = getApiUrl().replace(/\/+$/, "");
  const encoded = encodeURIComponent(q);
  const urls = [
    `${appBase}/api/search/artists?query=${encoded}&limit=20&page=1`,
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr = firstArray(
        json?.data?.results,
        json?.data?.artists?.results,
        json?.data?.artists,
        json?.data,
        json?.artists?.results,
        json?.artists,
        json?.results
      );
      return mapFilter(arr, normalizeArtistCard, (x): x is ArtistCard => Boolean(x));
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) return r.value;
  }

  return searchArtistsFromSongs(appBase, encoded);
}

async function searchArtistsFromSongs(appBase: string, encodedQuery: string): Promise<ArtistCard[]> {
  try {
    const url = `${appBase}/api/search/songs?query=${encodedQuery}&limit=20&page=1`;
    const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
    if (!res.ok) return [];
    const json = await res.json();
    const songs = firstArray(
      json?.data?.results,
      json?.data?.songs,
      json?.data,
      json?.results,
      json?.songs
    );

    const seen = new Set<string>();
    const artists: ArtistCard[] = [];
    for (const song of songs) {
      const candidates = firstArray(
        song?.artists?.primary,
        song?.artists?.all,
        song?.primaryArtists,
        song?.primary_artists
      );
      for (const candidate of candidates) {
        const artist = normalizeArtistCard(candidate);
        if (!artist || seen.has(artist.id)) continue;
        seen.add(artist.id);
        artists.push(artist);
      }
    }
    return artists;
  } catch {
    return [];
  }
}

async function fetchFeaturedArtists(): Promise<ArtistCard[]> {
  // Search a broad pool, then the public API rotates a ranked slice for variety.
  const queries = POPULAR_ARTIST_QUERIES.slice(0, FEATURED_ARTIST_QUERY_LIMIT);
  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const found = await searchArtists(q);
      return found[0] ?? null;
    })
  );

  const seen = new Set<string>();
  const artists: ArtistCard[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value?.id) continue;
    const artist = result.value;
    const artistId = artist.id;
    if (seen.has(artistId)) continue;
    seen.add(artistId);
    artists.push(artist);
  }
  return rankFeaturedArtists(artists);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getArtistDetails(id: string): Promise<JioSaavnArtist | null> {
  const cached = await getCachedArtist(id);
  if (cached) return cached;
  const fresh = await fetchArtistRaw(id);
  if (fresh) void setCachedArtist(id, fresh);
  return fresh;
}

export async function getFeaturedArtists(options?: { forceRefresh?: boolean }): Promise<ArtistCard[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  if (!forceRefresh) {
    const cached = await getCachedFeaturedArtists();
    if (cached && cached.length > 0) {
      return buildFeaturedArtistShowcase(cached);
    }
  }
  const fresh = await fetchFeaturedArtists();
  if (fresh.length > 0) void setCachedFeaturedArtists(fresh);
  return buildFeaturedArtistShowcase(fresh);
}

export async function clearFeaturedArtistsCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      FEATURED_ARTISTS_CACHE_KEY,
      `${FEATURED_ARTISTS_CACHE_KEY}:time`,
    ]);
  } catch {}
}

/** Fire-and-forget prefetch for an artist */
export function prefetchArtist(id: string): void {
  getCachedArtist(id).then((cached) => {
    if (!cached) {
      void fetchArtistRaw(id).then((fresh) => {
        if (fresh) void setCachedArtist(id, fresh);
      });
    }
  });
}

/**
 * Fetch more songs for an artist — used by the "Load More" button.
 * page=1 returns songs 1-50, page=2 returns 51-100, etc.
 */
export async function getArtistSongs(
  id: string,
  page: number,
  sortBy = "popularity"
): Promise<JioSaavnSong[]> {
  const appBase = getApiUrl().replace(/\/+$/, "");
  const urls = [
    `${appBase}/api/artists/${encodeURIComponent(id)}/songs?page=${page}&sortBy=${sortBy}&sortOrder=desc`,
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr = firstArray(json?.data?.songs, json?.songs, json?.data?.results, json?.data);
      if (!Array.isArray(arr)) throw new Error("no songs array");
      return compactMap(arr, normalizeSong) as JioSaavnSong[];
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) return r.value;
  }
  return [];
}
