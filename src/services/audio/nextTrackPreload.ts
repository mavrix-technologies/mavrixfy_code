import * as FileSystem from "expo-file-system/legacy";

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 25_000;
type Prepared = { key: string; uri: string; size: number };
let ready: Prepared | null = null;
let active: Prepared | null = null;
let pending: { key: string; cancel: () => void } | null = null;
let revision = 0;
let initialized: Promise<void> | null = null;
const directory = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}next-track-buffer/` : null;
const remove = (uri: string) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
const sourceKey = (url: string, headers?: Record<string, string>) => JSON.stringify([
  url, Object.entries(headers || {}).sort(([a], [b]) => a.localeCompare(b)),
]);

/** A single complete next-track file, plus the currently consumed file. No decoder or audio focus. */
export async function prepareNextAudio(url: string, headers?: Record<string, string>): Promise<void> {
  if (!directory || !/^https?:\/\//i.test(url) || /\.m3u8(?:[?#]|$)/i.test(url)) return;
  const key = sourceKey(url, headers);
  if (ready?.key === key || pending?.key === key || active?.key === key) return;
  const request = ++revision;
  pending?.cancel();
  pending = null;
  if (ready) { void remove(ready.uri); ready = null; }
  if (!initialized) initialized = (async () => {
    // Clear orphaned buffers from a previous process; none is leased yet.
    await remove(directory);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  })();
  try { await initialized; } catch { initialized = null; return; }
  if (request !== revision) return;
  let uri = `${directory}${Date.now()}-${request}.download`;
  let cancelled = false;
  let task: ReturnType<typeof FileSystem.createDownloadResumable>;
  const cancel = () => {
    cancelled = true;
    void task.cancelAsync().catch(() => {});
  };
  task = FileSystem.createDownloadResumable(url, uri, { headers }, progress => {
    if (progress.totalBytesWritten > MAX_BYTES || progress.totalBytesExpectedToWrite > MAX_BYTES) cancel();
  });
  pending = { key, cancel };
  const timeout = setTimeout(cancel, TIMEOUT_MS);
  try {
    const result = await task.downloadAsync();
    if (cancelled || request !== revision || result?.status !== 200) return;
    const info = await FileSystem.getInfoAsync(uri);
    const contentType = Object.entries(result.headers || {}).find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";
    const length = Number(Object.entries(result.headers || {}).find(([name]) => name.toLowerCase() === "content-length")?.[1]);
    if (request !== revision || !info.exists || info.isDirectory || info.size <= 0 || info.size > MAX_BYTES ||
      /text\/html|application\/json/i.test(contentType) || (length > 0 && info.size !== length)) return;
    // AVPlayer receives a local URL without the response's Content-Type.
    // Keep the actual container extension instead of an unrecognized .audio.
    const mime = contentType.split(";")[0].trim().toLowerCase();
    const extension = ({ "audio/mp4": "m4a", "video/mp4": "mp4", "audio/x-m4a": "m4a", "audio/mpeg": "mp3",
      "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/ogg": "ogg", "audio/webm": "webm" } as Record<string, string>)[mime]
      || /\.(m4a|mp4|mp3|aac|wav|flac|ogg|opus|webm)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
    // Unknown responses are optional preloads, never trusted playback files.
    if (!extension) return;
    const playableUri = uri.replace(/\.download$/, `.${extension}`);
    await FileSystem.moveAsync({ from: uri, to: playableUri });
    uri = playableUri;
    if (request !== revision) return;
    ready = { key, uri, size: info.size };
  } catch {
    // Prefetch is optional. The selected source still uses its normal resolver.
  } finally {
    clearTimeout(timeout);
    if (request === revision) pending = null;
    if (ready?.uri !== uri) await remove(uri);
  }
}

export async function takePreparedAudio(url: string, headers?: Record<string, string>, isCurrent = () => true): Promise<string | null> {
  const candidate = ready;
  if (!candidate || candidate.key !== sourceKey(url, headers)) return null;
  // Cache files can be evicted by the OS between prefetch and selection.
  const info = await FileSystem.getInfoAsync(candidate.uri).catch(() => null);
  if (ready !== candidate || !isCurrent()) return null;
  if (!info?.exists || info.isDirectory || info.size !== candidate.size) {
    ready = null; void remove(candidate.uri); return null;
  }
  releasePreparedAudio();
  active = candidate;
  ready = null;
  return active.uri;
}

export function releasePreparedAudio(): void {
  if (active) { void remove(active.uri); active = null; }
}

export function clearPreparedAudio(): void {
  revision++;
  pending?.cancel(); pending = null;
  if (ready) { void remove(ready.uri); ready = null; }
  releasePreparedAudio();
}
