import {
  colorWithAlpha,
  hslToRgb,
  normalizeHexColor,
  rgbToHex,
  rgbToHsl,
} from "./colorMath";
import { artworkAnalysisUrl } from "@/services/youtube/YouTubeArtwork";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";

export { colorWithAlpha } from "./colorMath";

/**
 * Native image colors result contract from react-native-image-colors
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

type NativeGetColors = (
  uri: string,
  config?: Record<string, unknown>
) => Promise<ImageColorsResult>;

export type ArtworkAmbientGradientStops = readonly [
  string,
  string,
  string,
  string,
];

export const ARTWORK_AMBIENT_GRADIENT_LOCATIONS = [
  0, 0.4, 0.75, 1,
] as const;
export const ARTWORK_AMBIENT_TRANSITION_DURATION_MS = 850;

/**
 * Unified Artwork Palette Interface
 * Complete, single source of truth for all color-driven UI elements.
 */
export interface ArtworkPalette {
  /** Controlled background color for screen/card top gradients. Preserves exact hue and adapts lightness seamlessly. */
  background: string;
  /** Primary vibrant accent for interactive controls, badges, waves, buttons */
  accent: string;
  /** Secondary harmonic accent for subtle highlights, alternate icons, badges */
  secondaryAccent: string;
  /** Muted darker accent for subtle surfaces or borders */
  muted: string;
  /** Text color dynamically calculated for highest contrast readability */
  text: string;
  /** Secondary text color with optimal contrast and readability */
  secondaryText: string;
  isDark: boolean;
  /** Accent color alias for older call sites. */
  primary: string;
  /** Raw dominant color straight from native extraction without alteration */
  rawDominant?: string;
  /** Raw vibrant color straight from native extraction without alteration */
  rawVibrant?: string;
  /** All extracted discrete color swatches directly from the artwork. */
  swatches?: string[];
  /** Dedicated Spotify-style lyrics card / screen background */
  lyricsBg: string;
  /** Solid opaque sticky header background blended onto dark base */
  headerBg: string;
  /** Ambient 4-stop gradient stops ready for backdrop components */
  ambientGradient: ArtworkAmbientGradientStops;
}

/** @deprecated Use ArtworkPalette */
export type ColorResult = ArtworkPalette;

/**
 * Shared artwork-driven ambient gradient used by Home, Player, and Details.
 */
export function getArtworkAmbientGradientStops(
  accent: string,
  background: string,
  baseColor: string
): ArtworkAmbientGradientStops {
  return [
    colorWithAlpha(accent, 0.42, "rgba(20, 24, 32, 0.50)"),
    colorWithAlpha(background, 0.65, "rgba(18, 22, 28, 0.50)"),
    colorWithAlpha(baseColor, 0.9, baseColor),
    baseColor,
  ];
}

/**
 * Convert accent color or song seed to the signature Spotify lyrics card/screen background hue.
 * Produces a rich, saturated slate tone (lightness ~0.26-0.35, saturation ~0.48-0.72)
 * so it never blends in seamlessly with the dark screen background and never washes out to white.
 */
