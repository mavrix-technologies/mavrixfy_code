import "./runtime";
import { Platform as RuntimePlatform } from "react-native";
import { selectVideoFormats } from "./YouTubeVideoFormats";
import { youtubePoTokens } from "./YouTubePoToken";
import { Constants, Helpers, Innertube, Parser, Platform, Player, YTNodes } from "youtubei.js/react-native";
import { bestYouTubeSongThumbnail, bestYouTubeThumbnail, youTubeArtworkUrl } from "./YouTubeArtwork";
import { Jinter } from "jintr";
import { fetch as streamFetch } from "expo/fetch";
import type { NativeHomeSection, NativePlaylist, NativeTrack, PlaylistPage, YouTubeNative, YouTubeStream, YouTubeVideoStream } from "./YouTubeMusic";
import { officialMusicVideoSearchQueries, selectOfficialMusicVideo } from "./officialMusicVideo";
import { validArtistChannelId, type NativeArtist, type NativeArtistDetails } from "./YouTubeArtists";

// YouTube recently added this command to player-error responses. Register its
// stable shape before parsing any response so youtubei.js doesn't emit a noisy
// "class not found" warning and JIT a replacement on every app session.
class PlayerErrorCommand extends Helpers.YTNode {
  static type = "PlayerErrorCommand";
  command: { click_tracking_params: string; auth_required_command: InstanceType<typeof YTNodes.NavigationEndpoint> };

  constructor(data: any) {
    super();
    this.command = {
      click_tracking_params: data.command.clickTrackingParams,
      auth_required_command: new YTNodes.NavigationEndpoint(data.command.authRequiredCommand),
    };
  }
}

Parser.addRuntimeParser("PlayerErrorCommand", PlayerErrorCommand);

// Interpret player transforms rather than asking Hermes to compile remote code.
Platform.shim.eval = (data, env) => {
  const interpreter = new Jinter();
  for (const [name, value] of Object.entries(env)) interpreter.defineObject(name, value);
  return interpreter.evaluate(`(function() { ${data.output}\n })()`);
};
Platform.shim.uuidv4 = () => globalThis.crypto.randomUUID();

