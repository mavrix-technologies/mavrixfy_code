import { useArtworkPalette } from "@/lib/colorExtractor";
import type { Song } from "@/lib/musicData";

export interface UseArtworkPaletteSyncParams {
  screenSong: Song | null;
  interactionReady?: boolean;
}

/**
 * Synchronizes the full player screen's artwork palette using the exact same
 * official, reliable extraction pipeline as the miniplayer.
 */
export function useArtworkPaletteSync({
  screenSong,
}: UseArtworkPaletteSyncParams) {
  const cover = screenSong?.coverUrl?.trim() || "";
  const artworkPalette = useArtworkPalette(cover);

  return {
    artworkPalette,
    albumColor: artworkPalette.accent,
    textColor: artworkPalette.text,
  };
}
