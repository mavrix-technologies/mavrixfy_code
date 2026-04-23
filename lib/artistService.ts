import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { JioSaavnImage, JioSaavnSong } from "@/lib/musicData";
import { getApiUrl } from "@/lib/query-client";

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
  bio?: Array<{ text: string | null; title: string | null }>;
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
  dominantLanguage?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ARTIST_CACHE_PREFIX = "@mavrixfy_artist";
const ARTIST_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const FEATURED_ARTISTS_CACHE_KEY = "@mavrixfy_featured_artists_v3";
const FEATURED_ARTISTS_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const TIMEOUT_MS = 6000;

const BASE_URLS = [
  "https://saavn.sumit.co/api",
  "https://jiosaavn-api-privatecvc2.vercel.app",
];

// Search queries used to discover popular artists dynamically
// No fixed IDs — results come from the live API
const POPULAR_ARTIST_QUERIES = [
  "arijit singh",
  "shreya ghoshal",
  "badshah",
  "jubin nautiyal",
  "guru randhawa",
  "ap dhillon",
  "dua lipa",
  "the weeknd",
  "taylor swift",
  "sonu nigam",
  "armaan malik",
  "darshan raval",
  "b praak",
  "pritam",
  "vishal mishra",
  "anuv jain",
  "karan aujla",
  "shubh",
  "ed sheeran",
  "weeknd",
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

function normalizeImage(raw: unknown): JioSaavnImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => {
      const url = toStr(item?.url) || toStr(item?.link);
      return url ? { quality: toStr(item?.quality), url } : null;
    })
    .filter((x): x is JioSaavnImage => Boolean(x));
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
    hasLyrics: Boolean(raw?.hasLyrics ?? raw?.has_lyrics),
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
  const id = toStr(raw?.id);
  const name = toStr(raw?.name);
  if (!id || !name) return null;

  const topSongs: JioSaavnSong[] = Array.isArray(raw?.topSongs)
    ? raw.topSongs.map(normalizeSong).filter(Boolean) as JioSaavnSong[]
    : [];

  const topAlbums: JioSaavnArtistAlbum[] = Array.isArray(raw?.topAlbums)
    ? raw.topAlbums
        .map((a: any) => {
          const aid = toStr(a?.id);
          const aname = toStr(a?.name);
          if (!aid || !aname) return null;
          return {
            id: aid,
            name: aname,
            year: a?.year ?? null,
            songCount: a?.songCount ?? null,
            url: toStr(a?.url),
            image: normalizeImage(a?.image),
            songs: Array.isArray(a?.songs)
              ? a.songs.map(normalizeSong).filter(Boolean)
              : [],
          };
        })
        .filter(Boolean)
    : [];

  const similarArtists: JioSaavnSimilarArtist[] = Array.isArray(raw?.similarArtists)
    ? raw.similarArtists
        .map((a: any) => {
          const sid = toStr(a?.id);
          const sname = toStr(a?.name);
          if (!sid || !sname) return null;
          return {
            id: sid,
            name: sname,
            url: toStr(a?.url),
            image: normalizeImage(a?.image),
          };
        })
        .filter(Boolean)
    : [];

  return {
    id,
    name,
    url: toStr(raw?.url),
    image: normalizeImage(raw?.image),
    followerCount: raw?.followerCount ?? null,
    fanCount: raw?.fanCount ?? null,
    isVerified: raw?.isVerified ?? null,
    dominantLanguage: raw?.dominantLanguage ?? null,
    bio: Array.isArray(raw?.bio) ? raw.bio : [],
    topSongs,
    topAlbums,
    similarArtists,
  };
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
    `${appBase}/api/jiosaavn/artists/${encodeURIComponent(id)}?songCount=${songCount}&albumCount=10&sortBy=popularity&sortOrder=desc`,
    ...BASE_URLS.map(
      (b) =>
        `${b}/artists/${encodeURIComponent(id)}?songCount=${songCount}&albumCount=10&sortBy=popularity&sortOrder=desc`
    ),
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
    `${appBase}/api/jiosaavn/search/artists?query=${encoded}&limit=20&page=1`,
    ...BASE_URLS.map((b) => `${b}/search/artists?query=${encoded}&limit=20&page=1`),
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // API returns { data: { results: [...] } } or { results: [...] }
      const arr: any[] =
        json?.data?.results ??
        json?.data?.artists?.results ??
        json?.results ??
        [];
      return arr
        .map((a: any) => {
          const id = toStr(a?.id);
          const name = toStr(a?.name);
          if (!id || !name) return null;
          return {
            id,
            name,
            image: normalizeImage(a?.image),
            followerCount: a?.followerCount ?? null,
            dominantLanguage: a?.dominantLanguage ?? null,
          } as ArtistCard;
        })
        .filter((x): x is ArtistCard => Boolean(x));
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) return r.value;
  }
  return [];
}

async function fetchFeaturedArtists(): Promise<ArtistCard[]> {
  // Search for each popular artist name in parallel, take the top result
  const queries = POPULAR_ARTIST_QUERIES.slice(0, 20);
  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const found = await searchArtists(q);
      return found[0] ?? null;
    })
  );

  const seen = new Set<string>();
  return results
    .filter((r): r is PromiseFulfilledResult<ArtistCard | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((a): a is ArtistCard => {
      if (!a?.id || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getArtistDetails(id: string): Promise<JioSaavnArtist | null> {
  const cached = await getCachedArtist(id);
  if (cached) {
    void fetchArtistRaw(id).then((fresh) => {
      if (fresh) void setCachedArtist(id, fresh);
    });
    return cached;
  }
  const fresh = await fetchArtistRaw(id);
  if (fresh) void setCachedArtist(id, fresh);
  return fresh;
}

export async function getFeaturedArtists(): Promise<ArtistCard[]> {
  const cached = await getCachedFeaturedArtists();
  if (cached && cached.length > 0) {
    void fetchFeaturedArtists().then((fresh) => {
      if (fresh.length > 0) void setCachedFeaturedArtists(fresh);
    });
    return cached;
  }
  const fresh = await fetchFeaturedArtists();
  if (fresh.length > 0) void setCachedFeaturedArtists(fresh);
  return fresh;
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
    `${appBase}/api/jiosaavn/artists/${encodeURIComponent(id)}/songs?page=${page}&sortBy=${sortBy}&sortOrder=desc`,
    ...BASE_URLS.map(
      (b) =>
        `${b}/artists/${encodeURIComponent(id)}/songs?page=${page}&sortBy=${sortBy}&sortOrder=desc`
    ),
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr: any[] = json?.data?.songs ?? json?.songs ?? json?.data ?? [];
      if (!Array.isArray(arr)) throw new Error("no songs array");
      return arr.map(normalizeSong).filter(Boolean) as JioSaavnSong[];
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) return r.value;
  }
  return [];
}
