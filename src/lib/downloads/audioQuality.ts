/**
 * Audio Quality — Utilities for quality-based audio URL selection
 */

import { type DownloadQuality } from "@/types/downloads";

/**
 * Map download quality preference to audio bitrate
 */
function qualityToBitrate(quality: DownloadQuality): string {
  switch (quality) {
    case "low":
      return "48kbps";
    case "medium":
      return "128kbps";
    case "high":
    default:
      return "320kbps";
  }
}

const JIOSAAVN_HOST_SUFFIXES = ["saavncdn.com", "saavn.com", "jiosaavn.com"] as const;

/**
 * Attempt to construct a quality-specific audio URL
 * JioSaavn CDN URLs encode the bitrate in the filename, e.g.:
 * - https://aac.saavncdn.com/<hash>/<bitrate>_<hash>.mp4
 * - https://preview.saavncdn.com/<hash>/<bitrate>_<hash>.mp4
 * Legacy responses may also embed /<bitrate>/ as a path segment.
 */
export function getAudioUrlByQuality(baseUrl: string, quality: DownloadQuality): string {
  if (!baseUrl || typeof baseUrl !== "string") {
    return baseUrl;
  }

  // Only the provider's own audio paths have a known bitrate convention.
  // Preserve unrelated source URLs and signed query parameters byte for byte.
  try {
    const { hostname, protocol } = new URL(baseUrl);
    if (!/^https?:$/.test(protocol) || !JIOSAAVN_HOST_SUFFIXES.some((h) => hostname === h || hostname.endsWith(`.${h}`))) return baseUrl;
  } catch {
    return baseUrl;
  }
  const parts = baseUrl.match(/^(https?:\/\/[^/?#]+)([^?#]*)(.*)$/i);
  if (!parts) return baseUrl;
  const bitrateNum = qualityToBitrate(quality).replace("kbps", "");
  const path = parts[2]
    .replace(/\/(?:320|256|192|160|128|96|64|48|32)\//g, `/${bitrateNum}/`)
    .replace(/_(?:320|256|192|160|128|96|64|48|32)(?=\.|_|$)/g, `_${bitrateNum}`)
    .replace(/-(?:320|256|192|160|128|96|64|48|32)(?=\.|_|$|-)/g, `-${bitrateNum}`);
  return `${parts[1]}${path}${parts[3]}`;
}
