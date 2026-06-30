/**
 * Album artwork colors.
 * - Dev/production builds: react-native-image-colors (Palette / UIImageColors).
 * - Expo Go: pure-JS decode fallback (native ImageColors module is unavailable).
 */

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
  background: string;
  accent: string;
  text: string;
  isDark: boolean;
  /** Accent color alias for older call sites. */
  primary: string;
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
  background: "#121212",
  accent: "#535356",
  text: "#FFFFFF",
  isDark: true,
  primary: "#535356",
};

const COLOR_CACHE_MAX_ENTRIES = 200;
const paletteCache = new Map<string, ArtworkPalette>();
const pendingRequests = new Map<string, Promise<ArtworkPalette>>();

let nativeGetColors: NativeGetColors | null | undefined;

export async function extractArtworkColors(imageUrl: string): Promise<ArtworkPalette> {
  const cacheKey = (imageUrl || "").trim();
  if (!cacheKey) return DEFAULT_ARTWORK_PALETTE;

  const cached = paletteCache.get(cacheKey);
  if (cached) {
    paletteCache.delete(cacheKey);
    paletteCache.set(cacheKey, cached);
    return cached;
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const request = extractArtworkColorsUncached(cacheKey).finally(() => {
    pendingRequests.delete(cacheKey);
  });
  pendingRequests.set(cacheKey, request);
  return request;
}

/** @deprecated Use extractArtworkColors */
export const extractDominantColor = extractArtworkColors;

export function preloadDominantColors(imageUrls: Array<string | null | undefined>): void {
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

/** @deprecated Use getImmediateArtworkPalette */
export const getImmediateArtworkColor = getImmediateArtworkPalette;

export function createSpotifyColorTheme(palette: ArtworkPalette | string): SpotifyColorTheme {
  const colors =
    typeof palette === "string"
      ? {
          ...DEFAULT_ARTWORK_PALETTE,
          accent: normalizeHexColor(palette) ?? DEFAULT_ARTWORK_PALETTE.accent,
          primary: normalizeHexColor(palette) ?? DEFAULT_ARTWORK_PALETTE.accent,
        }
      : palette;

  const accent = colors.accent;
  const accentSoft = colors.background;
  const onAccent = getHexLuminance(accent) > 0.55 ? "#0B141A" : "#F5FBFF";
  const border = getHexLuminance(accent) > 0.55 ? "rgba(11,20,26,0.24)" : "rgba(255,255,255,0.28)";

  return {
    accent,
    accentSoft,
    onAccent,
    border,
    playerGradient: [
      colorWithAlpha(accent, 0.9, "rgba(83,83,86,0.9)"),
      colorWithAlpha(accentSoft, 0.72, "rgba(18,18,18,0.72)"),
      colorWithAlpha(accentSoft, 0.96, "rgba(18,18,18,0.96)"),
      "#000000",
    ],
    playlistBackdrop: [
      colorWithAlpha(accent, 0.94, "rgba(83,83,86,0.94)"),
      colorWithAlpha(accentSoft, 0.78, "rgba(18,18,18,0.78)"),
      colorWithAlpha(accentSoft, 0.5, "rgba(18,18,18,0.5)"),
      "rgba(12,12,12,0.58)",
      "rgba(18,18,18,0)",
    ],
  };
}

export function miniPlayerBorderFromAccent(accent: string): string {
  return colorWithAlpha(accent, 0.45, "rgba(255,255,255,0.2)");
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

    for (const source of sources) {
      try {
        const result = await getColors(source, {
          fallback: DEFAULT_ARTWORK_PALETTE.background,
          cache: false,
          quality: "high",
          key: cacheKey,
          ...(Platform.OS === "android" ? { pixelSpacing: 5 } : {}),
        });

        const palette = mapImageColorsToPalette(result);
        if (isDefaultPalette(palette)) continue;

        setCachedPalette(cacheKey, palette);
        return palette;
      } catch {
        // Try next source.
      }
    }
  }

  try {
    const palette = await extractArtworkColorsWithJsDecoder(cacheKey);
    setCachedPalette(cacheKey, palette);
    return palette;
  } catch {
    return DEFAULT_ARTWORK_PALETTE;
  }
}

async function extractArtworkColorsWithJsDecoder(cacheKey: string): Promise<ArtworkPalette> {
  const sources = await buildArtworkSources(cacheKey);
  const localUri = sources[0];
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return extractPaletteFromJpeg(bytes);
  }

  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return extractPaletteFromPng(bytes);
  }

  return buildPaletteFromUrlHash(cacheKey);
}

