import {
  searchLiveITunesSongs,
  searchLiveITunesAlbums,
  searchLiveITunesArtists,
  searchSpotifyPlaylists,
  generateDynamicSpotifyPlaylists,
  SPOTIFY_PRESETS,
  SPOTIFY_PODCASTS,
} from "@/services/spotify/SpotifyCatalogService";
import { fetchAppApi } from "@/lib/api-config";
import { convertJioSaavnSong } from "@/lib/musicData";
import { getPlayableRemoteAudioUrl, Song, type JioSaavnImage } from "@/lib/musicData";
import { searchYouTubeMusic } from "@/services/youtube/YouTubeMusic";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { fetchJsonStrict } from "@/utils/asyncUtils";

export type ResultFilter = "all" | "songs" | "albums" | "artists" | "playlists";

export interface PlaylistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  url?: string;
  description?: string;
  language?: string;
}

export interface AlbumResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  year?: string;
  language?: string;
  url?: string;
  artist?: string;
  description?: string;
}

export interface ArtistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  subtitle?: string;
  url?: string;
  followerCount?: number | null;
  dominantLanguage?: string | null;
}

export interface SearchResults {
  songs: Song[];
  albums: AlbumResult[];
  artists: ArtistResult[];
  playlists: PlaylistResult[];
}

export const EMPTY_RESULTS: SearchResults = {
  songs: [],
  albums: [],
  artists: [],
  playlists: [],
};

const decodeHtml = (t: string): string =>
  t
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/**
 * Universal Search Suggestions Engine
 * Merges Spotify API suggestions, iTunes India, JioSaavn, and YouTube autocomplete
 * (Exact logic inspired by E:\ria)
 */
export async function fetchYouTubeSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const qLower = trimmed.toLowerCase();
  const suggestions: string[] = [];

  // 1. Spotify Presets & Podcasts Autocomplete (from E:\ria)

    for (const p of SPOTIFY_PRESETS) {
      if (p.name.toLowerCase().includes(qLower) || p.query.toLowerCase().includes(qLower)) {
        suggestions.push(p.name);
      }
    }
    for (const pod of SPOTIFY_PODCASTS) {
      if (pod.title.toLowerCase().includes(qLower) || pod.publisher.toLowerCase().includes(qLower)) {
        suggestions.push(pod.title);
      }
    }

  // 2. Spotify / JioSaavn Server Autocomplete
  const serverPromise = (async () => {
    try {
      const resp = await fetchAppApi(`/search?query=${encodeURIComponent(trimmed)}`, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!resp?.ok) return [];
      const payload = await resp.json();
      const hits: string[] = [];
      if (payload?.data?.topQuery?.results) {
        for (const item of payload.data.topQuery.results) {
          const title = item.title || item.name;
          if (title && typeof title === "string") hits.push(title);
        }
      }
      if (payload?.data?.songs?.results) {
        for (const s of payload.data.songs.results.slice(0, 4)) {
          const title = s.title || s.name;
          if (title && typeof title === "string") hits.push(title);
        }
      }
      return hits;
    } catch {
      return [];
    }
  })();

  // 3. iTunes India Autocomplete (from E:\ria\js\api.js)
  const itunesPromise = (async () => {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&entity=song&country=IN&limit=8`;
      const res = await fetch(url, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || [])
        .map((r: any) => r.trackName)
        .filter(Boolean);
    } catch {
      return [];
    }
  })();

  // 4. YouTube Autocomplete
  const ytPromise = (async () => {

    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(trimmed)}`;
      const data = await fetchJsonStrict<[string, string[]]>(url, signal, 4000).catch(() => null);
      return Array.isArray(data) && Array.isArray(data[1])
        ? data[1].flatMap((s) => (typeof s === "string" && s.trim() ? [s.trim()] : []))
        : [];
    } catch {
      return [];
    }
  })();

  const [serverHits, itunesHits, ytHits] = await Promise.all([serverPromise, itunesPromise, ytPromise]);

  const combined = [...suggestions, ...serverHits, ...itunesHits, ...ytHits];
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of combined) {
    const clean = decodeHtml(item);
    const key = clean.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(clean);
  }

  return deduped.slice(0, 12);
}

