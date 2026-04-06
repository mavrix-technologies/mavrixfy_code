/**
 * Extract dominant color from image URL for player gradients.
 * Uses react-native-image-colors (platform-native palette extraction)
 * with stable fallback colors when native module is unavailable.
 */

import { Platform } from "react-native";
import { Image as ExpoImage } from "expo-image";

type IOSPalette = {
  platform: "ios";
  primary?: string;
  background?: string;
  secondary?: string;
  detail?: string;
};

type AndroidOrWebPalette = {
  platform: "android" | "web";
  dominant?: string;
  vibrant?: string;
  muted?: string;
  darkVibrant?: string;
  lightVibrant?: string;
  darkMuted?: string;
  lightMuted?: string;
  average?: string;
};

type PlatformPalette = IOSPalette | AndroidOrWebPalette;

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

const COLOR_EXTRACTION_TIMEOUT_MS = 1400;
const DEFAULT_FALLBACK: ColorResult = { primary: "#1F7AE0", text: "#F5FBFF", isDark: true };

// Fallback brand-aware palette (blue/cyan/green family)
const fallbackPalettes: ColorResult[] = [
  { primary: "#1F7AE0", text: "#F5FBFF", isDark: true },
  { primary: "#169EDC", text: "#F5FBFF", isDark: true },
  { primary: "#18B8D6", text: "#F5FBFF", isDark: true },
  { primary: "#21CFA6", text: "#F5FBFF", isDark: true },
  { primary: "#4BD768", text: "#0B141A", isDark: false },
  { primary: "#2F6ED9", text: "#F5FBFF", isDark: true },
];

const colorCache = new Map<string, ColorResult>();

let getColorsFn: ((uri: string, config?: any) => Promise<PlatformPalette>) | null = null;
let imageColorsLoadAttempted = false;

function hasImageColorsNativeModule(): boolean {
  if (Platform.OS === "web") return true;
  try {
    const expoCore = require("expo-modules-core");
    const nativeProxy = expoCore?.NativeModulesProxy;
    const expoGlobalModules = (globalThis as any)?.expo?.modules;
    return Boolean(nativeProxy?.ImageColors || expoGlobalModules?.ImageColors);
  } catch {
    return false;
  }
}

function resolveImageColorsGetter() {
  if (imageColorsLoadAttempted) return getColorsFn;
  imageColorsLoadAttempted = true;

  // Expo Go doesn't ship the ImageColors native module.
  // Skip require to avoid runtime crash: "Cannot find native module 'ImageColors'".
  if (!hasImageColorsNativeModule()) {
    getColorsFn = null;
    return getColorsFn;
  }

  try {
    const mod = require("react-native-image-colors");
    getColorsFn = mod?.getColors ?? mod?.default?.getColors ?? null;
  } catch {
    getColorsFn = null;
  }

  return getColorsFn;
}

export async function extractDominantColor(imageUrl: string): Promise<ColorResult> {
  const cacheKey = (imageUrl || "").trim();
  if (!cacheKey) return DEFAULT_FALLBACK;

  const cached = colorCache.get(cacheKey);
  if (cached) return cached;

  const getter = resolveImageColorsGetter();
  if (getter) {
    try {
      const palette = await withTimeout(
        getter(cacheKey, {
          fallback: DEFAULT_FALLBACK.primary,
          cache: true,
          key: cacheKey,
        }),
        COLOR_EXTRACTION_TIMEOUT_MS
      );

      const primary = pickPrimaryColor(palette);
      if (primary) {
        const isDark = getHexLuminance(primary) < 0.5;
        const result: ColorResult = {
          primary,
          text: isDark ? "#F5FBFF" : "#0B141A",
          isDark,
        };
        colorCache.set(cacheKey, result);
        return result;
      }
    } catch {
      // Continue to thumbhash fallback.
    }
  }

  const thumbhashPrimary = await getThumbhashAverageColor(cacheKey);
  if (thumbhashPrimary) {
    const isDark = getHexLuminance(thumbhashPrimary) < 0.5;
    const thumbhashResult: ColorResult = {
      primary: thumbhashPrimary,
      text: isDark ? "#F5FBFF" : "#0B141A",
      isDark,
    };
    colorCache.set(cacheKey, thumbhashResult);
    return thumbhashResult;
  }

  const fallback = getStableFallbackColor(cacheKey);
  colorCache.set(cacheKey, fallback);
  return fallback;
}

