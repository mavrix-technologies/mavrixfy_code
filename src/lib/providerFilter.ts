import type { Song } from "./musicData";
import type { AppSettings } from "./storage";

export type MusicProvider = "jiosaavn" | "spotify" | "youtube" | "local";

export function getSongProvider(
  song: Partial<Song> | { id?: string; source?: string; audioUrl?: string; playlistId?: string } | null | undefined
): MusicProvider {
  if (!song) return "jiosaavn";
  if (
    song.source === "local" ||
    (typeof song.audioUrl === "string" && (song.audioUrl.startsWith("file://") || song.audioUrl.startsWith("/")))
  ) {
    return "local";
  }
  if (
    song.source === "spotify" ||
    (typeof song.id === "string" && (song.id.startsWith("pl_") || song.id.startsWith("sp_") || song.id.startsWith("itunes_"))) ||
    (typeof (song as any).playlistId === "string" &&
      ((song as any).playlistId.startsWith("pl_") || (song as any).playlistId.startsWith("sp_")))
  ) {
    return "spotify";
  }
  if (
    song.source === "youtube" ||
    (typeof song.id === "string" && song.id.startsWith("youtube_")) ||
    Boolean((song as any).youtubeVideoId || (song as any).videoId)
  ) {
    return "youtube";
  }
  return "jiosaavn";
}

export function isSongProviderAllowed(
  song: Partial<Song> | { id?: string; source?: string; audioUrl?: string; playlistId?: string } | null | undefined,
  settings: Partial<AppSettings> | null | undefined
): boolean {
  if (!song) return true;
  const provider = getSongProvider(song);
  if (provider === "local") return true;
  if (!settings) return true;
  if (provider === "spotify") return settings.enableSpotify !== false;
  if (provider === "youtube") return settings.enableYouTubeMusic !== false;
  if (provider === "jiosaavn") return settings.enableJioSaavn !== false;
  return true;
}

export function isPlaylistProviderAllowed(
  playlistId: string | undefined | null,
  settings: Partial<AppSettings> | null | undefined
): boolean {
  if (!playlistId || !settings) return true;
  if (playlistId.startsWith("pl_") || playlistId.startsWith("sp_")) {
    return settings.enableSpotify !== false;
  }
  if (playlistId.startsWith("youtube_") || playlistId.startsWith("VL") || playlistId.startsWith("RD")) {
    return settings.enableYouTubeMusic !== false;
  }
  return settings.enableJioSaavn !== false;
}
