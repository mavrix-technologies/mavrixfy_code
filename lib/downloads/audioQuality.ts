/**
 * Audio Quality — Utilities for quality-based audio URL selection
 */

import { DownloadQuality } from "@/types/downloads";

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

/**
 * Attempt to construct a quality-specific audio URL
 * JioSaavn URLs follow patterns like:
 * - .../320/...
 * - .../128/...
 * - .../48/...
 */
export function getAudioUrlByQuality(baseUrl: string, quality: DownloadQuality): string {
  if (!baseUrl || typeof baseUrl !== "string") {
    return baseUrl;
  }

  const targetBitrate = qualityToBitrate(quality);
  const bitrateNum = targetBitrate.replace("kbps", "");

  // Try to replace bitrate patterns in URL
  // Pattern 1: /320/ or /128/ or /96/ etc
  const withSlashes = baseUrl.replace(/\/(?:320|256|192|160|128|96|64|48|32)\//g, `/${bitrateNum}/`);
  if (withSlashes !== baseUrl) {
    return withSlashes;
  }

  // Pattern 2: _320 or _128 etc in filename
  const withUnderscore = baseUrl.replace(/_(?:320|256|192|160|128|96|64|48|32)(?=\.|_|$)/g, `_${bitrateNum}`);
  if (withUnderscore !== baseUrl) {
    return withUnderscore;
  }

  // Pattern 3: -320 or -128 etc
  const withDash = baseUrl.replace(/-(?:320|256|192|160|128|96|64|48|32)(?=\.|_|$|-)/g, `-${bitrateNum}`);
  if (withDash !== baseUrl) {
    return withDash;
  }

  // If no pattern matched, return original URL
  // (it's likely already the best quality)
  return baseUrl;
}

/**
 * Get the bitrate for a download quality for UI display
 */
function getQualityLabel(quality: DownloadQuality): string {
  switch (quality) {
    case "low":
      return "~48 kbps";
    case "medium":
      return "~128 kbps";
    case "high":
    default:
      return "~320 kbps";
  }
}