async function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const upstream = init?.signal;
  if (upstream?.aborted) cancel();
  else upstream?.addEventListener("abort", cancel, { once: true });
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // A stuck player request must leave time for the next client within invoke's
  // overall deadline. Catalog and player-script downloads keep the normal cap.
  const timeout = setTimeout(cancel, /\/youtubei\/[^/]+\/player(?:[?#]|$)/.test(url) ? 6000 : 12000);
  try {
    // Keep player API and media validation on the same native HTTP stack and
    // anonymous cookie scope. Device WebView cookies must not change extraction.
    const response = await streamFetch(input, { ...init, credentials: "omit", signal: controller.signal });
    // Catalog JSON and player JavaScript are UTF-8 text. Decode on Expo's
    // HTTP stack before buffering: React Native's global Response converts
    // ArrayBuffer bodies to Latin-1 when text()/json() is called.
    const body = await response.text();
    const buffered = new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : body,
      { status: response.status, statusText: response.statusText, headers: response.headers });
    Object.defineProperty(buffered, "url", { value: response.url });
    return buffered;
  }
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
    enable_session_cache: false, retrieve_player: false }).catch(error => { session = undefined; throw error; });
}
const playerRequests = new WeakMap<Innertube, Promise<void>>();
async function preparePlayer(yt: Innertube) {
  if (yt.session.player) return;
  let pending = playerRequests.get(yt);
  if (!pending) {
    pending = Player.create(cache, timedFetch).then(player => { yt.session.player = player; })
      .finally(() => { playerRequests.delete(yt); });
    playerRequests.set(yt, pending);
  }
  await pending;
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
  return { videoId: item.id, title: item.title || "Mavrixfy Music track",
    artist: item.artists?.map(artist => artist.name).join(", ") || item.author?.name || "Mavrixfy Music",
    artists: item.artists?.flatMap(artist => artist.channel_id && validArtistChannelId(artist.channel_id) ? [{ id: artist.channel_id, name: artist.name }] : []),
    coverUrl: youTubeArtworkUrl(bestYouTubeSongThumbnail(item.thumbnails)), duration: item.duration?.seconds || 0 };
}
function artistItem(item: InstanceType<typeof YTNodes.MusicResponsiveListItem> | InstanceType<typeof YTNodes.MusicTwoRowItem>): NativeArtist | undefined {
  if (item.item_type !== "artist" || !item.id || !validArtistChannelId(item.id)) return;
  const thumbnails = item.is(YTNodes.MusicResponsiveListItem) ? item.thumbnails : item.thumbnail;
  return { id: item.id, name: item.is(YTNodes.MusicResponsiveListItem) ? item.name || item.title || "Artist" : item.title.toString(),
    coverUrl: youTubeArtworkUrl(bestYouTubeThumbnail(thumbnails)), subscribers: item.subscribers };
}
type ArtistPage = Awaited<ReturnType<Innertube["music"]["getArtist"]>>;
function topSongsEndpoint(page: ArtistPage) {
  const shelf = page.sections.find(section => section.is(YTNodes.MusicShelf) && section.contents.some(item => !!track(item)));
  return shelf?.is(YTNodes.MusicShelf) ? shelf.endpoint : undefined;
}
// Retain only the small navigation endpoint, not the artist's entire parsed graph.
const artistSongEndpoints = new Map<string, { endpoint: NonNullable<ReturnType<typeof topSongsEndpoint>>; at: number }>();
const artistCursors = new Map<string, { channelId: string; token?: string; endpoint?: InstanceType<typeof YTNodes.NavigationEndpoint>; at: number }>();
type MusicPlaylist = Awaited<ReturnType<Innertube["music"]["getPlaylist"]>>;
const continuations = new Map<string, { playlistId: string; page: MusicPlaylist; at: number }>();
let sequence = 0;
const rejected = new Map<string, number>();
function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/https?:\/\/[^\s"']+/gi, "[URL]")
    .replace(/(?:authorization|cookie|(?:po_?)?token|signature)\s*[:=]\s*[^\r\n;,]+/gi, "[redacted]").slice(0, 400);
}
function parseHomeShelves(homeSections: Iterable<InstanceType<typeof YTNodes.MusicCarouselShelf> | InstanceType<typeof YTNodes.MusicTastebuilderShelf>>, includeAlbums = false) {
  const songs: NativeTrack[] = [], playlists: NativePlaylist[] = [];
  const sections: NativeHomeSection[] = [];
  for (const section of homeSections) {
    if (!section.is(YTNodes.MusicCarouselShelf)) continue;
    const row: NativeHomeSection = { id: `youtube-${includeAlbums ? "explore" : "shelf"}-${sections.length}`, title: section.header?.title?.toString() || "Explore Mavrixfy Music", songs: [], playlists: [] };
    for (const item of section.contents) {
      if (item.is(YTNodes.MusicResponsiveListItem)) {
        if (item.item_type !== "song" && item.item_type !== "video") continue;
        const song = track(item); if (song) row.songs.push(song);
      } else if (item.is(YTNodes.MusicTwoRowItem)) {
        const videoId = item.endpoint.payload.videoId;
        if ((item.item_type === "song" || item.item_type === "video") && typeof videoId === "string" && /^[\w-]{11}$/.test(videoId)) {
          row.songs.push({ videoId, title: item.title.toString(),
            artist: item.artists?.map(artist => artist.name).join(", ") || item.author?.name || "Mavrixfy Music",
            artists: item.artists?.flatMap(artist => artist.channel_id && validArtistChannelId(artist.channel_id) ? [{ id: artist.channel_id, name: artist.name }] : []),
            coverUrl: youTubeArtworkUrl(bestYouTubeSongThumbnail(item.thumbnail)), duration: 0 });
        } else if ((item.item_type === "playlist" || (includeAlbums && item.item_type === "album")) && item.id) {
          const playlistId = item.id.replace(/^VL/, "");
          const owner = item.subtitle.runs?.flatMap(run => "endpoint" in run ? [{ id: run.endpoint?.payload?.browseId, name: run.text }] : []).find(run => /^UC[\w-]{22}$/.test(run.id || ""));
          row.playlists.push({ id: playlistId, name: item.title.toString(), coverUrl: youTubeArtworkUrl(bestYouTubeThumbnail(item.thumbnail)),
            kind: item.item_type === "album" ? "album" : "playlist", songCount: Number.parseInt(item.item_count || "", 10) || 0, description: item.subtitle.toString(),
            ownerChannelId: owner?.id, ownerName: owner?.name,
            url: item.item_type === "album" ? `https://music.youtube.com/browse/${encodeURIComponent(playlistId)}` : `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}` });
        }
      }
    }
    if (includeAlbums) row.category = /new|release|fresh|latest/i.test(row.title) ? "new-releases" : /trend|chart|top/i.test(row.title) ? "trending" : "discover";
    if (row.songs.length || row.playlists.length) {
      sections.push(row); songs.push(...row.songs); playlists.push(...row.playlists);
    }
  }
  return { songs, playlists, sections };
}

