import { colorWithAlpha,hslToRgb,normalizeHexColor,rgbToHex,rgbToHsl } from "./colorMath";
import { artworkAnalysisUrl } from "@/services/youtube/YouTubeArtwork";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useEffect,useState } from "react";
import { Platform } from "react-native";
export { colorWithAlpha } from "./colorMath";
/**
 * colorExtractor.ts — Artwork Color Extraction Architecture
 *
 * 1. Native Layer (Android):
 *    - Uses AndroidX Palette (`androidx.palette.graphics.Palette`) to extract:
 *      • 6 Standard Color Profiles: Vibrant, Vibrant Dark, Vibrant Light, Muted, Muted Dark, Muted Light
 *      • Dominant Swatch: Swatch with greatest pixel population (`getDominantSwatch()`)
 *      • Safely handles nullable profile swatches with prioritized fallback chaining.
 *
 * 2. Native Layer (iOS):
 *    - Uses `UIImageColors` to extract background, primary, secondary, and detail.
 *
 * 3. Fallback Layer (Expo Go / extraction errors):
 *    - Neutral theme colors; artwork colors are never guessed from the URL.
 *
 * 4. Mavrixfy Presentation Layer:
 *    - Custom Spotify-inspired transforms (`getSpotifyMiniPlayerBg`, `ensureDarkHexColor`)
 *      to ensure consistent dark-mode styling and WCAG readable text contrast across the UI.
 */


type ImageColorsResult =
  | {
      platform: "android";
      vibrant?: string;
      lightVibrant?: string;
      darkVibrant?: string;
      darkMuted?: string;
      muted?: string;
      dominant?: string;
      average?: string;
    }
  | {
      platform: "ios";
      background?: string;
      primary?: string;
      secondary?: string;
      detail?: string;
    }
  | {
      platform: "web";
      vibrant?: string;
      lightVibrant?: string;
      darkVibrant?: string;
      darkMuted?: string;
      muted?: string;
      dominant?: string;
    };

type NativeGetColors = (uri: string, config?: Record<string, unknown>) => Promise<ImageColorsResult>;

export interface ArtworkPalette {
  /** Controlled background color for screen/card top gradients. Preserves exact hue and adapts lightness seamlessly. */
  background: string;
  /** Primary vibrant accent for interactive controls, badges, waves, buttons */
  accent: string;
  /** Text color dynamically calculated for highest contrast readability */
  text: string;
  isDark: boolean;
  /** Accent color alias for older call sites. */
  primary: string;
  /** Raw dominant color straight from native extraction without alteration */
  rawDominant?: string;
  /** Raw vibrant color straight from native extraction without alteration */
  rawVibrant?: string;
  /** All extracted discrete color swatches directly from the artwork. */
  swatches?: string[];
}

export type ArtworkAmbientGradientStops = readonly [string, string, string, string];
export const ARTWORK_AMBIENT_GRADIENT_LOCATIONS = [0, 0.40, 0.75, 1] as const;
export const ARTWORK_AMBIENT_TRANSITION_DURATION_MS = 850;

/** Shared artwork-driven ambient gradient used by Home and the full player. */
export function getArtworkAmbientGradientStops(
  accent: string,
  background: string,
  baseColor: string
): ArtworkAmbientGradientStops {
  return [
    colorWithAlpha(accent, 0.42, "rgba(20, 24, 32, 0.50)"),
    colorWithAlpha(background, 0.65, "rgba(18, 22, 28, 0.50)"),
    colorWithAlpha(baseColor, 0.90, baseColor),
    baseColor,
  ];
}

/** @deprecated Use ArtworkPalette */
export type ColorResult = ArtworkPalette;

export interface SpotifyColorTheme {
  accent: string;
  accentSoft: string;
  onAccent: string;
  border: string;
  playerGradient: [string, string, string, string];
  playlistBackdrop: [string, string, string, string, string];
}

export const DEFAULT_ARTWORK_PALETTE: ArtworkPalette = {
  background: "#0E1016",
  accent: "#26E19A",
  text: "#FFFFFF",
  isDark: true,
  primary: "#26E19A",
  rawDominant: "#0E1016",
  rawVibrant: "#26E19A",
  swatches: ["#142820", "#122030", "#281420", "#241A10", "#181A20"],
};

export function getSpotifyMiniPlayerBg(color: string, defaultBg = "#16181D"): string {
  const normalized = normalizeHexColor(color);
  if (!normalized) return defaultBg;
  return transformToSeamlessBackground(normalized);
}