export function getSpotifyLyricsBg(
  accentColor?: string,
  songFallbackSeed?: string
): string {
  let hex = (accentColor || "").replace("#", "").trim();

  // If no valid accent color, default fallback, or near-white / grayscale, derive distinct rich hue from song seed
  const isDefaultOrNeutral =
    hex.length !== 6 ||
    hex === "0E1016" ||
    hex === "000000" ||
    hex === "16181D" ||
    hex === "181A20" ||
    hex === "E4E4E7" ||
    hex === "FFFFFF" ||
    hex === "D4D4D8" ||
    hex === "A1A1AA";

  if (isDefaultOrNeutral) {
    if (!songFallbackSeed) return "#24527A";
    let hash = 0;
    for (let i = 0; i < songFallbackSeed.length; i++) {
      hash = songFallbackSeed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [
      "#24527A", // Ocean Slate
      "#5C2D4A", // Wine Berry
      "#1D5443", // Deep Emerald
      "#5C3A1E", // Warm Amber
      "#3D2B5A", // Royal Plum
      "#4A3B22", // Golden Olive
      "#2A475E", // Midnight Teal
      "#6B3045", // Crimson Slate
    ];
    const idx = Math.abs(hash) % hues.length;
    return hues[idx];
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // RGB to HSL
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r / 255:
        h = (g / 255 - b / 255) / d + (g < b ? 6 : 0);
        break;
      case g / 255:
        h = (b / 255 - r / 255) / d + 2;
        break;
      case b / 255:
        h = (r / 255 - g / 255) / d + 4;
        break;
    }
    h /= 6;
  }

  // If low saturation (grayscale / washed out), use seed hash so it never looks white or muddy
  if (s < 0.12) {
    if (!songFallbackSeed) return "#24527A";
    let hash = 0;
    for (let i = 0; i < songFallbackSeed.length; i++) {
      hash = songFallbackSeed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [
      "#24527A",
      "#5C2D4A",
      "#1D5443",
      "#5C3A1E",
      "#3D2B5A",
      "#4A3B22",
    ];
    return hues[Math.abs(hash) % hues.length];
  }

  // Saturated rich slate tone (lightness 0.26-0.35, saturation 0.48-0.72)
  // Ensures card stands out boldly with rich color, never pitch black ("seamless") and never white
  const targetL = Math.max(
    0.26,
    Math.min(0.35, l < 0.15 ? 0.30 : l > 0.65 ? 0.31 : l)
  );
  const targetS = Math.max(0.48, Math.min(0.72, s < 0.25 ? 0.52 : s));

  const hue2rgb = (pVal: number, qVal: number, tVal: number) => {
    let t = tVal;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
    if (t < 1 / 2) return qVal;
    if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
    return pVal;
  };
  const q =
    targetL < 0.5
      ? targetL * (1 + targetS)
      : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const red = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const green = Math.round(hue2rgb(p, q, h) * 255);
  const blue = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

/**
 * Produces a 100% solid, fully opaque (non-transparent) background color
 * blended from the extracted artwork palette onto a dark base (#0A0C12).
 */
export function getSolidHeaderColor(
  accentHex?: string,
  bgHex?: string
): string {
  const accentNorm = normalizeHexColor(accentHex);
  const bgNorm = normalizeHexColor(bgHex);

  if (accentNorm) {
    const ar = parseInt(accentNorm.slice(1, 3), 16);
    const ag = parseInt(accentNorm.slice(3, 5), 16);
    const ab = parseInt(accentNorm.slice(5, 7), 16);

    const br = bgNorm ? parseInt(bgNorm.slice(1, 3), 16) : 10;
    const bg = bgNorm ? parseInt(bgNorm.slice(3, 5), 16) : 12;
    const bb = bgNorm ? parseInt(bgNorm.slice(5, 7), 16) : 18;

    const ratio = 0.18;
    const r = Math.round(br * (1 - ratio) + ar * ratio);
    const g = Math.round(bg * (1 - ratio) + ag * ratio);
    const b = Math.round(bb * (1 - ratio) + ab * ratio);

    return rgbToHex(r, g, b);
  }

  if (bgNorm) {
    return bgNorm;
  }

  return "#0A0C12";
}

export const DEFAULT_ARTWORK_PALETTE: ArtworkPalette = {
  background: "#0E1016",
  accent: "#E4E4E7",
  secondaryAccent: "#A1A1AA",
  muted: "#181A20",
  text: "#FFFFFF",
  secondaryText: "rgba(255, 255, 255, 0.72)",
  isDark: true,
  primary: "#E4E4E7",
  rawDominant: "#0E1016",
  rawVibrant: "#E4E4E7",
  swatches: ["#141720", "#181A24", "#12141A", "#1C2028", "#0A0C12"],
  lyricsBg: "#24527A",
  headerBg: "#0A0C12",
  ambientGradient: [
    "rgba(20, 24, 32, 0.60)",
    "rgba(14, 16, 22, 0.85)",
    "rgba(0, 0, 0, 0.95)",
    "#000000",
  ],
};

export function getSpotifyMiniPlayerBg(
  color: string,
  defaultBg = "#16181D"
): string {
  const normalized = normalizeHexColor(color);
  if (!normalized) return defaultBg;
  return transformToSeamlessBackground(normalized);
}

/**
 * Transforms an extracted artwork color into a seamless, elegant top-gradient background.
 * Follows the Apple Music & Spotify color science:
 * - Retains exact artwork hue (H).
 * - Light/pastel colors: Lightness is gently adapted into a rich, visible range (0.24 - 0.32) so
 *   the true pastel/light hue is clearly noticeable without blinding or breaking white text contrast.
 * - Dark colors: Lightness is gently lifted if too pitch black (0.10 - 0.16) so details don't get lost.
 * - Saturation is balanced (0.35 - 0.85) to prevent harsh neon while avoiding dull muddy gray.
 */
export function transformToSeamlessBackground(hexColor: string): string {
  const normalized =
    normalizeHexColor(hexColor) ?? DEFAULT_ARTWORK_PALETTE.background;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Pure grayscale or near-neutral
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

  const targetS = Math.min(0.85, s);
  const darkRgb = hslToRgb(h, targetS, targetL);
  return rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b);
}

/**
 * Transforms an extracted color into a vibrant, high-energy accent for buttons and badges.
 */
export function transformToVibrantAccent(hexColor: string): string {
  const normalized =
    normalizeHexColor(hexColor) ?? DEFAULT_ARTWORK_PALETTE.accent;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.08) {
    return "#FFFFFF";
  }

  const targetL = Math.max(0.5, Math.min(0.7, l > 0.3 ? l : 0.56));
  const targetS = Math.max(0.7, Math.min(1.0, s * 1.25));

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
const PALETTE_CACHE_VERSION = `v5:${Platform.OS}:${Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo" ? "expo-go" : "native"}`;
const STORAGE_KEY_PALETTES = `@mavrixfy_palette_cache_${PALETTE_CACHE_VERSION}`;
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
          if (v && typeof v === "object" && !paletteCache.has(k)) {
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

/**
 * Unified factory to construct a complete ArtworkPalette with harmonic multi-color combinations.
 */
export function createArtworkPalette(params: {
  rawDom: string;
  rawVib: string;
  rawSec?: string;
  rawMuted?: string;
  swatches?: string[];
}): ArtworkPalette {
  const background = transformToSeamlessBackground(params.rawDom);
  const accent = transformToVibrantAccent(params.rawVib);
  const secondaryAccent = params.rawSec
    ? transformToVibrantAccent(params.rawSec)
    : accent;
  const muted = params.rawMuted
    ? transformToSeamlessBackground(params.rawMuted)
    : background;
  const lyricsBg = getSpotifyLyricsBg(accent, params.rawVib);
  const headerBg = getSolidHeaderColor(accent, background);
  const ambientGradient = getArtworkAmbientGradientStops(
    accent,
    background,
    "#000000"
  );

  return {
    background,
    accent,
    secondaryAccent,
    muted,
    text: "#FFFFFF",
    secondaryText: "rgba(255, 255, 255, 0.72)",
    isDark: true,
    primary: accent,
    rawDominant: params.rawDom,
    rawVibrant: params.rawVib,
    swatches: params.swatches || [
      background,
      accent,
      secondaryAccent,
      muted,
      "#0A0C12",
    ],
    lyricsBg,
    headerBg,
    ambientGradient,
  };
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

export function preloadDominantColors(
  imageUrls: (string | null | undefined)[]
): () => void {
  // Expo Go does not include the native image-colors module.
  if (!canUseNativeImageColors()) return () => {};
  let cancelled = false;

  // Keep one extraction in flight so adjacent covers do not compete with playback.
  void imageUrls.reduce<Promise<void>>((previous, rawUrl) => previous.then(() => {
    if (cancelled) return;
    const url = rawUrl?.trim();
    if (!url || paletteCache.has(normalizeArtworkUrl(url))) return;
    return extractArtworkColors(url).then(() => {}, () => {});
  }), Promise.resolve());
  return () => { cancelled = true; };
}

export function getImmediateArtworkPalette(
  imageUrl: string | null | undefined
): ArtworkPalette {
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
 * Single source of truth for all components (MiniPlayer, Full Player, Backdrop, Lyrics, etc.)
 */
export function useArtworkPalette(
  imageUrl: string | null | undefined
): ArtworkPalette {
  const key = normalizeArtworkUrl(imageUrl);
  const { data } = useQuery({
    queryKey: ["artwork-palette", key],
    queryFn: () => extractArtworkColors(key),
    enabled: Boolean(key),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    initialData: () => {
      const cached = getImmediateArtworkPalette(key);
      return isDefaultPalette(cached) ? undefined : cached;
    },
  });
  const [lastPalette, setLastPalette] = useState(() => getImmediateArtworkPalette(key));
  if (data && !isDefaultPalette(data) && lastPalette !== data) setLastPalette(data);
  if (!key) return DEFAULT_ARTWORK_PALETTE;
  // Retain the last resolved colors when a new extraction is pending or unavailable.
  return data && !isDefaultPalette(data) ? data : lastPalette;
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
    nativeGetColors = require("react-native-image-colors")
      .getColors as NativeGetColors;
  } catch {
    nativeGetColors = null;
  }

  return nativeGetColors;
}

async function extractArtworkColorsUncached(
  rawKey: string
): Promise<ArtworkPalette> {
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
        key: `artwork-palette-${PALETTE_CACHE_VERSION}:${cacheKey}`,
      });
      if (result.platform === "ios" && [result.background, result.primary, result.secondary, result.detail]
        .every(color => !color || color.toUpperCase() === "#0E1016")) return DEFAULT_ARTWORK_PALETTE;

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

  if (Platform.OS === "ios" && canUseNativeImageColors()) return DEFAULT_ARTWORK_PALETTE;

  const palette = await extractJpegArtworkPalette(
    artworkAnalysisUrl(cacheKey)
  ).catch(() => null);
  if (!palette) return DEFAULT_ARTWORK_PALETTE;
  setCachedPalette(cacheKey, palette);
  if (rawKey !== cacheKey) setCachedPalette(rawKey, palette);
  return palette;
}

/** Small Expo Go fallback: sample real JPEG pixels when the native module is absent. */
async function extractJpegArtworkPalette(
  imageUrl: string
): Promise<ArtworkPalette | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(imageUrl, {
      headers: { Accept: "image/jpeg,image/*;q=0.8" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes.length > 2_000_000
    )
      return null;

    // Lazy load so production native builds continue to use native Palette/UIImageColors.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jpeg = require("jpeg-js") as {
      decode: (
        input: Uint8Array,
        options: Record<string, unknown>
      ) => { width: number; height: number; data: Uint8Array };
    };
    const image = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 1,
      maxMemoryUsageInMB: 12,
    });
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 1_000_000
    )
      return null;

    const bins = new Map<
      number,
      { r: number; g: number; b: number; count: number }
    >();
    const stride = Math.max(
      1,
      Math.ceil(Math.sqrt((image.width * image.height) / 12_000))
    );
    for (let y = 0; y < image.height; y += stride) {
      for (let x = 0; x < image.width; x += stride) {
        const offset = (y * image.width + x) * 4;
        const r = image.data[offset],
          g = image.data[offset + 1],
          b = image.data[offset + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bin = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
        bin.r += r;
        bin.g += g;
        bin.b += b;
        bin.count++;
        bins.set(key, bin);
      }
    }

    const swatches = [...bins.values()].map((bin) => {
      const r = Math.round(bin.r / bin.count),
        g = Math.round(bin.g / bin.count),
        b = Math.round(bin.b / bin.count);
      const hex = rgbToHex(r, g, b);
      return { hex, count: bin.count, stats: getColorStats(hex)! };
    });
    if (!swatches.length) return null;

    const dominant = swatches.reduce((best, next) =>
      next.count > best.count ? next : best
    );
    const vibrantCandidates = swatches
      .filter(
        (color) =>
          color.stats.s >= 0.14 &&
          color.stats.l >= 0.1 &&
          color.stats.l <= 0.88
      )
      .sort(
        (a, b) =>
          b.count * b.stats.vibrancy - a.count * a.stats.vibrancy
      );
    const vibrant = vibrantCandidates[0] || dominant;
    const secondaryVibrant = vibrantCandidates[1] || vibrant;

    const rawDom = dominant.hex;
    const rawVib = vibrant.hex;
    const rawSec = secondaryVibrant.hex;
    const swatchesHex = dedupeAndDarkenSwatches(
      swatches
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((color) => color.hex),
      rawDom
    );

    return createArtworkPalette({
      rawDom,
      rawVib,
      rawSec,
      swatches: swatchesHex,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function dedupeAndDarkenSwatches(
  swatches: (string | undefined | null)[],
  primaryBg?: string
): string[] {
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
    const newRgb = hslToRgb(
      newH,
      Math.max(0.4, s),
      Math.max(0.12, Math.min(0.2, l))
    );
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
    // UIImageColors defines background and foreground roles; keep those roles.
    const rawDom = pickColor(result.background) ?? DEFAULT_ARTWORK_PALETTE.background;
    const rawVib = pickColor(result.primary, result.secondary, result.detail, rawDom) ?? rawDom;
    const rawSec = pickColor(result.secondary, result.detail, rawVib) ?? rawVib;

    const swatches = dedupeAndDarkenSwatches(
      [
        rawVib,
        rawDom,
        rawSec,
        result.background,
        result.primary,
        result.secondary,
        result.detail,
      ],
      rawDom
    );

    const palette = createArtworkPalette({
      rawDom,
      rawVib,
      rawSec,
      rawMuted: result.detail || result.secondary,
      swatches,
    });
    return { ...palette, accent: rawVib, primary: rawVib, secondaryAccent: rawSec,
      lyricsBg: palette.background,
      ambientGradient: getArtworkAmbientGradientStops(rawDom, palette.background, "#000000") };
  }

  // Android / Web: Evaluate all available profile swatches
  const rawCandidateStrings = [
    result.vibrant,
    result.lightVibrant,
    result.darkVibrant,
    result.dominant,
    result.muted,
    result.darkMuted,
    result.platform === "android" ? result.average : undefined,
  ];

  const candidates: NonNullable<ReturnType<typeof getColorStats>>[] = [];
  for (const raw of rawCandidateStrings) {
    const stats = getColorStats(raw);
    if (
      stats &&
      stats.hex !== "#000000" &&
      stats.hex !== "#0E1016" &&
      stats.hex !== "#FFFFFF"
    ) {
      candidates.push(stats);
    }
  }

  // Rank accent candidates by vibrancy
  const sortedByVibrancy = candidates
    .slice()
    .sort((a, b) => b.vibrancy - a.vibrancy);
  const bestAccent =
    sortedByVibrancy.length > 0
      ? sortedByVibrancy[0].hex
      : pickColor(
          result.vibrant,
          result.lightVibrant,
          result.darkVibrant,
          result.dominant
        ) ?? DEFAULT_ARTWORK_PALETTE.accent;

  const secondaryAccent =
    sortedByVibrancy.length > 1 ? sortedByVibrancy[1].hex : bestAccent;

  // Dominant color: prioritize dominant swatch if viable, fallback to darkMuted or darkVibrant
  const domStats = getColorStats(result.dominant);
  const isGoodDominant =
    domStats &&
    domStats.s >= 0.04 &&
    domStats.l >= 0.04 &&
    domStats.l <= 0.94;
  const bestDominant = isGoodDominant
    ? result.dominant!
    : pickColor(
        result.dominant,
        result.darkMuted,
        result.darkVibrant,
        result.muted,
        result.platform === "android" ? result.average : undefined
      ) ?? DEFAULT_ARTWORK_PALETTE.background;

  const rawDom =
    normalizeHexColor(bestDominant) ?? DEFAULT_ARTWORK_PALETTE.background;
  const rawVib =
    normalizeHexColor(bestAccent) ?? DEFAULT_ARTWORK_PALETTE.accent;
  const rawSec = normalizeHexColor(secondaryAccent) ?? rawVib;

  const swatches = dedupeAndDarkenSwatches(rawCandidateStrings, rawDom);

  return createArtworkPalette({
    rawDom,
    rawVib,
    rawSec,
    rawMuted: result.darkMuted || result.muted,
    swatches,
  });
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
  persistPaletteCacheDebounced();
}

function pickColor(
  ...candidates: (string | undefined | null)[]
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized) return normalized;
  }
  return null;
}
