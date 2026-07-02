/**
 * Piped API service for YouTube playback metadata and audio stream URLs.
 *
 * Piped endpoints do not need app-side YouTube auth tokens, but the returned
 * stream URLs are still transient and instance-dependent. Resolve them fresh
 * at playback time and keep the backend resolver as a fallback.
 */

import { logger } from "@/lib/logger";

// ─── Public Piped Instances ──────────────────────────────────────────────────

/**
 * Bundled public API instances, ordered with currently healthy monitored hosts first.
 * Runtime refresh uses TeamPiped's instances-api first, then the public markdown list.
 */
const STATIC_PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi-libre.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc",
] as const;

const PIPED_INSTANCE_LIST_URL =
  "https://raw.githubusercontent.com/TeamPiped/Documentation/main/content/docs/public-instances/index.md";
const PIPED_MONITORED_INSTANCES_URL = "https://piped-instances.kavin.rocks/";
const INSTANCE_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const INSTANCE_REFRESH_TIMEOUT_MS = 3500;
const FIRST_REFRESH_WAIT_MS = 1200;
const REQUEST_TIMEOUT_MS = 4500;
const MAX_PIPED_INSTANCE_ATTEMPTS = 3;

let currentInstanceIndex = 0;
let activePipedInstances: string[] = [...STATIC_PIPED_INSTANCES];
let lastInstanceRefreshAt = 0;
let refreshInstancesPromise: Promise<string[]> | null = null;

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("https://")) return null;

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function dedupeInstances(instances: Iterable<string>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const instance of instances) {
    const url = normalizeBaseUrl(instance);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push(url);
  }

  return normalized;
}

function parsePublicInstancesMarkdown(markdown: string): string[] {
  const instances: string[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const columns = line.split("|").map((part) => part.trim());
    const apiUrl = columns[1];
    if (apiUrl?.startsWith("https://")) {
      instances.push(apiUrl);
    }
  }

  return dedupeInstances(instances);
}

type MonitoredPipedInstance = {
  api_url?: unknown;
  cdn?: unknown;
  up_to_date?: unknown;
  uptime_24h?: unknown;
  uptime_7d?: unknown;
  uptime_30d?: unknown;
};

function numericScore(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMonitoredInstancesPayload(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];

  const ranked = payload
    .map((item): { url: string; score: number } | null => {
      const instance = item as MonitoredPipedInstance;
      const url = normalizeBaseUrl(String(instance?.api_url || ""));
      if (!url) return null;

      const uptime24h = numericScore(instance.uptime_24h);
      const uptime7d = numericScore(instance.uptime_7d);
      const uptime30d = numericScore(instance.uptime_30d);
      const score =
        uptime24h * 4 +
        uptime7d * 2 +
        uptime30d +
        (instance.up_to_date === true ? 30 : 0) +
        (instance.cdn === true ? 10 : 0);

      return { url, score };
    })
    .filter((item): item is { url: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  return dedupeInstances(ranked.map((item) => item.url));
}

function createTimeoutSignal(ms: number, parentSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abort = () => controller.abort();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    },
  };
}

function isAbortLikeError(error: unknown): boolean {
  const err = error as { name?: unknown; message?: unknown } | null | undefined;
  const name = typeof err?.name === "string" ? err.name : "";
  const message = typeof err?.message === "string" ? err.message : "";
  return name === "AbortError" || message === "Aborted" || message === "Request aborted";
}

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

