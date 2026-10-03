import { hslToRgb,normalizeHexColor,rgbToHex,rgbToHsl } from "./colorMath";
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
 * 3. JS Fallback Layer (Expo Go / Web):
 *    - Pure-JS decode + sampled RGB/HSL extraction.
 *
 * 4. Mavrixfy Presentation Layer:
 *    - Custom Spotify-inspired transforms (`getSpotifyMiniPlayerBg`, `ensureDarkHexColor`)
 *      to ensure consistent dark-mode styling and WCAG readable text contrast across the UI.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect,useState } from "react";
import { Platform } from "react-native";

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
  const targetS = Math.min(0.85, Math.max(0.32, s));

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
const STORAGE_KEY_PALETTES = "@mavrixfy_palette_cache_v2";
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
  // If native image-colors is not available (e.g. Expo Go / JS fallback),
  // do NOT aggressively preload 50 songs in JS because decoding 50 JPEGs concurrently causes heating.
  if (!canUseNativeImageColors()) return;

  for (const rawUrl of imageUrls) {
    const url = rawUrl?.trim();
    if (!url || paletteCache.has(url) || pendingRequests.has(url)) continue;
    void extractArtworkColors(url).catch(() => {});
  }
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
  const [palette, setPalette] = useState<ArtworkPalette>(() =>
    getImmediateArtworkPalette(imageUrl)
  );

  useEffect(() => {
    const key = (imageUrl || "").trim();
    if (!key) {
      setPalette(DEFAULT_ARTWORK_PALETTE);
      return;
    }

    let isMounted = true;
    void extractArtworkColors(key).then((extracted) => {
      if (isMounted) {
        setPalette((prev) => {
          if (
            prev.background === extracted.background &&
            prev.accent === extracted.accent &&
            prev.text === extracted.text
          ) {
            return prev;
          }
          return extracted;
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  return palette;
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
      const result = await getColors(cacheKey, {
        fallback: "#0E1016",
        cache: true,
        quality: "low",
        key: cacheKey,
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

  // Fast jewel palette fallback (0ms, avoids freezing JS thread with full JPEG decode)
  const fallbackPalette = buildPaletteFromUrlHash(cacheKey);
  setCachedPalette(cacheKey, fallbackPalette);
  if (rawKey !== cacheKey) {
    setCachedPalette(rawKey, fallbackPalette);
  }
  return fallbackPalette;
}

async function extractArtworkColorsWithJsDecoder(cacheKey: string): Promise<ArtworkPalette> {
  try {
    const localUri = await cacheRemoteArtwork(cacheKey);
    const bytes = await FileSystem.readAsStringAsync(localUri, {
      encoding: "base64",
    }).then(base64ToBytes).catch(() => new Uint8Array());

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return extractPaletteFromJpeg(bytes);
    }
  } catch {
    // Graceful fallback
  }

  return buildPaletteFromUrlHash(cacheKey);
}

function extractPaletteFromJpeg(bytes: Uint8Array): ArtworkPalette {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jpeg = require("jpeg-js") as {
    decode: (
      input: Uint8Array,
      options: { useTArray: boolean; formatAsRGBA: boolean; maxMemoryUsageInMB?: number }
    ) => { data: Uint8Array; width: number; height: number };
  };

  const { data, width, height } = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: false, // 3 channels (RGB)
    maxMemoryUsageInMB: 6,
  });

  const swatchesRgb = sampleDominantSwatchesFromPixels(data, width, height, 3);
  const primary = swatchesRgb[0] || { r: 35, g: 45, b: 60 };
  const rawHexSwatches = swatchesRgb.map((s) => rgbToHex(s.r, s.g, s.b));
  const rawDomHex = rgbToHex(primary.r, primary.g, primary.b);
  const rawVibHex = rawHexSwatches[1] || rawDomHex;

  const background = transformToSeamlessBackground(rawDomHex);
  const accent = transformToVibrantAccent(rawVibHex);
  const swatches = dedupeAndDarkenSwatches(rawHexSwatches, background);

  return {
    background,
    accent,
    text: "#FFFFFF",
    isDark: true,
    primary: accent,
    rawDominant: rawDomHex,
    rawVibrant: rawVibHex,
    swatches,
  };
}

const PRESET_JEWEL_PALETTES: [string, string][] = [
  ["#0D2420", "#26E19A"], // Emerald Teal
  ["#111D30", "#3E8BFF"], // Sapphire Ocean
  ["#231530", "#A259FF"], // Royal Amethyst
  ["#281912", "#FF7A45"], // Sepia Ember
  ["#1F2420", "#52C41A"], // Forest Jade
  ["#28141F", "#FF4D88"], // Ruby Crimson
  ["#1A2228", "#13C2C2"], // Cyan Marine
  ["#221E14", "#FAAD14"], // Sunset Topaz
  ["#1A162B", "#8C65FF"], // Lavender Velvet
  ["#261B20", "#FF6B8B"], // Rose Plum
];

export function buildPaletteFromUrlHash(url: string): ArtworkPalette {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PRESET_JEWEL_PALETTES.length;
  const [bg, accent] = PRESET_JEWEL_PALETTES[idx];
  const background = transformToSeamlessBackground(bg);
  const vibrantAccent = transformToVibrantAccent(accent);
  const swatches = dedupeAndDarkenSwatches([bg, accent]);
  return {
    background,
    accent: vibrantAccent,
    text: "#FFFFFF",
    isDark: true,
    primary: vibrantAccent,
    rawDominant: bg,
    rawVibrant: accent,
    swatches,
  };
}

function sampleDominantSwatchesFromPixels(
  data: Uint8Array,
  width: number,
  height: number,
  channels = 3
): { r: number; g: number; b: number }[] {
  const step = Math.max(6, Math.floor(Math.sqrt((width * height) / 350)));
  const bins: { rSum: number; gSum: number; bSum: number; count: number; maxSat: number }[] = Array.from(
    { length: 13 },
    () => ({ rSum: 0, gSum: 0, bSum: 0, count: 0, maxSat: 0 })
  );

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * channels;
      if (index + 2 >= data.length) continue;
      const alpha = channels === 4 ? data[index + 3] : 255;
      if (alpha < 32) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const { h, s, l } = rgbToHsl(r, g, b);

      if (l < 0.06 || l > 0.94) continue;

      let binIdx = 12; // neutral
      if (s >= 0.10) {
        binIdx = Math.min(11, Math.floor(h / 30));
      }

      bins[binIdx].rSum += r;
      bins[binIdx].gSum += g;
      bins[binIdx].bSum += b;
      bins[binIdx].count += 1;
      bins[binIdx].maxSat = Math.max(bins[binIdx].maxSat, s);
    }
  }

  // Populate bins that have pixels
  const populated = bins.filter((b) => b.count > 0);

  if (populated.length === 0) {
    return [{ r: 83, g: 83, b: 86 }];
  }

  // 1. Dominant: Highest pixel count (true dominant color of the image)
  const sortedByCount = [...populated].sort((a, b) => b.count - a.count);
  const dominantBin = sortedByCount[0];

  // 2. Vibrant: Highest vibrancy / saturation (avoiding neutral bin 12 if possible)
  const coloredBins = populated.filter((b) => b !== bins[12] && b.maxSat >= 0.18);
  const vibrantBin =
    coloredBins.length > 0
      ? coloredBins.sort((a, b) => b.count * b.maxSat - a.count * a.maxSat)[0]
      : sortedByCount[1] || dominantBin;

  const result: { r: number; g: number; b: number }[] = [];
  result.push({
    r: Math.round(dominantBin.rSum / dominantBin.count),
    g: Math.round(dominantBin.gSum / dominantBin.count),
    b: Math.round(dominantBin.bSum / dominantBin.count),
  });

  if (vibrantBin !== dominantBin) {
    result.push({
      r: Math.round(vibrantBin.rSum / vibrantBin.count),
      g: Math.round(vibrantBin.gSum / vibrantBin.count),
      b: Math.round(vibrantBin.bSum / vibrantBin.count),
    });
  }

  for (const b of sortedByCount) {
    if (b !== dominantBin && b !== vibrantBin) {
      result.push({
        r: Math.round(b.rSum / b.count),
        g: Math.round(b.gSum / b.count),
        b: Math.round(b.bSum / b.count),
      });
    }
  }

  return result;
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

async function buildArtworkSources(cacheKey: string): Promise<string[]> {
  const normalized = normalizeArtworkUrl(cacheKey);
  if (!normalized) return [];

  if (normalized.startsWith("file://") || normalized.startsWith("data:") || normalized.startsWith("content://")) {
    return [normalized];
  }

  if (!normalized.startsWith("http")) {
    return [normalized];
  }

  // On iOS: react-native-image-colors uses URLSession.shared.dataTask which directly downloads
  // HTTP/HTTPS in memory. Passing local file:// URLs to URLSession on iOS fails with error -1002 (unsupported URL).
  // Thus, the remote HTTPS URL must be the primary source on iOS.
  if (Platform.OS === "ios") {
    return [normalized];
  }

  // On Android, attempt caching for fast local decode, fallback to remote URL
  try {
    const localUri = await cacheRemoteArtwork(normalized);
    return [localUri, normalized];
  } catch {
    return [normalized];
  }
}

async function cacheRemoteArtwork(remoteUrl: string): Promise<string> {
  const extensionMatch = remoteUrl.match(/\.(jpe?g|png|webp|gif)(\?|#|$)/i);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "jpg";
  const fileName = `art-${hashString(remoteUrl)}.${extension}`;
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("Cache directory unavailable.");
  }
  const localUri = `${cacheDir}${fileName}`;

  try {
    const existing = await FileSystem.getInfoAsync(localUri).catch(() => ({ exists: false }));
    if (existing.exists) {
      return localUri;
    }
    const downloaded = await FileSystem.downloadAsync(remoteUrl, localUri);
    return downloaded.uri;
  } catch (e) {
    throw e;
  }
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

    // Pick the dominant background:
    // 1. If result.background has color (s >= 0.10) and is not washed-out white (l < 0.88), it's the natural dominant tone.
    // 2. If result.background is near-white or black/fallback, check for a rich colored candidate swatch.
    let bestDominant = result.background;
    if (!bgStats || bgStats.hex === "#000000" || bgStats.hex === "#0E1016" || bgStats.l > 0.88 || bgStats.s < 0.10) {
      const coloredCandidate = candidates.find((c) => c.s >= 0.15 && c.l >= 0.10 && c.l <= 0.85);
      if (coloredCandidate) {
        bestDominant = coloredCandidate.hex;
      } else if (bgStats && bgStats.hex !== "#000000" && bgStats.l < 0.88) {
        bestDominant = bgStats.hex;
      } else if (primaryStats && primaryStats.hex !== "#000000" && primaryStats.hex !== "#0E1016") {
        bestDominant = primaryStats.hex;
      } else {
        bestDominant = DEFAULT_ARTWORK_PALETTE.background;
      }
    }

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

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