/**
 * Transforms an extracted artwork color into a seamless, elegant top-gradient background.
 * Follows the Apple Music & Spotify color science:
 * - Retains exact artwork hue (H).
 * - Light/pastel colors (e.g. Benson Boone pale blue/green, Taylor Swift turquoise, Billie Eilish lime):
 *   Lightness is gently adapted into a rich, visible range (0.24 - 0.32) so the true pastel/light
 *   hue is clearly noticeable and gorgeous, without blinding or breaking white text contrast.
 * - Dark colors (e.g. Bruno Mars black/gray, Weeknd dark crimson):
 *   Lightness is gently lifted if too pitch black (0.13 - 0.18) so details don't get lost.
 * - Saturation is balanced (0.35 - 0.72) to prevent harsh neon while avoiding dull muddy gray.
 */
export function transformToSeamlessBackground(hexColor: string): string {
  const normalized = normalizeHexColor(hexColor) ?? DEFAULT_ARTWORK_PALETTE.background;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Pure grayscale or near-neutral (Bruno Mars, etc.)
  if (s < 0.08) {
    const clampedL = Math.max(0.08, Math.min(0.14, l));
    const rgb = hslToRgb(h, 0.03, clampedL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  // Accurate dark background: Keep exact hue, keep saturation true to artwork,
  // target rich dark lightness (0.09 - 0.16) so text contrast is 100% and background
  // is solid, deep, and perfectly matches the artwork tone
  let targetL = 0.09 + l * 0.12;
  targetL = Math.max(0.08, Math.min(0.16, targetL));

  // Maintain natural saturation of the extracted color (accurate, no artificial neon or wash):
  const targetS = Math.min(0.85, s);

  const darkRgb = hslToRgb(h, targetS, targetL);
  return rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b);
}

/**
 * Transforms an extracted color into a vibrant, high-energy accent for buttons and badges.
 */
export function transformToVibrantAccent(hexColor: string): string {
  const normalized = normalizeHexColor(hexColor) ?? DEFAULT_ARTWORK_PALETTE.accent;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.08) {
    return "#FFFFFF";
  }

  const targetL = Math.max(0.50, Math.min(0.70, l > 0.30 ? l : 0.56));
  const targetS = Math.max(0.70, Math.min(1.0, s * 1.25));

  const rgb = hslToRgb(h, targetS, targetL);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function ensureDarkHexColor(
  hexColor: string,
  _maxLightness?: number,
  _minLightness?: number
): string {
  return transformToSeamlessBackground(hexColor);
}

const COLOR_CACHE_MAX_ENTRIES = 200;
const STORAGE_KEY_PALETTES = "@mavrixfy_palette_cache_v3";
const paletteCache = new Map<string, ArtworkPalette>();
const pendingRequests = new Map<string, Promise<ArtworkPalette>>();

let saveStorageTimeout: ReturnType<typeof setTimeout> | null = null;

// Hydrate persistent cache immediately on module load
void (async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PALETTES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === "object") {
            paletteCache.set(k, v as ArtworkPalette);
          }
        }
      }
    }
  } catch {}
})();

function persistPaletteCacheDebounced(): void {
  if (saveStorageTimeout) clearTimeout(saveStorageTimeout);
  saveStorageTimeout = setTimeout(() => {
    try {
      const obj: Record<string, ArtworkPalette> = {};
      let count = 0;
      for (const [k, v] of paletteCache.entries()) {
        obj[k] = v;
        count++;
        if (count >= 150) break;
      }
      void AsyncStorage.setItem(STORAGE_KEY_PALETTES, JSON.stringify(obj));
    } catch {}
  }, 1000);
}

let nativeGetColors: NativeGetColors | null | undefined;

export function normalizeArtworkUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "";
  let clean = url.trim();
  if (!clean) return "";

  // Upgrade insecure http:// to https:// to satisfy iOS ATS in release/IPA builds
  if (clean.startsWith("http://")) {
    clean = "https://" + clean.slice(7);
  }

  // Handle potential unencoded characters in URL (spaces, unicode)
  try {
    clean = encodeURI(decodeURI(clean));
  } catch {
    // Keep as is if encoding fails
  }

  return clean;
}