export function parseApiSong(s: any): Song | null {
  if (!s?.id) return null;

  const songId = String(s.id);
  const audioUrl = getPlayableRemoteAudioUrl(s.downloadUrl, s.audioUrl, s.streamUrl, s.url);

  let coverUrl = "";
  if (typeof s.image === "string") {
    coverUrl = s.image;
  } else if (Array.isArray(s.image)) {
    const imgs = s.image;
    coverUrl =
      imgs.find((i: any) => i.quality === "500x500")?.url ||
      imgs.find((i: any) => i.quality === "500x500")?.link ||
      imgs.find((i: any) => i.quality === "150x150")?.url ||
      imgs.find((i: any) => i.quality === "150x150")?.link ||
      imgs[imgs.length - 1]?.url ||
      imgs[imgs.length - 1]?.link ||
      "";
  }

  let artist = "Unknown Artist";
  if (typeof s.primaryArtists === "string" && s.primaryArtists.trim()) {
    artist = s.primaryArtists.trim();
  } else if (typeof s.artist === "string" && s.artist.trim()) {
    artist = s.artist.trim();
  } else if (Array.isArray(s.artists?.primary) && s.artists.primary.length > 0) {
    artist = s.artists.primary.map((a: any) => a.name).join(", ");
  } else if (typeof s.singers === "string" && s.singers.trim()) {
    artist = s.singers.trim();
  } else if (Array.isArray(s.artists?.all) && s.artists.all.length > 0) {
    artist = s.artists.all.map((a: any) => a.name).join(", ");
  } else if (typeof s.description === "string" && s.description.trim()) {
    artist = s.description.trim();
  }

  const title = String(s.name || s.title || "Unknown Song");

  let album = "";
  if (typeof s.album === "string") {
    album = s.album;
  } else if (s.album?.name) {
    album = s.album.name;
  }

  return {
    id: songId,
    title,
    artist,
    album,
    duration: toDurationSeconds(s.duration),
    coverUrl,
    genre: String(s.language || s.genre || ""),
    audioUrl,
    downloadUrl: s.downloadUrl || audioUrl,
    year: s.year ? String(s.year) : "",
    source: (s.provider || "spotify") as any,
    playCount: Number(s.playCount) || 0,
  };
}

/**
 * Universal Multi-Source Search Repository
 * Connects iTunes India, JioSaavn, YouTube Music, and Spotify (Presets & Scraped Playlists)
 */
