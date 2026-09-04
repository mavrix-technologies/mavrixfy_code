import { useState, useEffect, useCallback } from "react";
import {
  DEFAULT_ARTWORK_PALETTE,
  extractArtworkColors,
  getImmediateArtworkPalette,
  type ArtworkPalette,
} from "@/lib/colorExtractor";
import type { Song } from "@/lib/musicData";

export interface UseArtworkPaletteSyncParams {
  screenSong: Song | null;
  interactionReady: boolean;
}

export function useArtworkPaletteSync({
  screenSong,
  interactionReady,
}: UseArtworkPaletteSyncParams) {
  const [artworkPalette, setArtworkPalette] = useState<ArtworkPalette>(DEFAULT_ARTWORK_PALETTE);

  const applyPlayerArtworkColors = useCallback((palette: ArtworkPalette) => {
    setArtworkPalette(palette);
  }, []);

  useEffect(() => {
    if (!interactionReady) return;
    let active = true;
    const cover = screenSong?.coverUrl?.trim();
    if (!cover) {
      setArtworkPalette(DEFAULT_ARTWORK_PALETTE);
      return () => {};
    }

    const immediatePalette = getImmediateArtworkPalette(cover);
    setArtworkPalette(immediatePalette);

    extractArtworkColors(cover)
      .then((palette) => {
        if (!active) return;
        if (screenSong?.coverUrl?.trim() !== cover) return;
        setArtworkPalette(palette);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [interactionReady, screenSong?.id, screenSong?.coverUrl]);

  return {
    artworkPalette,
    albumColor: artworkPalette.accent,
    textColor: artworkPalette.text,
    applyPlayerArtworkColors,
  };
}
