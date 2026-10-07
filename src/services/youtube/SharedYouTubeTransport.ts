import "./runtime";
import { Constants, Innertube, Platform, YTNodes } from "youtubei.js/react-native";
import { Jinter } from "jintr";
import type { NativeTrack, PlaylistPage, YouTubeNative, YouTubeStream } from "./YouTubeMusic";

// Interpret player transforms rather than asking Hermes to compile remote code.
Platform.shim.eval = (data, env) => {
  const interpreter = new Jinter();
  for (const [name, value] of Object.entries(env)) interpreter.defineObject(name, value);
  return interpreter.evaluate(`(function() { ${data.output}\n })()`);
};
Platform.shim.uuidv4 = () => globalThis.crypto.randomUUID();

const nativeFetch = globalThis.fetch.bind(globalThis);
async function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const upstream = init?.signal;
  if (upstream?.aborted) cancel();
  else upstream?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 12000);
  try { return await nativeFetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); upstream?.removeEventListener("abort", cancel); }
}

// No MMKV or account dependency; the two mobile platforms share this service.
const values = new Map<string, ArrayBuffer>();
const cache = {
  cache_dir: "",
  get: async (key: string) => values.get(key),
  set: async (key: string, value: ArrayBuffer) => {
    if (values.size >= 24) values.delete(values.keys().next().value!);
    values.set(key, value);
  },
  remove: async (key: string) => { values.delete(key); },
};
let session: Promise<Innertube> | undefined;
function youtube() {
  return session ??= Innertube.create({ lang: "en", location: "IN", cache, fetch: timedFetch,
    enable_session_cache: false }).catch(error => { session = undefined; throw error; });
}

