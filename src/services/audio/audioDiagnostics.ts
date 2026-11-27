/** Never expose signed media URLs or infer quality from a catalog provider. */
export function audioSourceLabel(url?: string): string {
  if (!url) return "Unknown";
  if (/^(?:file|content):\/\/|^\//i.test(url)) return "Local file";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "googlevideo.com" || host.endsWith(".googlevideo.com")) return "YouTube";
    if (host === "saavncdn.com" || host.endsWith(".saavncdn.com")) return "JioSaavn";
    // Unrecognized hosts remain unknown; metadata alone cannot authenticate origin.
    return "Other / unverified";
  } catch { return "Unknown"; }
}

export function audioBitrateLabel(bitsPerSecond?: number): string {
  return typeof bitsPerSecond === "number" && Number.isFinite(bitsPerSecond) && bitsPerSecond > 0
    ? `${Math.round(bitsPerSecond / 1000)} kbps` : "Unknown";
}

export function downloadAudioLabel(item?: { audioBitrate?: number; audioCodec?: string }): string {
  const bitrate = audioBitrateLabel(item?.audioBitrate);
  const codec = item?.audioCodec?.trim().toUpperCase();
  return [bitrate === "Unknown" ? "Quality unknown" : bitrate, codec].filter(Boolean).join(" · ");
}
