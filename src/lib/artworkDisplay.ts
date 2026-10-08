import { PixelRatio } from "react-native";
import { artworkPixelSize, youTubeDisplayArtworkUrl } from "@/services/youtube/YouTubeArtwork";

/** Keep master URLs in data/navigation; request only the pixels this view needs. */
export function displayArtworkUrl(uri: string | undefined, layoutSize: number): string {
  return youTubeDisplayArtworkUrl(uri || "", artworkPixelSize(layoutSize, PixelRatio.get()));
}