async function refreshPipedInstances(signal?: AbortSignal): Promise<string[]> {
  const timeout = createTimeoutSignal(INSTANCE_REFRESH_TIMEOUT_MS, signal);

  try {
    const response = await fetch(PIPED_MONITORED_INSTANCES_URL, {
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const parsed = parseMonitoredInstancesPayload(payload);
    if (parsed.length > 0) {
      activePipedInstances = dedupeInstances([...parsed, ...STATIC_PIPED_INSTANCES]);
      currentInstanceIndex %= activePipedInstances.length;
      lastInstanceRefreshAt = Date.now();
      logger.info(`[Piped] Refreshed ${parsed.length} monitored API instances`);
      return activePipedInstances;
    }

    throw new Error("No monitored instances returned");
  } catch (error: any) {
    if (!isAbortLikeError(error) || !signal?.aborted) {
      logger.warn("[Piped] Monitored instance refresh failed; trying public markdown list", error?.message || error);
    }
  } finally {
    timeout.cleanup();
  }

  const markdownTimeout = createTimeoutSignal(INSTANCE_REFRESH_TIMEOUT_MS, signal);

  try {
    const response = await fetch(PIPED_INSTANCE_LIST_URL, {
      headers: { Accept: "text/markdown,text/plain,*/*" },
      signal: markdownTimeout.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = await response.text();
    const parsed = parsePublicInstancesMarkdown(markdown);
    if (parsed.length > 0) {
      activePipedInstances = parsed;
      currentInstanceIndex %= activePipedInstances.length;
      lastInstanceRefreshAt = Date.now();
      logger.info(`[Piped] Refreshed ${parsed.length} public API instances`);
      return parsed;
    }
  } catch (error: any) {
    if (!isAbortLikeError(error) || !signal?.aborted) {
      logger.warn("[Piped] Public instance refresh failed; using bundled list", error?.message || error);
    }
  } finally {
    markdownTimeout.cleanup();
  }

  return activePipedInstances.length > 0 ? activePipedInstances : [...STATIC_PIPED_INSTANCES];
}

async function getPipedInstancesForRequest(signal?: AbortSignal): Promise<string[]> {
  const now = Date.now();
  const hasFreshList = now - lastInstanceRefreshAt < INSTANCE_REFRESH_TTL_MS;
  if (hasFreshList && activePipedInstances.length > 0) {
    return activePipedInstances;
  }

  if (!refreshInstancesPromise) {
    refreshInstancesPromise = refreshPipedInstances(signal).finally(() => {
      refreshInstancesPromise = null;
    });
  }

  if (lastInstanceRefreshAt === 0) {
    return Promise.race([
      refreshInstancesPromise,
      delay(FIRST_REFRESH_WAIT_MS, activePipedInstances),
    ]);
  }

  void refreshInstancesPromise.catch(() => undefined);
  return activePipedInstances;
}

function getPipedInstance(instances: readonly string[]): string {
  if (instances.length === 0) return STATIC_PIPED_INSTANCES[0];
  currentInstanceIndex %= instances.length;
  return instances[currentInstanceIndex];
}

function rotatePipedInstance(instances: readonly string[]): string {
  currentInstanceIndex = (currentInstanceIndex + 1) % Math.max(1, instances.length);
  const instance = getPipedInstance(instances);
  logger.info(`[Piped] Rotated to instance: ${instance}`);
  return instance;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipedAudioStream {
  url: string;
  originalUrl?: string;
  quality: string;
  format: string;
  mimeType: string;
  bitrate: number;
  codec?: string;
  proxied?: boolean;
}

export interface PipedVideoInfo {
  title: string;
  videoId: string;
  duration: number;
  audioStreams: PipedAudioStream[];
  thumbnailUrl: string;
  uploader: string;
  uploaderUrl?: string;
  uploaderAvatar?: string;
  views?: number;
  likes?: number;
  description?: string;
  proxyUrl?: string;
}

export interface PipedSearchResult {
  url: string;
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl: string;
  uploaderAvatar: string;
  uploadedDate: string;
  duration: number;
  views: number;
  type: "stream" | "channel" | "playlist";
}

// ─── API Functions ────────────────────────────────────────────────────────────

function shouldRotateForStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function shouldProxyPipedStreamUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "googlevideo.com" || host.endsWith(".googlevideo.com");
  } catch {
    return false;
  }
}

function proxifyPipedStreamUrl(value: string, proxyUrl?: string): string {
  if (!proxyUrl || !shouldProxyPipedStreamUrl(value)) return value;

  try {
    const streamUrl = new URL(value);
    const proxy = new URL(proxyUrl);
    const proxyPath = proxy.pathname.endsWith("/")
      ? proxy.pathname.slice(0, -1)
      : proxy.pathname;

    streamUrl.searchParams.set("host", streamUrl.host);
    streamUrl.protocol = proxy.protocol;
    streamUrl.host = proxy.host;
    streamUrl.pathname = `${proxyPath}${streamUrl.pathname}`;
    return streamUrl.toString();
  } catch {
    return value;
  }
}

function normalizeAudioStream(stream: any, proxyUrl?: string): PipedAudioStream | null {
  const url = typeof stream?.url === "string" ? stream.url.trim() : "";
  if (!url) return null;

  const playableUrl = proxifyPipedStreamUrl(url, proxyUrl);
  const bitrate = Number(stream?.bitrate);
  return {
    url: playableUrl,
    originalUrl: playableUrl === url ? undefined : url,
    quality: typeof stream?.quality === "string" ? stream.quality : "unknown",
    format: typeof stream?.format === "string" ? stream.format : "UNKNOWN",
    mimeType: typeof stream?.mimeType === "string" ? stream.mimeType : "audio/mp4",
    bitrate: Number.isFinite(bitrate) ? bitrate : 0,
    codec: typeof stream?.codec === "string" ? stream.codec : undefined,
    proxied: playableUrl !== url,
  };
}

function getNativeAudioCompatibilityScore(stream: PipedAudioStream): number {
  const format = stream.format.toUpperCase();
  const mimeType = stream.mimeType.toLowerCase();
  const codec = (stream.codec || "").toLowerCase();

  if (mimeType.startsWith("video/")) return 0;
  if (format === "M4A" || mimeType.includes("audio/mp4") || codec.includes("mp4a")) return 5;
  if (format === "MP3" || mimeType.includes("audio/mpeg")) return 3;
  if (format.includes("OPUS") || mimeType.includes("opus")) return 2;
  if (format.includes("WEBM") || mimeType.includes("webm")) return 1;
  return 0;
}

function compareAudioStreams(a: PipedAudioStream, b: PipedAudioStream): number {
  const compatibilityDiff = getNativeAudioCompatibilityScore(b) - getNativeAudioCompatibilityScore(a);
  if (compatibilityDiff !== 0) return compatibilityDiff;
  return b.bitrate - a.bitrate;
}

function formatBitrate(bitrate: number): string {
  if (!Number.isFinite(bitrate) || bitrate <= 0) return "unknown bitrate";
  return bitrate > 1000 ? `${Math.round(bitrate / 1000)} kbps` : `${bitrate} kbps`;
}

function getBodyPreview(body: string): string {
  return body.slice(0, 80).replace(/\s+/g, " ").trim();
}

async function readJsonResponse<T>(response: Response, instance: string): Promise<T | null> {
  const body = await response.text();
  const trimmed = body.trim();

  if (!trimmed) {
    logger.warn(`[Piped] Empty response from ${instance}`);
    return null;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("json") && trimmed.startsWith("<")) {
    logger.warn(`[Piped] Non-JSON HTML response from ${instance}: ${getBodyPreview(trimmed)}`);
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error: any) {
    logger.warn(
      `[Piped] Invalid JSON from ${instance}: ${error?.message || error} (${getBodyPreview(trimmed)})`
    );
    return null;
  }
}

/**
 * Fetch with timeout and automatic instance rotation on failure
 */
async function fetchPiped<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  const parentSignal = options.signal instanceof AbortSignal ? options.signal : undefined;
  const instances = await getPipedInstancesForRequest(parentSignal);
  let attempts = 0;
  const maxAttempts = Math.min(instances.length, MAX_PIPED_INSTANCE_ATTEMPTS);

  while (attempts < maxAttempts) {
    const instance = getPipedInstance(instances);
    const url = `${instance}${path}`;
    const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS, parentSignal);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
        signal: timeout.signal,
      });

      if (!response.ok) {
        if (shouldRotateForStatus(response.status)) {
          logger.warn(`[Piped] HTTP ${response.status} from ${instance}; trying next instance`);
          rotatePipedInstance(instances);
          attempts++;
          continue;
        }

        logger.warn(`[Piped] HTTP ${response.status} from ${instance}`);
        return null;
      }

      const data = await readJsonResponse<T>(response, instance);
      if (data !== null) {
        return data;
      }

      rotatePipedInstance(instances);
      attempts++;

      if (attempts >= maxAttempts) {
        logger.warn(`[Piped] All ${maxAttempts} configured instances failed`);
        return null;
      }
    } catch (error: any) {
      if (parentSignal?.aborted) {
        return null;
      }

      logger.warn(`[Piped] Request failed for ${instance}:`, error?.message || error);
      rotatePipedInstance(instances);
      attempts++;

      if (attempts >= maxAttempts) {
        logger.warn(`[Piped] All ${maxAttempts} configured instances failed`);
        return null;
      }
    } finally {
      timeout.cleanup();
    }
  }

  return null;
}

