import type { Song } from "./musicData";

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