function extractPaletteFromJpeg(bytes: Uint8Array): ArtworkPalette {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jpeg = require("jpeg-js") as {
    decode: (
      input: Uint8Array,
      options: { useTArray: boolean; formatAsRGBA: boolean }
    ) => { data: Uint8Array; width: number; height: number };
  };

  const { data, width, height } = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });

  const rgb = averageSampledRgb(data, width, height);
  return buildSpotifyStylePaletteFromRgb(rgb.r, rgb.g, rgb.b);
}

function extractPaletteFromPng(bytes: Uint8Array): ArtworkPalette {
  if (typeof globalThis.Buffer === "undefined") {
    throw new Error("PNG decoder unavailable.");
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require("pngjs/browser") as {
    PNG: {
      sync: {
        read: (buffer: Uint8Array) => { data: Uint8Array; width: number; height: number };
      };
    };
  };

  const { data, width, height } = PNG.sync.read(globalThis.Buffer.from(bytes));
  const rgb = averageSampledRgb(data, width, height, 4);
  return buildSpotifyStylePaletteFromRgb(rgb.r, rgb.g, rgb.b);
}

function averageSampledRgb(
  data: Uint8Array,
  width: number,
  height: number,
  channels = 4
): { r: number; g: number; b: number } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const step = Math.max(4, Math.floor(Math.sqrt((width * height) / 900)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * channels;
      const alpha = channels === 4 ? data[index + 3] : 255;
      if (alpha < 32) continue;
      rSum += data[index];
      gSum += data[index + 1];
      bSum += data[index + 2];
      count += 1;
    }
  }

  if (count === 0) {
    return { r: 83, g: 83, b: 86 };
  }

  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

function buildSpotifyStylePaletteFromRgb(r: number, g: number, b: number): ArtworkPalette {
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.08) {
    return buildPalette("#1A1D24", "#8E9199");
  }

  const accentRgb = hslToRgb(h, clamp(s * 1.05, 0.42, 0.92), clamp(l * 1.08, 0.42, 0.62));
  const backgroundRgb = hslToRgb(h, clamp(s * 0.72, 0.22, 0.7), clamp(l * 0.34, 0.14, 0.26));

  return buildPalette(
    rgbToHex(backgroundRgb.r, backgroundRgb.g, backgroundRgb.b),
    rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b)
  );
}

function buildPaletteFromUrlHash(imageUrl: string): ArtworkPalette {
  const hash = hashString(imageUrl);
  const hue = Number.parseInt(hash.slice(0, 6), 36) % 360;
  const accentRgb = hslToRgb(hue, 0.72, 0.52);
  const backgroundRgb = hslToRgb(hue, 0.48, 0.22);
  return buildPalette(
    rgbToHex(backgroundRgb.r, backgroundRgb.g, backgroundRgb.b),
    rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b)
  );
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

  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists) {
    return localUri;
  }

  const downloaded = await FileSystem.downloadAsync(remoteUrl, localUri);
  return downloaded.uri;
}

function mapImageColorsToPalette(result: ImageColorsResult): ArtworkPalette {
  if (result.platform === "ios") {
    const accent = pickColor(result.primary, result.detail, result.secondary) ?? DEFAULT_ARTWORK_PALETTE.accent;
    const background = pickColor(result.background, result.secondary, result.primary) ?? DEFAULT_ARTWORK_PALETTE.background;
    return buildPalette(background, accent);
  }

  const accent = pickColor(
    result.vibrant,
    result.lightVibrant,
    result.dominant,
    result.platform === "android" ? result.average : undefined
  ) ?? DEFAULT_ARTWORK_PALETTE.accent;

  const background = pickColor(
    result.darkMuted,
    result.darkVibrant,
    result.muted,
    result.dominant,
    result.vibrant
  ) ?? DEFAULT_ARTWORK_PALETTE.background;

  return buildPalette(background, accent);
}

function buildPalette(background: string, accent: string): ArtworkPalette {
  const bg = normalizeHexColor(background) ?? DEFAULT_ARTWORK_PALETTE.background;
  const accentColor = normalizeHexColor(accent) ?? DEFAULT_ARTWORK_PALETTE.accent;
  return {
    background: bg,
    accent: accentColor,
    text: "#FFFFFF",
    isDark: true,
    primary: accentColor,
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

function pickColor(...candidates: Array<string | undefined | null>): string | null {
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

function getHexLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return 0;

  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHex(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

function colorWithAlpha(hex: string, alpha: number, fallback = "rgba(255,255,255,1)"): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return fallback;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}