export function getColorStats(hex: string | undefined | null) {
  const norm = normalizeHexColor(hex);
  if (!norm) return null;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const { h, s, l } = rgbToHsl(r, g, b);
  // Vibrancy score favors saturated colors with moderate lightness (avoids pitch black and blinding white)
  const vibrancy = s * (1 - Math.abs(l - 0.55) * 1.3);
  return { hex: norm, h, s, l, vibrancy };
}

export function extractArtworkColors(imageUrl: string): Promise<ArtworkPalette> {
  const rawKey = (imageUrl || "").trim();
  if (!rawKey) return Promise.resolve(DEFAULT_ARTWORK_PALETTE);

  const cacheKey = normalizeArtworkUrl(rawKey);

  const cached = paletteCache.get(cacheKey) || paletteCache.get(rawKey);
  if (cached) {
    paletteCache.delete(cacheKey);
    paletteCache.set(cacheKey, cached);
    return Promise.resolve(cached);
  }

  const pending = pendingRequests.get(cacheKey) || pendingRequests.get(rawKey);
  if (pending) return pending;

  const request = extractArtworkColorsUncached(cacheKey).finally(() => {
    pendingRequests.delete(cacheKey);
    pendingRequests.delete(rawKey);
  });
  pendingRequests.set(cacheKey, request);
  if (rawKey !== cacheKey) {
    pendingRequests.set(rawKey, request);
  }
  return request;
}

export function preloadDominantColors(imageUrls: (string | null | undefined)[]): void {
  // Expo Go does not include the native image-colors module.
  if (!canUseNativeImageColors()) return;

  // Preloading is sequential so adjacent covers don't compete with playback/rendering.
  void (async () => {
    for (const rawUrl of imageUrls) {
      const url = rawUrl?.trim();
      if (!url || paletteCache.has(normalizeArtworkUrl(url))) continue;
      await extractArtworkColors(url).catch(() => {});
    }
  })();
}

export function getImmediateArtworkPalette(imageUrl: string | null | undefined): ArtworkPalette {
  const rawKey = (imageUrl || "").trim();
  if (!rawKey) return DEFAULT_ARTWORK_PALETTE;

  const cacheKey = normalizeArtworkUrl(rawKey);

  const cached = paletteCache.get(cacheKey) || paletteCache.get(rawKey);
  if (!cached) return DEFAULT_ARTWORK_PALETTE;

  paletteCache.delete(cacheKey);
  paletteCache.set(cacheKey, cached);
  return cached;
}

/**
 * Reusable hook for reactive artwork color extraction with instant cache retrieval.
 */