export const sharedYouTubeTransport: YouTubeNative = {
  home(id, onFirstPage) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const page = await yt.music.getHomeFeed(); check();
      // One additional page expands playlist discovery without an unbounded
      // crawl. A failed continuation leaves the first page usable.
      const homeSections = [...(page.sections || [])];
      onFirstPage?.(parseHomeShelves(homeSections));
      if (page.has_continuation) {
        try { const more = await page.getContinuation(); check(); homeSections.push(...(more.sections || [])); }
        catch { check(); }
      }
      return parseHomeShelves(homeSections);

    });
  },
  explore(id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      // Region alone still includes international releases. Resolve the server's
      // actual language endpoints, rather than guessing an item's origin by name.
      const response = await yt.actions.execute("/browse", { client: "YTMUSIC", browseId: "FEmusic_moods_and_genres" });
      check();
      const buttons = Parser.parseResponse(response.data).contents_memo?.getType(YTNodes.MusicNavigationButton) || [];
      const languages = ["Hindi", "Punjabi", "Tamil", "Telugu", "Marathi", "Bengali"];
      const regional: NativeHomeSection[] = [];
      const releases: NativePlaylist[] = [];
      // At most two regional requests in flight, no playlist/song stream preloading.
      for (let offset = 0; offset < languages.length; offset += 2) {
        const batch = await Promise.allSettled(languages.slice(offset, offset + 2).map(async language => {
          const button = buttons.find(item => item.button_text === language);
          if (!button) return;
          const result = await button.endpoint.call(yt.actions, { client: "YTMUSIC" }); check();
          const shelves = Parser.parseResponse(result.data).contents_memo?.getType(YTNodes.MusicCarouselShelf) || [];
          // Community uploads are not the regional editorial catalog.
          const feed = parseHomeShelves(shelves.filter(shelf => !/community/i.test(shelf.header?.title?.toString() || "")), true);
          return { language, feed };
        }));
        check();
        for (const result of batch) {
          if (result.status !== "fulfilled" || !result.value) continue;
          const { language, feed } = result.value;
          releases.push(...feed.playlists.filter(item => /\b(new music|new releases|fresh|latest)\b/i.test(item.name)));
          if (feed.songs.length || feed.playlists.length) regional.push({ id: `youtube-regional-${language.toLowerCase()}`,
            title: `${language} Hits`, category: "discover", songs: feed.songs.slice(0, 12),
            playlists: feed.playlists.slice(0, 14) });
        }
      }
      const latest: NativeHomeSection = { id: "youtube-regional-new-releases", title: "New Releases", category: "new-releases",
        songs: [], playlists: [...new Map(releases.map(item => [item.id, item])).values()] };
      const sections = [...(latest.playlists.length ? [latest] : []), ...regional];
      return { sections, songs: sections.flatMap(section => section.songs), playlists: sections.flatMap(section => section.playlists) };
    });
  },
  cancel(id) { requests.get(id)?.abort(); },
  discardPlaylistCursor(cursor) { continuations.delete(cursor); },
  rejectStream(id) {
    if (rejected.size >= 60) rejected.delete(rejected.keys().next().value!);
    rejected.set(id, Date.now());
  },
  search(query, filter, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const results = await Promise.allSettled([
        filter === "all" || filter === "songs" ? yt.music.search(query, { type: "song" }) : undefined,
        filter === "all" || filter === "playlists" ? yt.music.search(query, { type: "playlist" }) : undefined,
        filter === "all" || filter === "artists" ? yt.music.search(query, { type: "artist" }) : undefined,
        filter === "all" || filter === "albums" ? yt.music.search(query, { type: "album" }) : undefined,
      ]); check();
      if (results.every(result => result.status === "rejected" || !result.value)) {
        const failed = results.find(result => result.status === "rejected");
        throw failed?.status === "rejected" ? failed.reason : new Error("Search unavailable");
      }
      const [songsPage, playlistsPage, artistsPage, albumsPage] = results.map(result => result.status === "fulfilled" ? result.value : undefined);
      const items = (page: typeof songsPage) => (page?.contents || []).flatMap(section =>
        section.is(YTNodes.MusicShelf) ? [...section.contents.as(YTNodes.MusicResponsiveListItem)] : []);
      return {
        albums: items(albumsPage).flatMap(item => item.item_type === "album" && item.id?.startsWith("MPRE") ? [{
          id: item.id, name: item.title || "Album", coverUrl: youTubeArtworkUrl(bestYouTubeThumbnail(item.thumbnails)),
          songCount: 0, url: `https://music.youtube.com/browse/${item.id}`, description: item.subtitle?.toString() || "", kind: "album" as const,
        }] : []),
        artists: items(artistsPage).flatMap(item => { const artist = artistItem(item); return artist ? [artist] : []; }),
        songs: items(songsPage).flatMap(item => { const song = track(item); return song ? [song] : []; }),
        playlists: items(playlistsPage).flatMap(item => item.id ? [{ id: item.id.replace(/^VL/, ""),
          name: item.title || item.name || "Playlist", coverUrl: youTubeArtworkUrl(bestYouTubeThumbnail(item.thumbnails)),
          songCount: Number(item.item_count) || 0,
          ownerChannelId: item.author?.channel_id || item.authors?.[0]?.channel_id,
          ownerName: item.author?.name || item.authors?.[0]?.name,
          description: item.author?.name || item.authors?.map(author => author.name).join(", ") || "Playlist",
          url: `https://music.youtube.com/playlist?list=${encodeURIComponent(item.id.replace(/^VL/, ""))}`,
        }] : []),
      };
    });
  },
  artist(channelId, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const page = await yt.music.getArtist(channelId); check();
      const endpoint = topSongsEndpoint(page);
      if (endpoint) {
        if (artistSongEndpoints.size >= 32) artistSongEndpoints.delete(artistSongEndpoints.keys().next().value!);
        artistSongEndpoints.set(channelId, { endpoint, at: Date.now() });
      }
      const header = page.header;
      const thumbnails = header?.is(YTNodes.MusicVisualHeader) ? header.foreground_thumbnail.length ? header.foreground_thumbnail : header.thumbnail
        : header?.is(YTNodes.MusicImmersiveHeader) ? header.thumbnail?.contents : [];
      const result: NativeArtistDetails = { id: channelId, name: header?.title?.toString() || "Artist",
        coverUrl: youTubeArtworkUrl(bestYouTubeThumbnail(thumbnails)),
        description: header?.is(YTNodes.MusicImmersiveHeader) ? header.description.toString() : "",
        songs: [], albums: [], artists: [], hasMoreSongs: false };
      if (!result.description) result.description = page.page.contents_memo?.getType(YTNodes.MusicDescriptionShelf)?.[0]?.description.toString() || "";
      for (const section of page.sections) {
        if (section.is(YTNodes.MusicShelf)) {
          if (!result.songs.length) {
            result.songs = section.contents.flatMap(item => { const song = track(item); return song ? [song] : []; });
            result.hasMoreSongs = !!section.endpoint;
          }
        } else {
          for (const item of section.contents) {
            if (!item.is(YTNodes.MusicTwoRowItem, YTNodes.MusicResponsiveListItem)) continue;
            const artist = artistItem(item);
            if (artist) result.artists.push(artist);
            else if (item.item_type === "album" && item.id) {
              result.albums.push({ id: item.id, name: item.title?.toString() || "Album",
                coverUrl: youTubeArtworkUrl(bestYouTubeThumbnail(item.is(YTNodes.MusicTwoRowItem) ? item.thumbnail : item.thumbnails)),
                url: `https://music.youtube.com/browse/${item.id}`, songCount: 0, description: "", kind: "album" });
            }
          }
        }
      }
      result.albums = [...new Map(result.albums.map(album => [album.id, album])).values()];
      result.artists = [...new Map(result.artists.map(artist => [artist.id, artist])).values()];
      return result;
    });
  },
  artistSongs(channelId, cursor, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      let response;
      if (cursor) {
        const cached = artistCursors.get(cursor);
        if (!cached || cached.channelId !== channelId || Date.now() - cached.at > 180000)
          throw new Error("Artist page expired. Please reopen the artist.");
        response = cached.endpoint ? await cached.endpoint.call(yt.actions, { client: "YTMUSIC" })
          : await yt.actions.execute("/browse", { client: "YTMUSIC", continuation: cached.token });
      } else {
        const cached = artistSongEndpoints.get(channelId);
        const endpoint = cached && Date.now() - cached.at < 1200000 ? cached.endpoint : topSongsEndpoint(await yt.music.getArtist(channelId)); check();
        if (!endpoint) return { songs: [], cursor: "" };
        response = await endpoint.call(yt.actions, { client: "YTMUSIC" });
      }
      check();
      const parsed = Parser.parseResponse(response.data);
      const shelf = parsed.contents_memo?.getType(YTNodes.MusicPlaylistShelf)?.[0] || parsed.contents_memo?.getType(YTNodes.MusicShelf)?.[0];
      const continuation = parsed.continuation_contents;
      const appended = parsed.on_response_received_actions?.filterType(YTNodes.AppendContinuationItemsAction)?.[0]?.contents;
      const contents = continuation && "contents" in continuation ? continuation.contents : shelf?.contents || appended;
      const songs = (contents?.filterType(YTNodes.MusicResponsiveListItem) || []).flatMap(item => { const song = track(item); return song ? [song] : []; });
      const token = continuation && "continuation" in continuation ? continuation.continuation : shelf?.continuation;
      const endpoint = contents?.filterType(YTNodes.ContinuationItem)[0]?.endpoint;
      let next = "";
      if ((typeof token === "string" && token) || endpoint) {
        next = `artist-page-${++sequence}`;
        if (artistCursors.size >= 24) artistCursors.delete(artistCursors.keys().next().value!);
        artistCursors.set(next, { channelId, token: typeof token === "string" ? token : undefined,
          endpoint: token ? undefined : endpoint, at: Date.now() });
      }
      return { songs, cursor: next };
    });
  },
  playlist(playlistId, cursor, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      const previous = cursor ? continuations.get(cursor) : undefined;
      if (cursor && (!previous || previous.playlistId !== playlistId || Date.now() - previous.at > 180000))
        throw new Error("YouTube playlist continuation expired. Please reopen the playlist.");
      if (!cursor && /^MPRE/.test(playlistId)) {
        const album = await yt.music.getAlbum(playlistId); check();
        const header = album.header;
        const coverUrl = header?.is(YTNodes.MusicResponsiveHeader) ? youTubeArtworkUrl(bestYouTubeThumbnail(header.thumbnail?.contents))
          : header?.is(YTNodes.MusicDetailHeader) ? youTubeArtworkUrl(bestYouTubeThumbnail(header.thumbnails)) : undefined;
        const songs = album.contents.flatMap(item => { const song = track(item); return song ? [song] : []; });
        return { songs, cursor: "", name: header?.title?.toString(), coverUrl, songCount: songs.length };
      }
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
      const coverUrl = header?.is(YTNodes.MusicResponsiveHeader) ? youTubeArtworkUrl(bestYouTubeThumbnail(header.thumbnail?.contents))
        : header?.is(YTNodes.MusicDetailHeader) ? youTubeArtworkUrl(bestYouTubeThumbnail(header.thumbnails)) : undefined;
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
        artist: item.artists?.map(artist => artist.name).join(", ") || item.author || "Mavrixfy Music",
        duration: item.duration.seconds, coverUrl: youTubeArtworkUrl(bestYouTubeSongThumbnail(item.thumbnail)),
      }));
    });
  },
  resolveStream(videoId, quality, id) { return resolveMediaStream(videoId, quality, id); },
  resetVerification() { verificationBlockedUntil = 0; verificationBlockedReason = ""; },
  resolveVideoStream(videoId, quality, id) { return resolveMediaStream(videoId, quality, id, true) as Promise<YouTubeVideoStream>; },
  resolveOfficialMusicVideo(query, id) {
    return request(id, async check => {
      const yt = await youtube(); check();
      for (const searchQuery of officialMusicVideoSearchQueries(query)) {
        const search = await yt.music.search(searchQuery, { type: "video" }); check();
        const candidates = (search.contents || []).flatMap(section => section.is(YTNodes.MusicShelf) ? section.contents : [])
          .filter(item => item.item_type === "video")
          .map(item => {
            // Classification is on the title's watch endpoint, not the row's
            // optional browse endpoint. Search rows can also omit `id`.
            const titleRun = item.flex_columns[0]?.title.runs?.[0];
            const endpoint = (titleRun && "endpoint" in titleRun ? titleRun.endpoint : undefined) || item.endpoint;
            const payload = endpoint?.payload;
            return {
              videoId: item.id || payload?.videoId || "",
              title: item.title || "",
              durationSeconds: item.duration?.seconds || 0,
              musicVideoType: payload?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || "",
              artists: (item.authors || []).map(author => ({ id: author.channel_id, name: author.name })),
            };
          });
        const matched = selectOfficialMusicVideo(candidates, query);
        if (matched) return matched;
      }
      return null;
    });
  },
};

