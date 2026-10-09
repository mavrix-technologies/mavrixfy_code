import { Constants, Innertube, Platform, YTNodes } from 'youtubei.js/react-native';
import { Jinter } from 'jintr';

export interface YouTubeSong {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  coverUrl: string;
  duration: number;
}
export interface YouTubePlaylist { id: string; title: string; artist: string; coverUrl: string }
export interface YouTubeStream { url: string; headers: Record<string, string>; bitrate: number; expiresAt: number; client: string }

// Interpret the extracted player code in JavaScript; Hermes does not need to
// compile remote code using Function/eval, and no native extractor is used.
Platform.shim.eval = (data, env) => {
  const interpreter = new Jinter();
  for (const [name, value] of Object.entries(env)) interpreter.defineObject(name, value);
  return interpreter.evaluate(`(function() { ${data.output}\n })()`);
};
Platform.shim.uuidv4 = () => globalThis.crypto.randomUUID();

const nativeFetch = globalThis.fetch.bind(globalThis);
async function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal;
  const cancel = () => controller.abort();
  if (upstream?.aborted) cancel();
  else upstream?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 12000);
  try { return await nativeFetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); upstream?.removeEventListener('abort', cancel); }
}

// Explicit in-memory cache avoids the native MMKV dependency of the default
// React Native cache. Signed streams are kept only for this process/session.
const values = new Map<string, ArrayBuffer>();
const cache = {
  cache_dir: '',
  get: async (key: string) => values.get(key),
  set: async (key: string, value: ArrayBuffer) => { if (values.size >= 24) values.clear(); values.set(key, value); },
  remove: async (key: string) => { values.delete(key); },
};
let session: Promise<Innertube> | undefined;
function youtube() {
  if (!session) session = Innertube.create({ lang: 'en', location: 'IN', cache,
    fetch: timedFetch, enable_session_cache: false }).catch(error => { session = undefined; throw error; });
  return session;
}

function song(item: InstanceType<typeof YTNodes.MusicResponsiveListItem>): YouTubeSong | undefined {
  const videoId = item.id;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return;
  return { id: `youtube_${videoId}`, videoId, title: item.title || 'Mavrixfy Music track',
    artist: item.artists?.map(artist => artist.name).join(', ') || item.author?.name || 'Mavrixfy Music',
    duration: item.duration?.seconds || 0, coverUrl: item.thumbnails.at(-1)?.url || '' };
}

export async function searchYouTube(query: string) {
  const yt = await youtube();
  const [songPage, playlistPage] = await Promise.all([
    yt.music.search(query.trim(), { type: 'song' }),
    yt.music.search(query.trim(), { type: 'playlist' }),
  ]);
  const musicItems = (page: typeof songPage) => (page.contents || []).flatMap(section =>
    section.is(YTNodes.MusicShelf) ? [...section.contents.as(YTNodes.MusicResponsiveListItem)] : []);
  const songs = musicItems(songPage).map(song).filter((item): item is YouTubeSong => !!item);
  const playlists: YouTubePlaylist[] = musicItems(playlistPage).flatMap(item => item.id ? [{
    id: item.id, title: item.title || item.name || 'Mavrixfy Music playlist',
    artist: item.author?.name || item.authors?.map(author => author.name).join(', ') || 'Mavrixfy Music',
    coverUrl: item.thumbnails.at(-1)?.url || '',
  }] : []);
  return { songs, playlists };
}

export async function loadPlaylist(id: string) {
  const yt = await youtube();
  const page = await yt.music.getPlaylist(id.replace(/^VL/, ''));
  return { songs: page.items.filterType(YTNodes.MusicResponsiveListItem).map(song)
    .filter((item): item is YouTubeSong => !!item), hasMore: page.has_continuation };
}

const streams = new Map<string, YouTubeStream>();
export function invalidateStream(videoId: string) { streams.delete(videoId); }

export async function resolveStream(videoId: string, onStage: (stage: string) => void = () => {}) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid Mavrixfy Music track ID.');
  const existing = streams.get(videoId);
  if (existing && existing.expiresAt > Date.now() + 120000) return existing;
  onStage('Loading Mavrixfy Music…');
  const yt = await youtube();
  const failures: string[] = [];
  // Same exact video with alternative YouTube clients; never JioSaavn matching.
  for (const client of ['VISIONOS', 'ANDROID_VR', 'IOS', 'WEB'] as const) {
    onStage(`Resolving audio (${client})…`);
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      if (info.playability_status?.status !== 'OK') {
        failures.push(`${client}: ${info.playability_status?.reason || info.playability_status?.status || 'unavailable'}`);
        continue;
      }
      const formats = [...(info.streaming_data?.adaptive_formats || [])]
        .filter(format => format.has_audio && !format.has_video && format.mime_type.startsWith('audio/mp4'))
        .sort((a, b) => b.bitrate - a.bitrate);
      if (!formats.length) { failures.push(`${client}: no AAC audio stream`); continue; }
      const format = formats[0];
      const decoded = await format.decipher(yt.session.player);
      const playbackUrl = new URL(decoded);
      playbackUrl.searchParams.set('cpn', info.cpn);
      const url = playbackUrl.toString();
      if (!url.startsWith('https://')) throw new Error('No HTTPS audio URL');
      const headers = { ...Constants.STREAM_HEADERS, 'User-Agent': client === 'WEB' ? 'Mozilla/5.0' : Constants.CLIENTS[client].USER_AGENT };
      onStage(`Checking audio (${client})…`);
      const response = await timedFetch(url, { headers });
      // Check availability, not just whether the player API returned a URL.
      if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
      await response.body?.cancel().catch(() => {});
      const expiresAt = Number(new URL(url).searchParams.get('expire')) * 1000 || Date.now() + 300000;
      const stream = { url, headers, bitrate: format.bitrate, expiresAt, client };
      if (streams.size >= 20) streams.clear();
      streams.set(videoId, stream);
      return stream;
    } catch (error) {
      failures.push(`${client}: ${safeError(error)}`);
    }
  }
  throw new Error(failures.join('\n'));
}

export function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/https?:\/\/[^\s"']+/g, '[URL]').slice(0, 600);
}