export function useArtworkPalette(imageUrl: string | null | undefined): ArtworkPalette {
  const key = normalizeArtworkUrl(imageUrl);
  const [resolved, setResolved] = useState<{ key: string; palette: ArtworkPalette }>(() => ({
    key,
    palette: getImmediateArtworkPalette(key),
  }));

  useEffect(() => {
    if (!key) return;

    let isMounted = true;
    void extractArtworkColors(key).then((extracted) => {
      if (isMounted) {
        setResolved((previous) => previous.key === key
          && previous.palette.background === extracted.background
          && previous.palette.accent === extracted.accent
          && previous.palette.text === extracted.text
          ? previous
          : { key, palette: extracted });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [key]);

  if (!key) return DEFAULT_ARTWORK_PALETTE;
  return resolved.key === key ? resolved.palette : getImmediateArtworkPalette(key);
}

function canUseNativeImageColors(): boolean {
  if (Platform.OS === "web") return true;
  // Expo Go cannot load custom native modules like ImageColors.
  if (Constants.executionEnvironment === "storeClient") return false;
  if (Constants.appOwnership === "expo") return false;
  return true;
}

function resolveNativeGetColors(): NativeGetColors | null {
  if (nativeGetColors !== undefined) return nativeGetColors;
  nativeGetColors = null;

  if (!canUseNativeImageColors()) return null;

  try {
    // Must not be imported at file scope — module load throws in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeGetColors = require("react-native-image-colors").getColors as NativeGetColors;
  } catch {
    nativeGetColors = null;
  }

  return nativeGetColors;
}

async function extractArtworkColorsUncached(rawKey: string): Promise<ArtworkPalette> {
  const cacheKey = normalizeArtworkUrl(rawKey);
  if (!cacheKey) return DEFAULT_ARTWORK_PALETTE;

  const getColors = resolveNativeGetColors();

  if (getColors) {
    try {
      const result = await getColors(artworkAnalysisUrl(cacheKey), {
        fallback: "#0E1016",
        cache: true,
        quality: "high",
        pixelSpacing: 2,
        key: `artwork-palette-v3:${cacheKey}`,
      });

      const palette = mapImageColorsToPalette(result);
      if (!isDefaultPalette(palette)) {
        setCachedPalette(cacheKey, palette);
        if (rawKey !== cacheKey) {
          setCachedPalette(rawKey, palette);
        }
        return palette;
      }
    } catch {
      // Native extraction failed or unavailable, fall back smoothly
    }
  }

  const palette = await extractJpegArtworkPalette(artworkAnalysisUrl(cacheKey)).catch(() => null);
  if (!palette) return DEFAULT_ARTWORK_PALETTE;
  setCachedPalette(cacheKey, palette);
  if (rawKey !== cacheKey) setCachedPalette(rawKey, palette);
  return palette;
}

/** Small Expo Go fallback: sample real JPEG pixels when the native module is absent. */
async function extractJpegArtworkPalette(imageUrl: string): Promise<ArtworkPalette | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(imageUrl, {
      headers: { Accept: "image/jpeg,image/*;q=0.8" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.length > 2_000_000) return null;

    // Lazy load so production native builds continue to use native Palette/UIImageColors.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jpeg = require("jpeg-js") as { decode: (input: Uint8Array, options: Record<string, unknown>) => { width: number; height: number; data: Uint8Array } };
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 1, maxMemoryUsageInMB: 12 });
    if (!image.width || !image.height || image.width * image.height > 1_000_000) return null;

    const bins = new Map<number, { r: number; g: number; b: number; count: number }>();
    const stride = Math.max(1, Math.ceil(Math.sqrt((image.width * image.height) / 12_000)));
    for (let y = 0; y < image.height; y += stride) {
      for (let x = 0; x < image.width; x += stride) {
        const offset = (y * image.width + x) * 4;
        const r = image.data[offset], g = image.data[offset + 1], b = image.data[offset + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bin = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
        bin.r += r; bin.g += g; bin.b += b; bin.count++;
        bins.set(key, bin);
      }
    }

    const swatches = [...bins.values()].map(bin => {
      const r = Math.round(bin.r / bin.count), g = Math.round(bin.g / bin.count), b = Math.round(bin.b / bin.count);
      const hex = rgbToHex(r, g, b);
      return { hex, count: bin.count, stats: getColorStats(hex)! };
    });
    if (!swatches.length) return null;

    const dominant = swatches.reduce((best, next) => next.count > best.count ? next : best);
    const vibrant = swatches
      .filter(color => color.stats.s >= 0.14 && color.stats.l >= 0.10 && color.stats.l <= 0.88)
      .sort((a, b) => (b.count * b.stats.vibrancy) - (a.count * a.stats.vibrancy))[0] || dominant;
    const background = transformToSeamlessBackground(dominant.hex);
    const accent = transformToVibrantAccent(vibrant.hex);
    return {
      background, accent, text: "#FFFFFF", isDark: true, primary: accent,
      rawDominant: dominant.hex, rawVibrant: vibrant.hex,
      swatches: dedupeAndDarkenSwatches(swatches.sort((a, b) => b.count - a.count).slice(0, 5).map(color => color.hex), background),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function dedupeAndDarkenSwatches(swatches: (string | undefined | null)[], primaryBg?: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  if (primaryBg) {
    const dark = transformToSeamlessBackground(primaryBg);
    result.push(dark);
    seen.add(dark);
  }

  for (const raw of swatches) {
    const norm = normalizeHexColor(raw);
    if (!norm) continue;
    const dark = transformToSeamlessBackground(norm);
    if (!seen.has(dark)) {
      result.push(dark);
      seen.add(dark);
    }
    if (result.length >= 5) break;
  }

  // If fewer than 5 swatches, generate harmonious variations from primary base
  const base = result[0] || DEFAULT_ARTWORK_PALETTE.background;
  const baseRgb = {
    r: parseInt(base.slice(1, 3), 16),
    g: parseInt(base.slice(3, 5), 16),
    b: parseInt(base.slice(5, 7), 16),
  };
  const { h, s, l } = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

  const hueOffsets = [35, -35, 70, 180, -70];
  let offsetIdx = 0;
  while (result.length < 5 && offsetIdx < hueOffsets.length) {
    const newH = (h + hueOffsets[offsetIdx] + 360) % 360;
    const newRgb = hslToRgb(newH, Math.max(0.40, s), Math.max(0.12, Math.min(0.20, l)));
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    if (!seen.has(hex)) {
      result.push(hex);
      seen.add(hex);
    }
    offsetIdx++;
  }

  return result.slice(0, 5);
}

function mapImageColorsToPalette(result: ImageColorsResult): ArtworkPalette {
  if (result.platform === "ios") {
    const bgStats = getColorStats(result.background);
    const primaryStats = getColorStats(result.primary);
    const secondaryStats = getColorStats(result.secondary);
    const detailStats = getColorStats(result.detail);

    const candidates = [primaryStats, secondaryStats, detailStats, bgStats].filter(
      (c): c is NonNullable<typeof c> => c !== null && c.hex !== "#000000" && c.hex !== "#0E1016"
    );

    // Pick the most vibrant color as accent:
    // Vibrancy rewards saturation while avoiding pitch black or blinding white
    let bestAccent = candidates.length > 0
      ? candidates.slice().sort((a, b) => b.vibrancy - a.vibrancy)[0].hex
      : result.primary || result.detail || result.background || DEFAULT_ARTWORK_PALETTE.accent;

    // UIImageColors' background is the artwork's dominant/background tone.
    // Keep neutral and black covers neutral instead of substituting a vivid detail.
    const bestDominant = bgStats && bgStats.hex !== "#000000" && bgStats.hex !== "#0E1016"
      ? bgStats.hex
      : result.background || DEFAULT_ARTWORK_PALETTE.background;

    const rawDom = normalizeHexColor(bestDominant) ?? DEFAULT_ARTWORK_PALETTE.background;
    const rawVib = normalizeHexColor(bestAccent) ?? DEFAULT_ARTWORK_PALETTE.accent;

    const background = transformToSeamlessBackground(rawDom);
    const accent = transformToVibrantAccent(rawVib);

    const swatches = dedupeAndDarkenSwatches(
      [rawVib, rawDom, result.background, result.primary, result.secondary, result.detail],
      background
    );

    return {
      background,
      accent,
      text: "#FFFFFF",
      isDark: true,
      primary: accent,
      rawDominant: rawDom,
      rawVibrant: rawVib,
      swatches,
    };
  }

  // Android / Web: Prioritize true dominant color for background, and vibrant for accent
  const rawDom = pickColor(
    result.dominant,
    result.darkVibrant,
    result.vibrant,
    result.darkMuted,
    result.platform === "android" ? result.average : undefined
  ) ?? DEFAULT_ARTWORK_PALETTE.background;

  const rawVib = pickColor(
    result.vibrant,
    result.lightVibrant,
    result.darkVibrant,
    result.dominant,
    result.platform === "android" ? result.average : undefined
  ) ?? DEFAULT_ARTWORK_PALETTE.accent;

  const background = transformToSeamlessBackground(rawDom);
  const accent = transformToVibrantAccent(rawVib);

  const swatches = dedupeAndDarkenSwatches(
    [
      result.vibrant,
      result.lightVibrant,
      result.dominant,
      rawDom,
      result.darkVibrant,
      result.muted,
      result.platform === "android" ? result.average : undefined,
    ],
    background
  );

  return {
    background,
    accent,
    text: "#FFFFFF",
    isDark: true,
    primary: accent,
    rawDominant: rawDom,
    rawVibrant: rawVib,
    swatches,
  };
}

function isDefaultPalette(palette: ArtworkPalette): boolean {
  return (
    palette.background === DEFAULT_ARTWORK_PALETTE.background &&
    palette.accent === DEFAULT_ARTWORK_PALETTE.accent &&
    palette.rawDominant === DEFAULT_ARTWORK_PALETTE.rawDominant &&
    palette.rawVibrant === DEFAULT_ARTWORK_PALETTE.rawVibrant
  );
}

function setCachedPalette(key: string, value: ArtworkPalette): void {
  paletteCache.set(key, value);
  while (paletteCache.size > COLOR_CACHE_MAX_ENTRIES) {
    const oldestKey = paletteCache.keys().next().value;
    if (!oldestKey) break;
    paletteCache.delete(oldestKey);
  }
  persistPaletteCacheDebounced();
}

function pickColor(...candidates: (string | undefined | null)[]): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized) return normalized;
  }
  return null;
}
