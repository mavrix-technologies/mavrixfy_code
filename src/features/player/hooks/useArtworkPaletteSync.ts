import {
DEFAULT_ARTWORK_PALETTE,
extractArtworkColors,
getImmediateArtworkPalette,
type ArtworkPalette,
} from "@/lib/colorExtractor";
import type { Song } from "@/lib/musicData";
import { useCallback,useEffect,useState } from "react";

export interface UseArtworkPaletteSyncParams {
  screenSong: Song | null;
  interactionReady: boolean;
}

const PLAYER_NEUTRAL_PALETTE: ArtworkPalette = {
  ...DEFAULT_ARTWORK_PALETTE,
  accent: "#A1A1AA",
  primary: "#A1A1AA",
  rawVibrant: "#A1A1AA",
};

function getPlayerPalette(imageUrl: string | null | undefined): ArtworkPalette {
  const palette = getImmediateArtworkPalette(imageUrl);
  return palette === DEFAULT_ARTWORK_PALETTE ? PLAYER_NEUTRAL_PALETTE : palette;
}

export function useArtworkPaletteSync({
  screenSong,
  interactionReady,
}: UseArtworkPaletteSyncParams) {
  const cover = screenSong?.coverUrl?.trim() || "";
  const [resolvedPalette, setResolvedPalette] = useState(() => ({
    cover,
    palette: getPlayerPalette(cover),
  }));
  // Derive the next track's cached/neutral palette during render so a previous
  // track's tint (or the app's green theme default) never flashes on song change.
  const artworkPalette = resolvedPalette.cover === cover
    ? resolvedPalette.palette
    : getPlayerPalette(cover);

  const applyPlayerArtworkColors = useCallback((palette: ArtworkPalette) => {
    setResolvedPalette({ cover, palette });
  }, [cover]);

  useEffect(() => {
    if (!interactionReady) return;
    let active = true;
    if (!cover) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedPalette({ cover, palette: PLAYER_NEUTRAL_PALETTE });
      return () => {};
    }

    const immediatePalette = getPlayerPalette(cover);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedPalette({ cover, palette: immediatePalette });

    extractArtworkColors(cover)
      .then((palette) => {
        if (!active) return;
        if (screenSong?.coverUrl?.trim() !== cover) return;
        setResolvedPalette({ cover, palette });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [interactionReady, screenSong?.id, cover]);

  return {
    artworkPalette,
    albumColor: artworkPalette.accent,
    textColor: artworkPalette.text,
    applyPlayerArtworkColors,
  };
}
