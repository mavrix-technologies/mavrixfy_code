/** Preserve animation while avoiding full-size GIF decoding on Cloudinary assets. */
export function getFestivalArtworkUrl(source: string, pixelWidth: number): string {
  try {
    const url = new URL(source);
    // Only unsigned, untransformed upload URLs can safely accept transformations.
    if (url.hostname !== "res.cloudinary.com" || url.search ||
      !/^\/[^/]+\/image\/upload\/v\d+\/.+\.gif$/i.test(url.pathname)) return source;
    const width = Math.ceil(Math.max(1, pixelWidth) / 64) * 64;
    url.pathname = url.pathname.replace("/image/upload/", `/image/upload/c_limit,w_${width},f_webp,fl_awebp,q_90/`);
    return url.toString();
  } catch {
    return source;
  }
}