const requests = new Map<string, AbortController>();
async function request<T>(id: string, run: (check: () => void, signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  requests.set(id, controller);
  const check = () => { if (controller.signal.aborted) throw new Error("YouTube request cancelled"); };
  try { const result = await run(check, controller.signal); check(); return result; }
  finally { requests.delete(id); }
}

function track(item: InstanceType<typeof YTNodes.MusicResponsiveListItem>): NativeTrack | undefined {
  if (!item.id || !/^[\w-]{11}$/.test(item.id)) return;
  return { videoId: item.id, title: item.title || "YouTube song",
    artist: item.artists?.map(artist => artist.name).join(", ") || item.author?.name || "YouTube Music",
    coverUrl: item.thumbnails.at(-1)?.url || "", duration: item.duration?.seconds || 0 };
}
type MusicPlaylist = Awaited<ReturnType<Innertube["music"]["getPlaylist"]>>;
const continuations = new Map<string, { playlistId: string; page: MusicPlaylist; at: number }>();
let sequence = 0;
const rejected = new Map<string, number>();
function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/[^\s"']+/g, "[URL]").slice(0, 400);
}

export const sharedYouTubeTransport: YouTubeNative = {
  cancel(id) { requests.get(id)?.abort(); },
  rejectStream(id) {
    if (rejected.size >= 60) rejected.delete(rejected.keys().next().value!);
    rejected.set(id, Date.now());
  },
  search(query, filter, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const [songsPage, playlistsPage] = await Promise.all([
        filter !== "playlists" ? yt.music.search(query, { type: "song" }) : undefined,
        filter !== "songs" ? yt.music.search(query, { type: "playlist" }) : undefined,
      ]); check();
      const items = (page: typeof songsPage) => (page?.contents || []).flatMap(section =>
        section.is(YTNodes.MusicShelf) ? [...section.contents.as(YTNodes.MusicResponsiveListItem)] : []);
      return {
        songs: items(songsPage).flatMap(item => { const song = track(item); return song ? [song] : []; }),
        playlists: items(playlistsPage).flatMap(item => item.id ? [{ id: item.id.replace(/^VL/, ""),
          name: item.title || item.name || "YouTube playlist", coverUrl: item.thumbnails.at(-1)?.url || "",
          songCount: Number(item.item_count) || 0,
          description: item.author?.name || item.authors?.map(author => author.name).join(", ") || "YouTube Music",
          url: `https://music.youtube.com/playlist?list=${encodeURIComponent(item.id.replace(/^VL/, ""))}`,
        }] : []),
      };
    });
  },
  playlist(playlistId, cursor, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const previous = cursor ? continuations.get(cursor) : undefined;
      if (cursor && (!previous || previous.playlistId !== playlistId || Date.now() - previous.at > 180000))
        throw new Error("YouTube playlist continuation expired. Please reopen the playlist.");
      const page = previous ? await previous.page.getContinuation() : await yt.music.getPlaylist(playlistId.replace(/^VL/, ""));
      check();
      if (cursor) continuations.delete(cursor);
      const header = page.header;
      const songs = page.items.filterType(YTNodes.MusicResponsiveListItem).flatMap(item => {
        const song = track(item); return song ? [song] : [];
      });
      let next = "";
      if (page.has_continuation) {
        next = `continuation-${++sequence}`;
        if (continuations.size >= 32) continuations.delete(continuations.keys().next().value!);
        continuations.set(next, { playlistId, page, at: Date.now() });
      }
      const coverUrl = header?.is(YTNodes.MusicResponsiveHeader) ? header.thumbnail?.contents.at(-1)?.url
        : header?.is(YTNodes.MusicDetailHeader) ? header.thumbnails.at(-1)?.url : undefined;
      const name = header && "title" in header ? header.title?.toString() : undefined;
      const result: PlaylistPage = { songs, cursor: next, name, coverUrl };
      return result;
    });
  },
  related(videoId, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const page = await yt.music.getUpNext(videoId, true); check();
      return page.contents.filterType(YTNodes.PlaylistPanelVideo).map(item => ({
        videoId: item.video_id, title: item.title.toString(),
        artist: item.artists?.map(artist => artist.name).join(", ") || item.author || "YouTube Music",
        duration: item.duration.seconds, coverUrl: item.thumbnail.at(-1)?.url || "",
      }));
    });
  },
  resolveStream(videoId, quality, id) {
    return request(id, async (check, signal) => {
      if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
      const yt = await youtube(); check();
      const failures: string[] = [];
      for (const client of ["VISIONOS", "ANDROID_VR", "IOS", "WEB"] as const) {
        check();
        try {
          const resolutionId = `${videoId}:${client}`;
          if (Date.now() - (rejected.get(resolutionId) || 0) < 60000) throw new Error("Recently rejected audio profile");
          const info = await yt.getBasicInfo(videoId, { client }); check();
          if (info.playability_status?.status !== "OK") throw new Error(info.playability_status?.reason || "Video unavailable");
          const formats = [...(info.streaming_data?.adaptive_formats || [])]
            .filter(format => format.has_audio && !format.has_video && format.mime_type.startsWith("audio/mp4"))
            .sort((a, b) => quality === "low" ? a.bitrate - b.bitrate : b.bitrate - a.bitrate);
          if (!formats.length) throw new Error("No compatible AAC audio stream");
          const format = formats[0];
          const playbackUrl = new URL(await format.decipher(yt.session.player)); check();
          playbackUrl.searchParams.set("cpn", info.cpn);
          if (playbackUrl.protocol !== "https:" || !playbackUrl.hostname.endsWith(".googlevideo.com"))
            throw new Error("Invalid YouTube audio origin");
          const headers = { ...Constants.STREAM_HEADERS,
            "User-Agent": client === "WEB" ? "Mozilla/5.0" : Constants.CLIENTS[client].USER_AGENT };
          // HEAD checks the unrestricted resource. A tiny ranged GET can succeed
          // while full playback returns 403. Never download a whole song here.
          const response = await timedFetch(playbackUrl.toString(), { method: "HEAD", headers, signal }); check();
          if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
          const expiresAt = Number(playbackUrl.searchParams.get("expire")) * 1000;
          if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 120000) throw new Error("Audio URL expires too soon");
          // After a decoder/CDN failure, try a different client for this exact
          // video once; the rejected profile becomes eligible after a minute.
          const stream: YouTubeStream = { videoId, url: playbackUrl.toString(), headers, expiresAt,
            bitrate: format.bitrate, mimeType: format.mime_type, codec: "aac", clientProfile: client, resolutionId };
          return stream;
        } catch (error) { check(); failures.push(`${client}: ${safeError(error)}`); }
      }
      throw new Error(`YouTube audio unavailable. ${failures.join("; ")}`);
    });
  },
};