type StreamClient = "VISIONOS" | "ANDROID_VR" | "TV" | "MWEB" | "WEB";
type ExtractionStage = "input" | "session" | "attestation" | "player" | "format" | "decipher" | "media";
type ExtractionCode = "INVALID_VIDEO_ID" | "LOGIN_REQUIRED" | "NO_DIRECT_AUDIO_URL" | "NETWORK_TIMEOUT" |
  "NETWORK_ERROR" | "MEDIA_FORBIDDEN" | "UNSUPPORTED_FORMAT" | "RATE_LIMITED" | "UNAVAILABLE";
export class YouTubeExtractionError extends Error {
  retryExhausted = false;
  constructor(readonly code: ExtractionCode, readonly stage: ExtractionStage, detail: string, readonly httpStatus?: number) {
    super(`${code}: ${safeError(detail)}`);
    this.name = "YouTubeExtractionError";
  }
}
function extractionError(error: unknown, stage: ExtractionStage): YouTubeExtractionError {
  if (error instanceof YouTubeExtractionError) return error;
  const upstream = error as { info?: { status?: string; reason?: string; error_type?: string } } | null;
  const detail = safeError(error);
  const status = upstream?.info?.status || upstream?.info?.error_type || "";
  const reason = upstream?.info?.reason || "";
  const text = `${status} ${reason} ${detail}`;
  const httpStatus = Number(/(?:HTTP|status code)\s+(\d{3})/i.exec(text)?.[1]) || undefined;
  const code: ExtractionCode = /LOGIN_REQUIRED|SIGN_IN_REQUIRED|confirm.*not a bot|login required/i.test(text) ? "LOGIN_REQUIRED"
    : httpStatus === 429 ? "RATE_LIMITED"
    : /timed out|timeout|AbortError|ETIMEDOUT/i.test(text) ? "NETWORK_TIMEOUT"
    : stage === "media" && httpStatus === 403 ? "MEDIA_FORBIDDEN"
    : /network request failed|failed to fetch|ECONNRESET/i.test(text) ? "NETWORK_ERROR"
    : /No compatible|non-AAC|non-MP4/i.test(text) ? "UNSUPPORTED_FORMAT" : "UNAVAILABLE";
  return new YouTubeExtractionError(code, stage, `${status} ${reason} ${detail}`.trim(), httpStatus);
}
function extractionDiagnostic(data: {
  videoId: string; client: StreamClient; stage: ExtractionStage; elapsedMs: number;
  playabilityStatus?: string; hasVideoDetails?: boolean; hasStreamingData?: boolean; audioFormatCount?: number;
  code?: ExtractionCode; httpStatus?: number;
}) {
  // Only fixed categories and scalar counts: never log upstream objects or URLs.
  if (typeof __DEV__ !== "undefined" && __DEV__) console.info("[YouTube extraction]", data);
}
function recoveryDelay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error("YouTube request cancelled")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 350);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
  });
}
const successfulClients: { audio?: StreamClient; video?: StreamClient } = {};
let verificationBlockedUntil = 0;
let verificationBlockedReason = "";
function blockVerification(reason: string) {
  verificationBlockedUntil = Date.now() + 60_000;
  verificationBlockedReason = reason;
}
function checkVerificationCooldown() {
  if (Date.now() < verificationBlockedUntil)
    throw new YouTubeExtractionError("LOGIN_REQUIRED", "player", `SIGN_IN_REQUIRED: Upstream verification required. ${verificationBlockedReason} Try again later.`);
}
function resolveMediaStream(videoId: string, quality: string, id: string, video = false) {
    return request(id, async (check, signal) => {
      if (!/^[\w-]{11}$/.test(videoId)) throw new YouTubeExtractionError("INVALID_VIDEO_ID", "input", "Invalid video ID");
      checkVerificationCooldown();
      const yt = await youtube().catch(error => { throw extractionError(error, "session"); }); check();
      const failures: string[] = [];
      let lastFailure: YouTubeExtractionError | undefined;
      let recoveryUsed = false;
      const lane = video ? "video" : "audio";
      // Direct clients already supply usable URLs. Only ciphered formats need
      // player preparation; don't rewrite the signed direct URL on Hermes.
      // IOS formats can reject open-ended decoder requests (see LastWave).
      {
        const clients: StreamClient[] = ["VISIONOS", "ANDROID_VR", "TV", "MWEB", "WEB"];
        const preferred = successfulClients[lane];
        if (preferred && clients.includes(preferred)) clients.sort((a, b) => Number(b === preferred) - Number(a === preferred));
        for (let attempt = 0; attempt < clients.length; attempt++) {
          const client = clients[attempt];
          check();
          checkVerificationCooldown();
          const startedAt = Date.now();
          let stage: ExtractionStage = "player";
          try {
            const resolutionId = `${videoId}:${client}`;
            if (!video && Date.now() - (rejected.get(resolutionId) || 0) < 60000) throw new Error("Recently rejected audio profile");
            // Web proofs belong to a Web client, never VISIONOS/ANDROID_VR.
            stage = "attestation";
            const poToken = client === "MWEB"
              ? await youtubePoTokens.mint(videoId, yt.session.context.client.visitorData || "") : undefined;
            check();
            if (client === "MWEB" && !poToken) {
              failures.push(`MWEB: Attestation unavailable (${youtubePoTokens.failureReason || "no native token host"})`);
              continue;
            }
            // WEB player requests need the signature timestamp, not just the
            // decipher function after a response has already been rejected.
            stage = "decipher";
            if (client === "WEB" || client === "MWEB") { await preparePlayer(yt); check(); }
            stage = "player";
            // MWEB's video-bound proof is for GVS, not the player request.
            // Basic info avoids the unrelated /next request made by getInfo().
            const info = await yt.getBasicInfo(videoId, { client }); check();
            const status = info.playability_status?.status || "UNKNOWN";
            extractionDiagnostic({ videoId, client, stage, elapsedMs: Date.now() - startedAt,
              playabilityStatus: /^[A-Z_]{1,40}$/.test(status) ? status : "UNKNOWN",
              hasVideoDetails: Boolean(info.basic_info?.id),
              hasStreamingData: Boolean(info.streaming_data),
              audioFormatCount: info.streaming_data?.adaptive_formats.filter(format => format.has_audio && !format.has_video).length || 0 });
            if (info.playability_status?.status !== "OK") {
              const reason = info.playability_status?.reason || "Video unavailable";
              throw new Error(`${status}: ${reason}`);
            }
            if (info.basic_info?.id !== videoId) throw new YouTubeExtractionError("UNAVAILABLE", stage, "Missing or mismatched video details");
            stage = "format";
            // Keep Apple's direct-file audio path on AAC-LC while investigating
            // the observed doubled HE-AAC timeline and silent tail.
            // Android uses ExoPlayer/Media3 which natively supports both AAC-LC and high-fidelity Opus (itag 251, ~160kbps).
            const isAudioFormatCompatible = (format: { has_audio?: boolean; has_video?: boolean; mime_type: string }) => {
              if (!format.has_audio || format.has_video) return false;
              if (format.mime_type.startsWith("audio/mp4")) {
                return RuntimePlatform.OS !== "ios" || /\bmp4a\.40\.2\b/i.test(format.mime_type);
              }
              if (RuntimePlatform.OS === "android" && format.mime_type.startsWith("audio/webm") && /opus/i.test(format.mime_type)) {
                return true;
              }
              return false;
            };

            const compatibleFormats = [...(info.streaming_data?.adaptive_formats || []), ...(video ? info.streaming_data?.formats || [] : [])]
              .filter(format => (video
                ? format.has_video && format.mime_type.startsWith("video/mp4") && /avc1/i.test(format.mime_type)
                : isAudioFormatCompatible(format)
              ))
              .sort((a, b) => a.bitrate - b.bitrate);
            const formats = compatibleFormats.filter(format => format.url || format.signature_cipher || format.cipher);
            if (!formats.length) throw new YouTubeExtractionError(
              !compatibleFormats.length && info.streaming_data?.adaptive_formats.some(format => format.has_audio) ? "UNSUPPORTED_FORMAT" : "NO_DIRECT_AUDIO_URL", stage,
              video ? "No compatible H.264 video stream" : "No compatible audio stream");
            // Medium avoids premium/high-bitrate formats when a standard AAC/Opus
            // format exists. High selects the best actually available audio track.
            const standard = formats.filter(format => format.bitrate <= 160000);
            const candidates = video ? selectVideoFormats(formats, quality) : quality === "low" ? formats : quality === "medium"
              ? (standard.length ? standard.reverse() : formats.reverse())
              : formats.reverse();
            const formatFailures: string[] = [];
            for (const candidate of candidates.slice(0, 2)) {
              try {
                stage = "format";
                const format = info.chooseFormat({ itag: candidate.itag, type: video ? "video" : "audio" });
                let url = format.url;
                if (!url) {
                  stage = "decipher";
                  await preparePlayer(yt); check();
                  url = await format.decipher(yt.session.player);
                }
                if (!url) throw new YouTubeExtractionError("NO_DIRECT_AUDIO_URL", stage, "No usable URL after deciphering");
                const playbackUrl = new URL(url); check();
                if (playbackUrl.protocol !== "https:" || !playbackUrl.hostname.endsWith(".googlevideo.com"))
                  throw new Error("Invalid audio origin");
                // Add the video-bound GVS proof without re-encoding the signed URL.
                if (poToken && !playbackUrl.searchParams.has("pot")) url += `${url.includes("?") ? "&" : "?"}pot=${encodeURIComponent(poToken)}`;
                const headers = { ...Constants.STREAM_HEADERS,
                  "User-Agent": client === "WEB" || client === "MWEB" ? "Mozilla/5.0" : Constants.CLIENTS[client].USER_AGENT };
                const expiresAt = Number(playbackUrl.searchParams.get("expire")) * 1000;
                if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 120000) throw new Error("Audio URL expires too soon");
                // Validate the same open-ended GET used for playback. Expo's streaming
                // fetch exposes headers before buffering the body, unlike RN's fetch.
                // Cancel immediately; never download the song or alter URL/range.
                const controller = new AbortController();
                const abort = () => controller.abort();
                signal.addEventListener("abort", abort, { once: true });
                if (signal.aborted) abort();
                const timer = setTimeout(abort, 5000);
                try {
                  stage = "media";
                  const response = await streamFetch(url, { headers, credentials: "omit", signal: controller.signal });
                  try {
                    check();
                    if (!response.ok) throw new Error(`Audio GET HTTP ${response.status}`);
                    if (!(video ? /^video\/mp4(?:;|$)/i : /^audio\/(?:mp4|webm)(?:;|$)/i).test(response.headers.get("content-type") || ""))
                      throw new Error(video ? "Video GET returned a non-MP4 response" : "Audio GET returned a non-AAC response");
                    extractionDiagnostic({ videoId, client, stage, elapsedMs: Date.now() - startedAt, httpStatus: response.status });
                  } finally { await response.body?.cancel(); }
                } finally {
                  clearTimeout(timer);
                  signal.removeEventListener("abort", abort);
                  controller.abort();
                }
                // After a decoder/CDN failure, try a different client for this exact
                // video once; the rejected profile becomes eligible after a minute.
                const stream: YouTubeStream | YouTubeVideoStream = { videoId, url, headers, expiresAt,
                  ...(video ? { height: format.height || 0 } : {}),
                  bitrate: format.bitrate, mimeType: format.mime_type, codec: video ? "h264" : /opus/i.test(format.mime_type) ? "opus" : "aac", clientProfile: client, resolutionId,
                  durationSeconds: Number.isFinite(format.approx_duration_ms) && format.approx_duration_ms > 0
                    ? format.approx_duration_ms / 1000 : undefined };
                successfulClients[lane] = client;
                return stream;
              } catch (error) {
                check();
                const failure = extractionError(error, stage);
                if (["MEDIA_FORBIDDEN", "NETWORK_TIMEOUT", "NETWORK_ERROR", "LOGIN_REQUIRED", "RATE_LIMITED"].includes(failure.code)) throw failure;
                lastFailure = failure;
                formatFailures.push(safeError(failure));
              }
            }
            throw new YouTubeExtractionError(lastFailure?.code || "NO_DIRECT_AUDIO_URL", lastFailure?.stage || stage, formatFailures.join(", "));
          } catch (error) {
            check();
            const failure = extractionError(error, stage);
            extractionDiagnostic({ videoId, client, stage: failure.stage, elapsedMs: Date.now() - startedAt,
              code: failure.code, httpStatus: failure.httpStatus });
            if (failure.code === "LOGIN_REQUIRED") {
              if (/confirm.*not a bot/i.test(failure.message)) blockVerification("YouTube requires verification for this session.");
              throw failure;
            }
            if (failure.code === "RATE_LIMITED") throw failure;
            if (["MEDIA_FORBIDDEN", "NETWORK_TIMEOUT", "NETWORK_ERROR"].includes(failure.code)) {
              if (recoveryUsed) { failure.retryExhausted = true; throw failure; }
              recoveryUsed = true;
              await recoveryDelay(signal); check();
              // Resolve a fresh URL once using the same initialized session.
              attempt--;
              continue;
            }
            lastFailure = failure;
            failures.push(`${client}: ${safeError(failure)}`);
          }
        }
      }
      throw new YouTubeExtractionError(lastFailure?.code || "UNAVAILABLE", lastFailure?.stage || "player",
        `${video ? "Video" : "Audio"} unavailable. ${failures.join("; ")}`);
    });
}
