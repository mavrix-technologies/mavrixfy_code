import type { DimensionValue } from "react-native";

export const noopPlayerAction = () => { };
export const noopLongPress = () => { };

export function toProgressWidth(progress: number): DimensionValue {
  return `${Math.max(0, Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100))}%`;
}

export function colorToRgba(input: string | undefined, alpha: number, fallback: string): string {
  if (!input) return fallback;
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const value = input.trim();
  const hex = value.replace("#", "");

  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  const rgb = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (rgb) {
    const r = Number.parseInt(rgb[1], 10);
    const g = Number.parseInt(rgb[2], 10);
    const b = Number.parseInt(rgb[3], 10);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  return fallback;
}
