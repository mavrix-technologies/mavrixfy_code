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
const COLOR_CACHE_MAX_ENTRIES = 200;
const PALETTE_CACHE_VERSION = "mavrixfy-palette-v3";
const DEFAULT_FALLBACK: ColorResult = { primary: "#25282E", text: "#F5FBFF", isDark: true };

// Neutral fallback palette. If extraction is unavailable, never invent a green/blue
// background that can visibly mismatch monochrome album artwork.
const fallbackPalettes: ColorResult[] = [
  { primary: "#181B21", text: "#F5FBFF", isDark: true },
  { primary: "#20232A", text: "#F5FBFF", isDark: true },
  { primary: "#25282E", text: "#F5FBFF", isDark: true },
  { primary: "#2B2E35", text: "#F5FBFF", isDark: true },
  { primary: "#30343A", text: "#F5FBFF", isDark: true },
  { primary: "#17191F", text: "#F5FBFF", isDark: true },
];

const colorCache = new Map<string, ColorResult>();
const pendingColorRequests = new Map<string, Promise<ColorResult>>();

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

  const getter = resolveImageColorsGetter();
  if (getter) {
    try {
      const palette = await withTimeout(
        getter(cacheKey, {
          fallback: DEFAULT_FALLBACK.primary,
          cache: true,
          key: `${PALETTE_CACHE_VERSION}:${cacheKey}`,
        }),
        COLOR_EXTRACTION_TIMEOUT_MS
      );

      const primary = pickPrimaryColor(palette);
      if (primary) {
        const mappedPrimary = toneMapForCinematicDarkTheme(primary);
        const result: ColorResult = {
          primary: mappedPrimary,
          text: "#F5FBFF",
          isDark: true,
        };
        setCachedColor(cacheKey, result);
        return result;
      }
    } catch {
      // Continue to thumbhash fallback.
    }
  }

  const thumbhashPrimary = await getThumbhashAverageColor(cacheKey);
  if (thumbhashPrimary) {
    const mappedPrimary = toneMapForCinematicDarkTheme(thumbhashPrimary);
    const thumbhashResult: ColorResult = {
      primary: mappedPrimary,
      text: "#F5FBFF",
      isDark: true,
    };
    setCachedColor(cacheKey, thumbhashResult);
    return thumbhashResult;
  }

  const fallback = getStableFallbackColor(cacheKey);
  setCachedColor(cacheKey, fallback);
  return fallback;
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
  if (!cached) return DEFAULT_FALLBACK;

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