/**
 * Get stream information for a YouTube video
 * Returns direct audio stream URLs that can be played immediately
 * 
 * @param videoId - YouTube video ID (11 characters)
 * @returns Stream info with audio URLs, or null if unavailable
 */
export async function getPipedStream(
  videoId: string,
  signal?: AbortSignal
): Promise<PipedVideoInfo | null> {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    logger.warn(`[Piped] Invalid video ID: ${videoId}`);
    return null;
  }

  try {
    const data = await fetchPiped<any>(`/streams/${videoId}`, { signal });

    if (!data) {
      if (!signal?.aborted) {
        logger.warn(`[Piped] No data returned for ${videoId}`);
      }
      return null;
    }

    const proxyUrl = typeof data.proxyUrl === "string" ? data.proxyUrl : undefined;
    const audioStreams: PipedAudioStream[] = (data.audioStreams || [])
      .map((stream: any) => normalizeAudioStream(stream, proxyUrl))
      .filter((stream: PipedAudioStream | null): stream is PipedAudioStream => {
        if (!stream) return false;
        return getNativeAudioCompatibilityScore(stream) > 0;
      })
      .sort(compareAudioStreams);

    if (audioStreams.length === 0) {
      logger.warn(`[Piped] No audio streams available for ${videoId}`);
      return null;
    }

    logger.info(
      `[Piped] Got ${audioStreams.length} audio streams for ${videoId}, selected ${audioStreams[0].format} ${formatBitrate(audioStreams[0].bitrate)}`
    );

    return {
      title: data.title || "Unknown",
      videoId,
      duration: data.duration || 0,
      audioStreams,
      thumbnailUrl: data.thumbnailUrl || "",
      uploader: data.uploader || "Unknown",
      uploaderUrl: data.uploaderUrl,
      uploaderAvatar: data.uploaderAvatar,
      views: data.views,
      likes: data.likes,
      description: data.description,
      proxyUrl,
    };
  } catch (error: any) {
    if (!signal?.aborted) {
      logger.warn(`[Piped] Failed to get stream for ${videoId}:`, error?.message || error);
    }
    return null;
  }
}

