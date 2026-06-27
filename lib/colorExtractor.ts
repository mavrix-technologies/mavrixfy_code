/**
 * Extract dominant color from image URL for player gradients.
 * Uses react-native-image-colors with stable fallback colors.
 */

import { Platform } from "react-native";

let getColors: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getColors = require("react-native-image-colors").getColors;
} catch (e) {
  // Native module react-native-image-colors is not built/available in current runtime
}

interface ColorResult {
  primary: string;
  text: string;
  isDark: boolean;
}

export interface SpotifyColorTheme {
  accent: string;
  accentSoft: string;
  onAccent: string;
  border: string;
  playerGradient: [string, string, string, string];
  playlistBackdrop: [string, string, string, string, string];
}

const COLOR_CACHE_MAX_ENTRIES = 200;
const DEFAULT_FALLBACK: ColorResult = { primary: "#25282E", text: "#F5FBFF", isDark: true };

const colorCache = new Map<string, ColorResult>();
const pendingColorRequests = new Map<string, Promise<ColorResult>>();

export async function extractDominantColor(imageUrl: string): Promise<ColorResult> {
  const cacheKey = (imageUrl || "").trim();
  if (!cacheKey) return DEFAULT_FALLBACK;

  const cached = colorCache.get(cacheKey);
  if (cached) {
    colorCache.delete(cacheKey);
    colorCache.set(cacheKey, cached);
    return cached;
  }

  const pending = pendingColorRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = extractDominantColorUncached(cacheKey).finally(() => {
    pendingColorRequests.delete(cacheKey);
  });
  pendingColorRequests.set(cacheKey, request);
  return request;
}

async function extractDominantColorUncached(cacheKey: string): Promise<ColorResult> {
  try {
    if (!getColors) {
      throw new Error("react-native-image-colors is not available in the current native build.");
    }

    const result = await getColors(cacheKey, {
      fallback: "#25282E",
      cache: true,
      key: cacheKey,
    });

    let primaryColor = "#25282E";
    if (result.platform === "android") {
      primaryColor = result.dominant ?? result.vibrant ?? result.average ?? "#25282E";
    } else if (result.platform === "ios") {
      primaryColor = result.background ?? result.primary ?? "#25282E";
    } else if (result.platform === "web") {
      primaryColor = result.dominant ?? result.vibrant ?? "#25282E";
    }

    const mappedPrimary = toneMapForCinematicDarkTheme(primaryColor);
    const res: ColorResult = {
      primary: mappedPrimary,
      text: "#F5FBFF",
      isDark: true,
    };
    setCachedColor(cacheKey, res);
    return res;
  } catch (error) {
    const fallback = getStableFallbackColor(cacheKey);
    setCachedColor(cacheKey, fallback);
    return fallback;
  }
}

export function preloadDominantColors(imageUrls: Array<string | null | undefined>): void {
  for (const rawUrl of imageUrls) {
    const url = rawUrl?.trim();
    if (!url || colorCache.has(url) || pendingColorRequests.has(url)) continue;
    void extractDominantColor(url).catch(() => {});
  }
}

export function getImmediateArtworkColor(imageUrl: string | null | undefined): ColorResult {
  const cacheKey = (imageUrl || "").trim();
  if (!cacheKey) return DEFAULT_FALLBACK;

  const cached = colorCache.get(cacheKey);
  if (!cached) {
    return getStableFallbackColor(cacheKey);
  }

  colorCache.delete(cacheKey);
  colorCache.set(cacheKey, cached);
  return cached;
}

function setCachedColor(key: string, value: ColorResult): void {
  colorCache.set(key, value);

  while (colorCache.size > COLOR_CACHE_MAX_ENTRIES) {
    const oldestKey = colorCache.keys().next().value;
    if (!oldestKey) break;
    colorCache.delete(oldestKey);
  }
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (!color) return null;

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

  return (0.299 * r) + (0.587 * g) + (0.114 * b);
}

function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHex(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getStableFallbackColor(imageUrl: string): ColorResult {
  if (!imageUrl) return DEFAULT_FALLBACK;
  const hash = stableHash(imageUrl);
  const h = hash % 360;
  const s = 0.82;
  const l = 0.52;
  const rgb = hslToRgb(h, s, l);
  const primaryColor = rgbToHex(rgb.r, rgb.g, rgb.b);
  return {
    primary: primaryColor,
    text: "#F5FBFF",
    isDark: true,
  };
}

function colorWithAlpha(hex: string, alpha: number, fallback = "rgba(255,255,255,1)"): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return fallback;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = clamp(alpha, 0, 1);
  return `rgba(${r},${g},${b},${safeAlpha})`;
}

function toRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_FALLBACK.primary;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
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

function toneMapForCinematicDarkTheme(hex: string): string {
  const base = normalizeHexColor(hex) ?? DEFAULT_FALLBACK.primary;
  const { r, g, b } = toRgb(base);
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.12) {
    return "#2B303B";
  }

  // Pure candy color boost (no custom hue shifting)
  const candyS = clamp(s * 1.15, 0.55, 0.95);
  const candyL = clamp(l * 1.1, 0.42, 0.65);
  const mapped = hslToRgb(h, candyS, candyL);
  return rgbToHex(mapped.r, mapped.g, mapped.b);
}

export function createSpotifyColorTheme(baseHex: string): SpotifyColorTheme {
  const base = toneMapForCinematicDarkTheme(baseHex);
  const { r, g, b } = toRgb(base);
  const { h, s, l } = rgbToHsl(r, g, b);

  const isNeutral = s < 0.1;
  const accentS = isNeutral ? 0 : clamp(s * 0.95, 0.22, 0.62);
  const accentL = clamp(l, 0.26, 0.44);
  const softS = isNeutral ? 0 : clamp(s * 0.58, 0.14, 0.42);
  const softL = clamp(accentL * 0.76, 0.18, 0.32);

  const accentRgb = hslToRgb(h, accentS, accentL);
  const softRgb = hslToRgb(h, softS, softL);
  const accent = rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b);
  const accentSoft = rgbToHex(softRgb.r, softRgb.g, softRgb.b);
  const onAccent = getHexLuminance(accent) > 0.55 ? "#0B141A" : "#F5FBFF";
  const border = getHexLuminance(accent) > 0.55 ? "rgba(11,20,26,0.24)" : "rgba(255,255,255,0.3)";

  return {
    accent,
    accentSoft,
    onAccent,
    border,
    playerGradient: [
      colorWithAlpha(accent, 0.88, "rgba(31,122,224,0.88)"),
      colorWithAlpha(accentSoft, 0.54, "rgba(26,36,48,0.54)"),
      "rgba(11,15,22,0.98)",
      "#06090F",
    ],
    playlistBackdrop: [
      colorWithAlpha(accent, 0.96, "rgba(31,122,224,0.96)"),
      colorWithAlpha(accentSoft, 0.74, "rgba(22,158,220,0.74)"),
      colorWithAlpha(accentSoft, 0.44, "rgba(22,158,220,0.44)"),
      "rgba(12,18,28,0.58)",
      "rgba(16,20,26,0)",
    ],
  };
}
