import { artworkPixelSize,youTubeDisplayArtworkUrl } from "@/services/youtube/YouTubeArtwork";
import { runAfterIdle } from "@/utils/idleTask";
import { Image } from "expo-image";
import { PixelRatio } from "react-native";
import { preloadDominantColors } from "./colorExtractor";

/** Warm the same URLs as MusicArtwork without decoding offscreen masters into memory. */
export function scheduleArtworkPreload(urls: string[], layoutSize: number): () => void {
  let cancelPalettePreload: (() => void) | undefined;
  const cancelIdle = runAfterIdle(() => {
    const pixels = artworkPixelSize(layoutSize, PixelRatio.get());
    const sources = [...new Set(urls.map(url => youTubeDisplayArtworkUrl(url, pixels)).filter(Boolean))];
    void Image.prefetch(sources, "disk").catch(() => {});
    cancelPalettePreload = preloadDominantColors(urls);
  });
  return () => {
    cancelIdle();
    cancelPalettePreload?.();
  };
}
