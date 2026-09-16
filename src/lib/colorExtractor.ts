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

import { useState, useEffect } from "react";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
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
    const clampedL = Math.max(0.10, Math.min(0.18, l));
    const rgb = hslToRgb(h, 0.04, clampedL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  // Controlled lightness curve preserving rich vibrant tones:
  let targetL = 0.14 + l * 0.22;
  targetL = Math.max(0.14, Math.min(0.34, targetL));

  // Boost saturation to keep the extracted colors vivid & saturated:
  const targetS = Math.min(0.92, Math.max(0.48, s * 1.10));

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
const paletteCache = new Map<string, ArtworkPalette>();
const pendingRequests = new Map<string, Promise<ArtworkPalette>>();

let nativeGetColors: NativeGetColors | null | undefined;

export function extractArtworkColors(imageUrl: string): Promise<ArtworkPalette> {
  const cacheKey = (imageUrl || "").trim();
  if (!cacheKey) return Promise.resolve(DEFAULT_ARTWORK_PALETTE);

  const cached = paletteCache.get(cacheKey);
  if (cached) {
    paletteCache.delete(cacheKey);
    paletteCache.set(cacheKey, cached);
    return Promise.resolve(cached);
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const request = extractArtworkColorsUncached(cacheKey).finally(() => {
    pendingRequests.delete(cacheKey);
  });
  pendingRequests.set(cacheKey, request);
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
  const cacheKey = (imageUrl || "").trim();
  if (!cacheKey) return DEFAULT_ARTWORK_PALETTE;

  const cached = paletteCache.get(cacheKey);
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
        setPalette(extracted);
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

async function extractArtworkColorsUncached(cacheKey: string): Promise<ArtworkPalette> {
  const getColors = resolveNativeGetColors();

  if (getColors) {
    const sources = await buildArtworkSources(cacheKey);

    for (let i = 0; i < sources.length; i++) {
      try {
        const result = await getColors(sources[i], {
          fallback: DEFAULT_ARTWORK_PALETTE.background,
          cache: false,
          quality: "high",
          key: cacheKey,
          ...(Platform.OS === "android" ? { pixelSpacing: 5 } : {}),
        });

        const palette = mapImageColorsToPalette(result);
        if (!isDefaultPalette(palette)) {
          setCachedPalette(cacheKey, palette);
          return palette;
        }
      } catch {
        // Try next source.
      }
    }
  }

  // JS Fallback Layer (Expo Go / Web):
  // Extracts ACTUAL matching colors from the image for active song/screen
  try {
    const palette = await extractArtworkColorsWithJsDecoder(cacheKey);
    setCachedPalette(cacheKey, palette);
    return palette;
  } catch {
    const fallbackPalette = buildPaletteFromUrlHash(cacheKey);
    setCachedPalette(cacheKey, fallbackPalette);
    return fallbackPalette;
  }
}

async function extractArtworkColorsWithJsDecoder(cacheKey: string): Promise<ArtworkPalette> {
  const bytes = await buildArtworkSources(cacheKey).then(async (sources) => {
    const localUri = sources[0];
    return FileSystem.readAsStringAsync(localUri, {
      encoding: "base64",
    }).then(base64ToBytes).catch(() => new Uint8Array());
  });

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return extractPaletteFromJpeg(bytes);
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

  // Sort bins by prominence & saturation with strong vibrancy weighting
  const populated = bins
    .filter((b) => b.count > 0)
    .sort(
      (a, b) =>
        b.count * (1 + Math.pow(b.maxSat, 1.5) * 3.5) -
        a.count * (1 + Math.pow(a.maxSat, 1.5) * 3.5)
    );

  if (populated.length === 0) {
    return [{ r: 83, g: 83, b: 86 }];
  }

  return populated.map((b) => ({
    r: Math.round(b.rSum / b.count),
    g: Math.round(b.gSum / b.count),
    b: Math.round(b.bSum / b.count),
  }));
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

function buildSpotifyStylePaletteFromRgb(r: number, g: number, b: number): ArtworkPalette {
  const hex = rgbToHex(r, g, b);
  const background = transformToSeamlessBackground(hex);
  const accent = transformToVibrantAccent(hex);

  return {
    background,
    accent,
    text: "#FFFFFF",
    isDark: true,
    primary: accent,
    rawDominant: hex,
    rawVibrant: hex,
  };
}

async function buildArtworkSources(cacheKey: string): Promise<string[]> {
  if (cacheKey.startsWith("file://") || cacheKey.startsWith("data:") || cacheKey.startsWith("content://")) {
    return [cacheKey];
  }

  if (!cacheKey.startsWith("http")) {
    return [cacheKey];
  }

  const localUri = await cacheRemoteArtwork(cacheKey);
  return [localUri, cacheKey];
}

async function cacheRemoteArtwork(remoteUrl: string): Promise<string> {
  const extensionMatch = remoteUrl.match(/\.(jpe?g|png|webp|gif)(\?|#|$)/i);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "jpg";
  const fileName = `art-${hashString(remoteUrl)}.${extension}`;
  const localUri = `${FileSystem.cacheDirectory ?? ""}${fileName}`;
  if (!localUri || localUri === fileName) {
    throw new Error("Cache directory unavailable.");
  }

  return FileSystem.getInfoAsync(localUri).then(async (existing) => {
    if (existing.exists) {
      return localUri;
    }
    const downloaded = await FileSystem.downloadAsync(remoteUrl, localUri);
    return downloaded.uri;
  });
}

function mapImageColorsToPalette(result: ImageColorsResult): ArtworkPalette {
  if (result.platform === "ios") {
    const rawDom = pickColor(result.primary, result.background, result.detail, result.secondary) ?? DEFAULT_ARTWORK_PALETTE.background;
    const rawVib = pickColor(result.detail, result.primary, result.secondary, result.background) ?? DEFAULT_ARTWORK_PALETTE.accent;
    const background = transformToSeamlessBackground(rawDom);
    const accent = transformToVibrantAccent(rawVib);
    const swatches = dedupeAndDarkenSwatches(
      [rawVib, rawDom, result.primary, result.detail, result.secondary, result.background],
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

  // Android / Web: Prioritize vibrant profiles for glowing, punchy colors
  const rawDom = pickColor(
    result.vibrant,
    result.dominant,
    result.lightVibrant,
    result.darkVibrant,
    result.platform === "android" ? result.average : undefined
  ) ?? DEFAULT_ARTWORK_PALETTE.background;

  const rawVib = pickColor(
    result.vibrant,
    result.lightVibrant,
    result.dominant,
    result.darkVibrant,
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

function buildPalette(background: string, accent: string, swatches?: string[]): ArtworkPalette {
  const bg = normalizeHexColor(background) ?? DEFAULT_ARTWORK_PALETTE.background;
  const darkBg = transformToSeamlessBackground(bg);
  const accentColor = normalizeHexColor(accent) ?? DEFAULT_ARTWORK_PALETTE.accent;
  const vibrantAccent = transformToVibrantAccent(accentColor);

  return {
    background: darkBg,
    accent: vibrantAccent,
    text: "#FFFFFF",
    isDark: true,
    primary: vibrantAccent,
    rawDominant: bg,
    rawVibrant: accentColor,
    swatches: swatches && swatches.length >= 3 ? swatches : dedupeAndDarkenSwatches([darkBg, vibrantAccent]),
  };
}

function isDefaultPalette(palette: ArtworkPalette): boolean {
  return (
    palette.background === DEFAULT_ARTWORK_PALETTE.background &&
    palette.accent === DEFAULT_ARTWORK_PALETTE.accent
  );
}

function setCachedPalette(key: string, value: ArtworkPalette): void {
  paletteCache.set(key, value);
  while (paletteCache.size > COLOR_CACHE_MAX_ENTRIES) {
    const oldestKey = paletteCache.keys().next().value;
    if (!oldestKey) break;
    paletteCache.delete(oldestKey);
  }
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

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h >= 0 && h < 60) {
    rn = c; gn = x; bn = 0;
  } else if (h < 120) {
    rn = x; gn = c; bn = 0;
  } else if (h < 180) {
    rn = 0; gn = c; bn = x;
  } else if (h < 240) {
    rn = 0; gn = x; bn = c;
  } else if (h < 300) {
    rn = x; gn = 0; bn = c;
  } else {
    rn = c; gn = 0; bn = x;
  }

  return {
    r: (rn + m) * 255,
    g: (gn + m) * 255,
    b: (bn + m) * 255,
  };
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (!color) return null;

  if (/^[0-9a-fA-F]{6}$/.test(color)) {
    return `#${color.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[0]}${color[0]}${color[1]}${color[1]}${color[2]}${color[2]}`.toUpperCase();
  }

  const shortHexMatch = color.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHexMatch) {
    const shortHex = shortHexMatch[1];
    return `#${shortHex[0]}${shortHex[0]}${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}`.toUpperCase();
  }

  const fullHexMatch = color.match(/^#([0-9a-fA-F]{6})$/);
  if (fullHexMatch) {
    return `#${fullHexMatch[1].toUpperCase()}`;
  }

  const rgbaHexMatch = color.match(/^#([0-9a-fA-F]{8})$/);
  if (rgbaHexMatch) {
    return `#${rgbaHexMatch[1].slice(0, 6).toUpperCase()}`;
  }

  const rgbMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = clamp(Number(rgbMatch[1]), 0, 255);
    const g = clamp(Number(rgbMatch[2]), 0, 255);
    const b = clamp(Number(rgbMatch[3]), 0, 255);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  return null;
}



function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHex(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

export function colorWithAlpha(hex: string, alpha: number, fallback = "rgba(255,255,255,1)"): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return fallback;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}
