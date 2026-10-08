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

/** Song covers prefer real square artwork over a larger landscape video still. */
export function bestYouTubeSongThumbnail(thumbnails: readonly Thumbnail[] | undefined): string {
  const square = thumbnails?.filter(item => item.width && item.height && Math.abs(item.width / item.height - 1) <= 0.05);
  return bestYouTubeThumbnail(square?.length ? square : thumbnails);
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
  // Music can supply an already cropped video thumbnail through sqp. Keep its
  // original transform instead of replacing it with an uncropped video still.
  if (video && /[?&]sqp=/.test(raw!)) return raw!;
  // High thumbnails are 4:3 and can contain letterbox padding. Keep the
  // widescreen master for cards/player covers; native decoding fits the view.
  return video ? `https://i.ytimg.com/vi/${video[1]}/${pixels > 192 ? "maxresdefault" : "mqdefault"}.jpg` : youTubeArtworkUrl(raw, pixels);
}

export function youTubeArtworkFallbackUrl(raw: string | undefined): string {
  const video = raw?.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/[^/?]+/i);
  if (video) return `https://i.ytimg.com/vi/${video[1]}/mqdefault.jpg`;
  return youTubeArtworkUrl(raw, 512);
}

export function artworkPixelSize(layoutSize: number, density: number): number {
  const needed = (Number.isFinite(layoutSize) ? Math.max(1, layoutSize) : 1)
    * (Number.isFinite(density) ? Math.max(1, density) : 1);
  // Reuse a bounded set of cache variants without jumping from a tiny cover
  // to a 512px download. Every selected size still covers its physical pixels.
  return [96, 128, 192, 256, 320, 384, 512, 640, 768, 960, 1200]
    .find(size => size >= needed) || 1200;
}

/** Small color-analysis input only; displayed/persisted artwork keeps its full quality. */
export function artworkAnalysisUrl(raw: string): string {
  const video = raw.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/[^/?]+/i);
  if (video) return `https://i.ytimg.com/vi/${video[1]}/mqdefault.jpg`;
  const host = raw.match(/^https?:\/\/([^/]+)/i)?.[1]?.toLowerCase();
  if (host && (host === "saavncdn.com" || host.endsWith(".saavncdn.com"))) {
    return raw.replace(/-(?:50|150|500)x(?:50|150|500)(\.[a-z]+)(?=[?#]|$)/i, "-150x150$1");
  }
  return youTubeArtworkUrl(raw, 128);
}
