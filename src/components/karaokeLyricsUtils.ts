import { transformToSeamlessBackground } from "@/lib/colorExtractor";

/**
 * Convert accent color or image palette to the signature Spotify lyrics card/screen background hue.
 */
export function getSpotifyLyricsBg(accentColor?: string, songFallbackSeed?: string): string {
  if (accentColor && accentColor !== "#0E1016" && accentColor !== "#000000" && accentColor !== "#16181D" && accentColor !== "#181A20") {
    return transformToSeamlessBackground(accentColor);
  }

  if (!songFallbackSeed) return "#1A2B3C";

  let hash = 0;
  for (let i = 0; i < songFallbackSeed.length; i++) {
    hash = songFallbackSeed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = ["#24527A", "#5C2D4A", "#1D5443", "#5C3A1E", "#3D2B5A", "#4A3B22"];
  const idx = Math.abs(hash) % hues.length;
  return hues[idx];
}
