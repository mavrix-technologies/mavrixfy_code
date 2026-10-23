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
  const target = Math.min(1200, Math.max(96, Math.ceil(Number.isFinite(pixels) ? pixels : 1200)));
  // Signed query strings and unrelated '=...' tokens are deliberately untouched.
  const queryStart = url.search(/[?#]/);
  const base = queryStart < 0 ? url : url.slice(0, queryStart);
  const suffix = queryStart < 0 ? "" : url.slice(queryStart);
  return base.replace(/=(?:w(\d+)-h(\d+)|s\d+)(?=[-]|$)/i, (match, width, height) => {
    if (!width) return `=s${target}`;
    if (Number(width) <= 0 || Number(height) <= 0) return match;
    // Resize proportionally; forcing a rectangular source to square distorts it.
    const scale = Math.min(target / Math.min(Number(width), Number(height)), 2048 / Math.max(Number(width), Number(height)));
    return `=w${Math.round(Number(width) * scale)}-h${Math.round(Number(height) * scale)}`;
  }) + suffix;
}

/** Only resize the documented filename variants on the provider's own CDN. */
export function saavnArtworkUrl(raw: string, pixels = 500): string {
  const url = raw.trim().replace(/^\/\//, "https://");
  if (!/^https?:\/\/(?:[\w-]+\.)*saavncdn\.com\//i.test(url)) return url;
  const secure = url.replace(/^http:/i, "https:");
  // Do not modify signed URLs or guess a resolution that the CDN does not offer.
  if (/[?#]/.test(secure)) return secure;
  const size = pixels <= 150 ? 150 : 500;
  return secure.replace(/([_-])(?:50|150|500)x(?:50|150|500)(?=\.(?:jpe?g|png|webp)$)/i, `$1${size}x${size}`);
}

/** One finite source order shared by rendering, previews and prefetching. */
export function artworkCandidates(raw: string | undefined, pixels: number): string[] {
  const url = raw?.trim().replace(/^\/\//, "https://") || "";
  if (!url) return [];
  const video = url.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/[^/?]+/i);
  if (video) {
    const base = `https://i.ytimg.com/vi/${video[1]}/`;
    // A signed Music crop is the authentic cover. Preserve it, including its query.
    const primary = /[?&]sqp=/.test(url) ? url : `${base}${pixels > 180 ? "maxresdefault" : "mqdefault"}.jpg`;
    const tiers = pixels > 180 || /[?&]sqp=/.test(url)
      ? ["maxresdefault", "sddefault", "hqdefault", "mqdefault"] : ["mqdefault", "hqdefault"];
    return [...new Set([primary, ...tiers.map(tier => `${base}${tier}.jpg`), url])];
  }

  // Handle Spotify mosaic image composite URLs (mosaic.scdn.co/640/<hash1><hash2>...)
  // Dynamically extract the track artwork hashes contained directly within the mosaic URL
  const mosaic = url.match(/^https?:\/\/mosaic\.scdn\.co\/\d+\/([a-f0-9]{40})/i);
  if (mosaic && mosaic[1]) {
    const hash = mosaic[1];
    const hqHash = hash.replace(/^ab67616d00001e02/, "ab67616d0000b273");
    return [
      `https://i.scdn.co/image/${hqHash}`,
      `https://i.scdn.co/image/${hash}`,
      url,
    ];
  }
  // Handle Spotify pickasso images (prefer 640x640 'cafe' variant, then original)
  if (/^https?:\/\/pickasso\.spotifycdn\.com/i.test(url)) {
    const highRes = url.replace(/ab67c0de0000(?:deef|bada|f00d)/, "ab67c0de0000cafe");
    return highRes !== url ? [highRes, url] : [url];
  }
  // Handle standard Spotify CDN
  if (/^https?:\/\/([a-z0-9-]+\.)*(?:scdn\.co|spotifycdn\.com)/i.test(url)) {
    return [url];
  }
  const primary = saavnArtworkUrl(youTubeArtworkUrl(url, pixels), pixels);
  const candidates = [primary];
  if (primary !== youTubeArtworkUrl(url, pixels)) candidates.push(saavnArtworkUrl(url, 150));
  for (const size of [512, 256, 128]) candidates.push(youTubeArtworkUrl(url, Math.min(pixels, size)));
  candidates.push(url);
  return [...new Set(candidates)];
}

export function youTubeDisplayArtworkUrl(raw: string | undefined, pixels: number): string {
  return artworkCandidates(raw, pixels)[0] || "";
}

export function artworkPixelSize(layoutSize: number, density: number): number {
  const needed = (Number.isFinite(layoutSize) ? Math.max(1, layoutSize) : 1)
    * (Number.isFinite(density) ? Math.max(1, density) : 1);
  // Reuse a bounded set of cache variants without jumping from a tiny cover
  // to a 512px download. Every selected size still covers its physical pixels.
  return [96, 128, 192, 256, 320, 384, 512, 640, 768, 960, 1200]
    .find(size => size >= needed) || 1200;
}

/** Keep the artwork crop while limiting color analysis to a small image. */
export function artworkAnalysisUrl(raw: string): string {
  const video = raw.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/[^/?]+/i);
  if (video && !/[?&]sqp=/.test(raw)) return `https://i.ytimg.com/vi/${video[1]}/mqdefault.jpg`;
  return youTubeArtworkUrl(raw, 512);
}
