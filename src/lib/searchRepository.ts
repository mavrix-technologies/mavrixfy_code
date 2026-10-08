import { getPlayableRemoteAudioUrl,Song,type JioSaavnImage } from "@/lib/musicData";
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

export async function fetchYouTubeSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
  const data = await fetchJsonStrict<[string, string[]]>(url, signal, 5000);
  return Array.isArray(data) && Array.isArray(data[1])
    ? data[1].flatMap((s) => {
        const trimmed = String(s || "").trim();
        return trimmed ? [trimmed] : [];
      })
    : [];
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
    source: (s.provider || "jiosaavn") as any,
    playCount: Number(s.playCount) || 0,
  };
}



/** Search owns only the music catalog; provider-specific conversion above is retained for JioSaavn consumers. */
export async function searchRepository(query: string, filter: ResultFilter = "all", signal?: AbortSignal): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RESULTS;
  if (signal?.aborted) throw new Error("Search cancelled");
  return searchYouTubeMusic(trimmed, filter, signal);
}