function pickPrimaryColor(palette: PlatformPalette): string | null {
  if (!palette || typeof palette !== "object") return null;

  const candidates =
    palette.platform === "ios"
      ? [palette.primary, palette.detail, palette.secondary, palette.background]
      : [
          palette.dominant,
          palette.vibrant,
          palette.average,
          palette.muted,
          palette.darkVibrant,
          palette.darkMuted,
          palette.lightVibrant,
          palette.lightMuted,
        ];

  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (!normalized) continue;

    const score = scoreThemeCandidate(normalized);
    if (score > bestScore) {
      best = normalized;
      bestScore = score;
    }
  }

  return best;
}

function scoreThemeCandidate(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const { s, l } = rgbToHsl(r, g, b);
  const satScore = s * 1.25;
  const lMidScore = 1 - Math.abs(l - 0.52);
  const avoidExtremePenalty = l < 0.09 || l > 0.91 ? 0.45 : 0;
  const avoidGrayPenalty = s < 0.12 ? 0.35 : 0;
  return satScore + lMidScore - avoidExtremePenalty - avoidGrayPenalty;
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Color extraction timeout")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
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
  const index = stableHash(imageUrl) % fallbackPalettes.length;
  return fallbackPalettes[index];
}

async function getThumbhashAverageColor(imageUrl: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!imageUrl) return null;
  if (typeof ExpoImage?.generateThumbhashAsync !== "function") return null;

  try {
    const rawThumbhash = await withTimeout(
      ExpoImage.generateThumbhashAsync(imageUrl),
      COLOR_EXTRACTION_TIMEOUT_MS
    );
    if (!rawThumbhash || typeof rawThumbhash !== "string") return null;
    return thumbhashStringToAverageHex(rawThumbhash);
  } catch {
    return null;
  }
}

function thumbhashStringToAverageHex(raw: string): string | null {
  const payload = normalizeThumbhashPayload(raw);
  if (!payload) return null;

  const hash = decodeBase64ToBytes(payload);
  if (!hash || hash.length < 5) return null;

  const avg = thumbHashToAverageRGBA(hash);
  const r = Math.round(avg.r * 255);
  const g = Math.round(avg.g * 255);
  const b = Math.round(avg.b * 255);
  return rgbToHex(r, g, b);
}

function normalizeThumbhashPayload(value: string): string {
  const base = value
    .trim()
    .replace(/^thumbhash:\//i, "")
    .replace(/\\/g, "/")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = base.length % 4;
  if (pad === 0) return base;
  return `${base}${"=".repeat(4 - pad)}`;
}

function decodeBase64ToBytes(base64: string): Uint8Array | null {
  try {
    if (typeof atob === "function") {
      const binary = atob(base64);
      return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    }
  } catch {
    // Try Buffer fallback below.
  }

  try {
    const bufferCtor = (globalThis as any)?.Buffer;
    if (bufferCtor?.from) {
      const buffer = bufferCtor.from(base64, "base64");
      return new Uint8Array(buffer);
    }
  } catch {
    // No-op.
  }

  return null;
}

function thumbHashToAverageRGBA(hash: Uint8Array): { r: number; g: number; b: number; a: number } {
  const header = hash[0] | (hash[1] << 8) | (hash[2] << 16);
  const l = (header & 63) / 63;
  const p = ((header >> 6) & 63) / 31.5 - 1;
  const q = ((header >> 12) & 63) / 31.5 - 1;
  const hasAlpha = header >> 23;
  const a = hasAlpha ? (hash[5] & 15) / 15 : 1;
  const b = l - (2 / 3) * p;
  const r = (3 * l - b + q) / 2;
  const g = r - q;

  return {
    r: clamp(r, 0, 1),
    g: clamp(g, 0, 1),
    b: clamp(b, 0, 1),
    a: clamp(a, 0, 1),
  };
}

export function getRandomMusicColor(): ColorResult {
  const randomIndex = Math.floor(Math.random() * fallbackPalettes.length);
  return fallbackPalettes[randomIndex];
}

export function colorWithAlpha(hex: string, alpha: number, fallback = "rgba(255,255,255,1)"): string {
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

export function createSpotifyColorTheme(baseHex: string): SpotifyColorTheme {
  const base = normalizeHexColor(baseHex) ?? DEFAULT_FALLBACK.primary;
  const { r, g, b } = toRgb(base);
  const { h, s, l } = rgbToHsl(r, g, b);

  const accentS = clamp(Math.max(0.42, s * 1.05), 0.42, 0.86);
  const accentL = clamp(Math.max(0.34, l), 0.34, 0.56);
  const softS = clamp(Math.max(0.26, s * 0.78), 0.26, 0.62);
  const softL = clamp(accentL * 0.82, 0.24, 0.46);

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
      "#040912",
      colorWithAlpha(accentSoft, 0.62, "rgba(26,36,48,0.62)"),
      colorWithAlpha(accent, 0.28, "rgba(31,122,224,0.28)"),
      "#040912",
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

export function clearColorCache(): void {
  colorCache.clear();
}
