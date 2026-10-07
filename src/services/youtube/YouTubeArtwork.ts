interface Thumbnail { url: string; width?: number; height?: number }

/** The parser sorts largest first; never rely on array position or mutate it. */
export function bestYouTubeThumbnail(thumbnails: readonly Thumbnail[] | undefined): string {
  let best = "", area = -1;
  for (const item of thumbnails || []) {
    if (!item.url) continue;
    const size = (item.width || 0) * (item.height || item.width || 0);
    if (size > area) { best = item.url; area = size; }
  }
  return best;
}

/** Resize only known Google image transformations, preserving crop flags/query. */
export function youTubeArtworkUrl(raw: string | undefined, pixels = 1200): string {
  const url = raw?.trim().replace(/^\/\//, "https://") || "";
  if (!url) return "";
  const host = url.match(/^https?:\/\/([^/]+)/i)?.[1]?.toLowerCase();
  if (!host || !["googleusercontent.com", "ggpht.com"].some(domain => host === domain || host.endsWith(`.${domain}`))) return url;
  const target = Math.min(1200, Math.max(96, Math.ceil(pixels)));
  // Signed query strings and unrelated '=...' tokens are deliberately untouched.
  const queryStart = url.search(/[?#]/);
  const base = queryStart < 0 ? url : url.slice(0, queryStart);
  const suffix = queryStart < 0 ? "" : url.slice(queryStart);
  return base.replace(/=(?:w\d+-h\d+|s\d+)(?=[-]|$)/i, match =>
    match.startsWith("=s") ? `=s${target}` : `=w${target}-h${target}`) + suffix;
}

/** Optional video masters belong to the view, never to persisted song metadata. */
export function youTubeDisplayArtworkUrl(raw: string | undefined, pixels: number): string {
  const video = raw?.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/[^/?]+/i);
  return video ? `https://i.ytimg.com/vi/${video[1]}/${pixels > 320 ? "maxresdefault" : "hqdefault"}.jpg` : youTubeArtworkUrl(raw, pixels);
}

export function youTubeArtworkFallbackUrl(raw: string | undefined): string {
  const video = raw?.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/[^/?]+/i);
  if (video) return raw!.includes("/maxresdefault.") ? `https://i.ytimg.com/vi/${video[1]}/hqdefault.jpg` : raw!;
  return youTubeArtworkUrl(raw, 512);
}

export function artworkPixelSize(layoutSize: number, density: number): number {
  const needed = Math.max(1, layoutSize) * Math.max(1, density);
  return [192, 512, 768, 1200].find(size => size >= needed) || 1200;
}