/**
 * Search YouTube Music via Piped
 * 
 * @param query - Search query string
 * @param filter - Filter type: "all", "music_songs", "music_albums", etc.
 * @returns Array of search results
 */
export async function searchPiped(
  query: string,
  filter: string = "music_songs"
): Promise<PipedSearchResult[]> {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query.trim(),
      filter: filter,
    });

    const data = await fetchPiped<any>(`/search?${params}`);

    if (!data) {
      return [];
    }

    const items = data.items || [];
    logger.info(`[Piped] Search "${query}" returned ${items.length} results`);

    return items.filter((item: any) => item.type === "stream");
  } catch (error: any) {
    logger.warn(`[Piped] Search failed for "${query}":`, error.message);
    return [];
  }
}

/**
 * Get trending videos from Piped
 * 
 * @param region - ISO 3166-1 alpha-2 country code (e.g., "US", "GB", "IN")
 * @returns Array of trending videos
 */
export async function getTrendingPiped(
  region: string = "US"
): Promise<PipedSearchResult[]> {
  try {
    const params = new URLSearchParams({ region });
    const data = await fetchPiped<any>(`/trending?${params}`);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    logger.info(`[Piped] Got ${data.length} trending videos for ${region}`);
    return data;
  } catch (error: any) {
    logger.warn(`[Piped] Failed to get trending for ${region}:`, error.message);
    return [];
  }
}

/**
 * Health check for Piped instances.
 * Tests all configured instances and returns the fastest responding one.
 */
export async function testPipedInstances(signal?: AbortSignal): Promise<{
  working: string[];
  failed: string[];
  fastest: string | null;
}> {
  const instances = await getPipedInstancesForRequest(signal);
  const results = await Promise.allSettled(
    instances.map(async (instance) => {
      const start = Date.now();
      const timeout = createTimeoutSignal(5000, signal);
      const response = await fetch(`${instance}/trending?region=US`, { signal: timeout.signal })
        .finally(() => timeout.cleanup());
      const elapsed = Date.now() - start;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { instance, elapsed };
    })
  );

  const working: { instance: string; elapsed: number }[] = [];
  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      working.push(result.value);
    } else {
      failed.push(instances[index]);
    }
  });

  // Sort by response time
  working.sort((a, b) => a.elapsed - b.elapsed);

  logger.info(
    `[Piped] Health check: ${working.length}/${instances.length} working`
  );

  return {
    working: working.map((w) => w.instance),
    failed,
    fastest: working[0]?.instance || null,
  };
}

/**
 * Get suggested completions for search query
 */
export async function getPipedSuggestions(query: string): Promise<string[]> {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const params = new URLSearchParams({ query: query.trim() });
    const data = await fetchPiped<string[]>(`/suggestions?${params}`);

    return data || [];
  } catch (error: any) {
    logger.warn(`[Piped] Suggestions failed:`, error.message);
    return [];
  }
}

export default {
  getPipedStream,
  searchPiped,
  getTrendingPiped,
  testPipedInstances,
  getPipedSuggestions,
};
