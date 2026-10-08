/** Choose the best available resolution within the user's bandwidth ceiling. */
export function selectVideoFormats<T extends { height?: number; bitrate: number }>(formats: T[], quality: string): T[] {
  const ceiling = quality === "low" ? 360 : quality === "medium" ? 480 : quality === "high" ? Infinity : 720;
  const valid = formats.filter(format => Number.isFinite(format.height) && (format.height || 0) > 0);
  const within = valid.filter(format => format.height! <= ceiling);
  if (!within.length) throw new Error("No video stream within the selected quality limit");
  return within.sort((a, b) => b.height! - a.height! || (quality === "high" ? b.bitrate - a.bitrate : a.bitrate - b.bitrate));
}
