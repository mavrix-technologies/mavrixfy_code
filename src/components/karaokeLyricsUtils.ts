/**
 * Convert accent color or image palette to the signature Spotify lyrics card/screen background hue.
 */
export function getSpotifyLyricsBg(accentColor?: string, songFallbackSeed?: string): string {
  let hex = (accentColor || "").replace("#", "").trim();

  // If no valid accent color or default fallback (#0E1016 / #000000 / #16181D), derive distinct hue from song seed
  if (hex.length !== 6 || hex === "0E1016" || hex === "000000" || hex === "16181D" || hex === "181A20") {
    if (!songFallbackSeed) return "#24527A";
    let hash = 0;
    for (let i = 0; i < songFallbackSeed.length; i++) {
      hash = songFallbackSeed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360) / 360;
    const s = 0.55;
    const l = 0.32;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (pVal: number, qVal: number, tVal: number) => {
      let t = tVal;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
      if (t < 1 / 2) return qVal;
      if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
      return pVal;
    };
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
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

  // Saturated rich slate tone (lightness 0.28-0.36, saturation 0.45-0.65)
  const targetL = Math.max(0.26, Math.min(0.36, l < 0.15 ? 0.30 : l > 0.65 ? 0.32 : l));
  const targetS = Math.max(0.45, Math.min(0.70, s < 0.2 ? 0.50 : s));

  const hue2rgb = (pVal: number, qVal: number, tVal: number) => {
    let t = tVal;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
    if (t < 1 / 2) return qVal;
    if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
    return pVal;
  };
  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const red = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const green = Math.round(hue2rgb(p, q, h) * 255);
  const blue = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}