function pickPrimaryColor(palette: PlatformPalette): string | null {
  if (!palette || typeof palette !== "object") return null;

  const rawCandidates =
    palette.platform === "ios"
      ? [
          { color: palette.primary, role: "primary", priority: 0 },
          { color: palette.background, role: "background", priority: 1 },
          { color: palette.secondary, role: "secondary", priority: 2 },
          { color: palette.detail, role: "detail", priority: 3 },
        ]
      : [
          { color: palette.average, role: "average", priority: 0 },
          { color: palette.dominant, role: "dominant", priority: 1 },
          { color: palette.muted, role: "muted", priority: 2 },
          { color: palette.darkMuted, role: "darkMuted", priority: 3 },
          { color: palette.vibrant, role: "vibrant", priority: 4 },
          { color: palette.darkVibrant, role: "darkVibrant", priority: 5 },
          { color: palette.lightVibrant, role: "lightVibrant", priority: 6 },
          { color: palette.lightMuted, role: "lightMuted", priority: 7 },
        ];

  const candidates = rawCandidates
    .map((candidate) => {
      const normalized = normalizeHexColor(candidate.color);
      if (!normalized) return null;
      const { r, g, b } = toRgb(normalized);
      const hsl = rgbToHsl(r, g, b);
      return {
        ...candidate,
        normalized,
        ...hsl,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  if (candidates.length === 0) return null;

  const anchorCandidate =
    candidates.find((candidate) => candidate.role === "average") ??
    candidates.find((candidate) => candidate.role === "dominant") ??
    candidates.find((candidate) => candidate.role === "background") ??
    candidates.find((candidate) => candidate.role === "primary") ??
    null;

  if (anchorCandidate) {
    if (anchorCandidate.s <= 0.22) {
      return pickBestNeutralColor(
        candidates.filter((candidate) => candidate.s <= 0.22).length > 0
          ? candidates.filter((candidate) => candidate.s <= 0.22)
          : [anchorCandidate]
      );
    }

    if (anchorCandidate.l >= 0.1 && anchorCandidate.l <= 0.86) {
      return anchorCandidate.normalized;
    }
  }

  const neutralCandidates = candidates.filter((candidate) => candidate.s <= 0.16);
  const strongColorCandidates = candidates.filter(
    (candidate) => candidate.s >= 0.28 && candidate.l >= 0.12 && candidate.l <= 0.78
  );
  const neutralAnchor = candidates.find(
    (candidate) =>
      ["average", "dominant", "background", "primary", "muted", "darkMuted"].includes(candidate.role) &&
      candidate.s <= 0.16 &&
      candidate.l >= 0.08 &&
      candidate.l <= 0.88
  );

  if (
    neutralCandidates.length === candidates.length ||
    (neutralAnchor && neutralCandidates.length >= 3 && strongColorCandidates.length <= 1)
  ) {
    return pickBestNeutralColor(neutralCandidates.length > 0 ? neutralCandidates : candidates);
  }

  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scoreThemeCandidate(candidate.normalized) - candidate.priority * 0.015;
    if (score > bestScore) {
      best = candidate.normalized;
      bestScore = score;
    }
  }

  return best;
}

function pickBestNeutralColor(
  candidates: Array<{ normalized: string; l: number; priority: number }>
): string {
  let best = candidates[0]?.normalized ?? DEFAULT_FALLBACK.primary;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const targetLuminanceScore = 1 - Math.abs(candidate.l - 0.34) * 1.9;
    const score = targetLuminanceScore - candidate.priority * 0.02;
    if (score > bestScore) {
      best = candidate.normalized;
      bestScore = score;
    }
  }

  return best;
}

function scoreThemeCandidate(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const { s, l } = rgbToHsl(r, g, b);
  const saturationTargetScore = 1 - Math.abs(s - 0.48);
  const luminanceTargetScore = 1 - Math.abs(l - 0.38) * 1.8;
  const avoidExtremePenalty = l < 0.08 || l > 0.86 ? 0.8 : 0;
  const avoidNeonPenalty = s > 0.82 && l > 0.52 ? 0.55 : 0;
  const avoidGrayPenalty = s < 0.1 ? 0.25 : 0;
  return saturationTargetScore + luminanceTargetScore - avoidExtremePenalty - avoidNeonPenalty - avoidGrayPenalty;
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
  const fallback = fallbackPalettes[index];
  return {
    primary: toneMapForCinematicDarkTheme(fallback.primary),
    text: "#F5FBFF",
    isDark: true,
  };
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
  const fallback = fallbackPalettes[randomIndex];
  return {
    primary: toneMapForCinematicDarkTheme(fallback.primary),
    text: "#F5FBFF",
    isDark: true,
  };
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

function toneMapForCinematicDarkTheme(hex: string): string {
  const base = normalizeHexColor(hex) ?? DEFAULT_FALLBACK.primary;
  const { r, g, b } = toRgb(base);
  const { h, s, l } = rgbToHsl(r, g, b);

  const naturalSaturation = s < 0.1
    ? 0
    : s < 0.18
      ? clamp(s * 0.48, 0.02, 0.08)
      : clamp(s * 0.76, 0.22, 0.58);
  const cinematicLightness = clamp(l < 0.18 ? 0.28 : l * 0.72, 0.24, 0.42);
  const mapped = hslToRgb(h, naturalSaturation, cinematicLightness);
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

export function clearColorCache(): void {
  colorCache.clear();
}