export async function searchRepository(
  query: string,
  filter: ResultFilter = "all",
  signal?: AbortSignal
): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RESULTS;
  if (signal?.aborted) throw new Error("Search cancelled");

  const qLower = trimmed.toLowerCase();
  const isSpotifyQuery = qLower.includes("spot");

  const songs: Song[] = [];
  const playlists: PlaylistResult[] = [];
  const albums: AlbumResult[] = [];
  const artists: ArtistResult[] = [];

  const tasks: Promise<void>[] = [];

  // 1. SPOTIFY SEARCH (iTunes India & Spotify API & Presets & Dynamic Playlists)

    // A. Live iTunes India Songs (100% Spotify Source)
    if (filter === "all" || filter === "songs") {
      tasks.push(
        (async () => {
          try {
            const itunesSongs = await searchLiveITunesSongs(trimmed, 25, signal);
            for (const s of itunesSongs) {
              const spTrack = { ...s, source: "spotify" as const };

                songs.push(spTrack);
            }
          } catch {}
        })()
      );

      // B. Spotify Search Endpoint (/api/spotify/search)
      tasks.push(
        (async () => {
          try {
            const resp = await fetchAppApi(`/spotify/search?query=${encodeURIComponent(trimmed)}&limit=25`, {
              signal,
              headers: { Accept: "application/json" },
            });
            if (resp?.ok) {
              const payload = await resp.json();
              const rawList = payload?.data?.results || [];
              for (const raw of rawList) {
                if (!raw?.name && !raw?.title) continue;
                const rawId = String(raw.id || "");
                const cleanId = rawId.startsWith("sp_") ? rawId : `sp_${rawId}`;
                const artistStr = Array.isArray(raw.artists?.primary)
                  ? raw.artists.primary.map((a: any) => a.name).join(", ")
                  : (typeof raw.artist === "string" ? raw.artist : "Unknown Artist");
                const albumStr = raw.album?.name || (typeof raw.album === "string" ? raw.album : "");
                const cover = raw.image?.[2]?.url || raw.image?.[1]?.url || raw.image?.[0]?.url || raw.coverUrl || "";
                const dur = Number(raw.duration) || 215;

                const spTrack: Song = {
                  id: cleanId,
                  title: raw.name || raw.title || "Unknown Title",
                  artist: artistStr,
                  album: albumStr,
                  duration: dur,
                  coverUrl: cover,
                  audioUrl: "",
                  source: "spotify",
                  genre: raw.language || "Hindi",
                };


                  songs.push(spTrack);
              }
            }
          } catch {}
        })()
      );
    }

    // C. Spotify Albums
    if (filter === "all" || filter === "albums") {
      tasks.push(
        (async () => {
          try {
            const itunesAlbums = await searchLiveITunesAlbums(trimmed, 12, signal);
            for (const a of itunesAlbums) {
              albums.push(a);
            }
          } catch {}
        })()
      );
      tasks.push(
        (async () => {
          try {
            const resp = await fetchAppApi(`/spotify/albums?query=${encodeURIComponent(trimmed)}&limit=15`, {
              signal,
              headers: { Accept: "application/json" },
            });
            if (resp?.ok) {
              const payload = await resp.json();
              for (const raw of payload?.data?.results || []) {
                if (raw?.id) {
                  albums.push({
                    id: `sp_album_${raw.id}`,
                    name: raw.name || "Album",
                    image: raw.image || [],
                    songCount: Number(raw.songCount) || 0,
                    year: raw.year ? String(raw.year) : undefined,
                    language: raw.language,
                    url: raw.url,
                    artist: raw.primaryArtists || raw.artist,
                    description: `Spotify · ${raw.description || "Album"}`,
                  });
                }
              }
            }
          } catch {}
        })()
      );
    }

    // D. Spotify Artists
    if (filter === "all" || filter === "artists") {
      tasks.push(
        (async () => {
          try {
            const itunesArtists = await searchLiveITunesArtists(trimmed, 10, signal);
            for (const ar of itunesArtists) {
              artists.push(ar);
            }
          } catch {}
        })()
      );
    }

    // E. Spotify Presets & Dynamic Playlists
    const spotifyPlaylists = searchSpotifyPlaylists(trimmed);
    const dynamicPlaylists = generateDynamicSpotifyPlaylists(trimmed, songs[0]?.coverUrl);

    if (filter === "all" || filter === "playlists") {
      if (isSpotifyQuery) {
        playlists.unshift(...spotifyPlaylists);
      } else {
        playlists.push(...spotifyPlaylists);
        playlists.push(...dynamicPlaylists);
      }
    }

  // 2. JIOSAAVN SEARCH (Bollywood, Hindi, Punjabi Catalog & Albums/Playlists)

    tasks.push(
      (async () => {
        try {
          const endpoints: Promise<void>[] = [];

          if (filter === "all" || filter === "songs") {
            endpoints.push(
              (async () => {
                const resp = await fetchAppApi(`/search/songs?query=${encodeURIComponent(trimmed)}&limit=25`, {
                  signal,
                  headers: { Accept: "application/json" },
                });
                if (!resp?.ok) return;
                const payload = await resp.json();
                const rawList = [
                  payload?.data?.results,
                  payload?.data?.songs?.results,
                  payload?.data?.songs,
                  payload?.results,
                  payload?.songs,
                  payload?.data,
                ].find(Array.isArray) || [];

                for (const raw of rawList) {
                  const s = convertJioSaavnSong(raw);
                  if (s?.id) {
                    songs.push(s);
                  }
                }
              })()
            );
          }

          if (filter === "all" || filter === "albums") {
            endpoints.push(
              (async () => {
                const resp = await fetchAppApi(`/search/albums?query=${encodeURIComponent(trimmed)}&limit=15`, {
                  signal,
                  headers: { Accept: "application/json" },
                });
                if (!resp?.ok) return;
                const payload = await resp.json();
                const rawList = [
                  payload?.data?.results,
                  payload?.results,
                  payload?.data,
                ].find(Array.isArray) || [];

                for (const raw of rawList) {
                  if (raw?.id) {
                    albums.push({
                      id: String(raw.id),
                      name: raw.name || "Album",
                      image: raw.image || [],
                      songCount: Number(raw.songCount) || 0,
                      year: raw.year ? String(raw.year) : undefined,
                      language: raw.language,
                      url: raw.url,
                      artist: raw.primaryArtists || raw.artist,
                      description: raw.description,
                    });
                  }
                }
              })()
            );
          }

          if (filter === "all" || filter === "playlists") {
            endpoints.push(
              (async () => {
                const resp = await fetchAppApi(`/search/playlists?query=${encodeURIComponent(trimmed)}&limit=15`, {
                  signal,
                  headers: { Accept: "application/json" },
                });
                if (!resp?.ok) return;
                const payload = await resp.json();
                const rawList = [
                  payload?.data?.results,
                  payload?.results,
                  payload?.data,
                ].find(Array.isArray) || [];

                for (const raw of rawList) {
                  if (raw?.id) {
                    playlists.push({
                      id: String(raw.id),
                      name: raw.name || "Playlist",
                      image: raw.image || [],
                      songCount: Number(raw.songCount) || 0,
                      url: raw.url,
                      description: raw.description || "JioSaavn Playlist",
                      language: raw.language,
                    });
                  }
                }
              })()
            );
          }

          await Promise.allSettled(endpoints);
        } catch {}
      })()
    );

  // 3. YOUTUBE MUSIC SEARCH

    tasks.push(
      (async () => {
        try {
          const ytResults = await searchYouTubeMusic(trimmed, filter, signal);
          if (ytResults) {
            for (const s of ytResults.songs || []) {
              songs.push(s);
            }
            for (const p of ytResults.playlists || []) {
              playlists.push(p);
            }
            for (const a of ytResults.albums || []) {
              albums.push(a);
            }
            for (const ar of ytResults.artists || []) {
              artists.push(ar);
            }
          }
        } catch {}
      })()
    );

  await Promise.allSettled(tasks);

  // Deduplicate songs by normalized title + artist
  const seenSongKeys = new Set<string>();
  const dedupedSongs: Song[] = [];
  for (const s of songs) {
    const key = `${s.title.toLowerCase().trim()}_${s.artist.toLowerCase().trim()}`;
    if (!seenSongKeys.has(key)) {
      seenSongKeys.add(key);
      dedupedSongs.push(s);
    }
  }

  // Deduplicate playlists by id
  const seenPlaylistIds = new Set<string>();
  const dedupedPlaylists: PlaylistResult[] = [];
  for (const pl of playlists) {
    if (!seenPlaylistIds.has(pl.id)) {
      seenPlaylistIds.add(pl.id);
      dedupedPlaylists.push(pl);
    }
  }

  // Deduplicate albums by id
  const seenAlbumIds = new Set<string>();
  const dedupedAlbums: AlbumResult[] = [];
  for (const al of albums) {
    if (!seenAlbumIds.has(al.id)) {
      seenAlbumIds.add(al.id);
      dedupedAlbums.push(al);
    }
  }

  // Deduplicate artists by id
  const seenArtistIds = new Set<string>();
  const dedupedArtists: ArtistResult[] = [];
  for (const ar of artists) {
    if (!seenArtistIds.has(ar.id)) {
      seenArtistIds.add(ar.id);
      dedupedArtists.push(ar);
    }
  }

  return {
    songs: dedupedSongs,
    playlists: dedupedPlaylists,
    albums: dedupedAlbums,
    artists: dedupedArtists,
  };
}
