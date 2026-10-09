import "./runtime";
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
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/[^\s"']+/g, "[URL]").slice(0, 400);
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
const successfulClients: { audio?: StreamClient; video?: StreamClient } = {};
function resolveMediaStream(videoId: string, quality: string, id: string, video = false) {
    return request(id, async (check, signal) => {
      if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
      let yt = await youtube(); check();
      const failures: string[] = [];
      const lane = video ? "video" : "audio";
      let proof: Promise<string | null> | undefined;
      const mintProof = () => proof ??= youtubePoTokens.mint(videoId, yt.session.context.client.visitorData || "", async () => {
        const response = await yt.getAttestationChallenge("ENGAGEMENT_TYPE_UNBOUND");
        const challenge = response.bg_challenge;
        if (!challenge?.program || !challenge.global_name) throw new Error("Attestation challenge unavailable");
        return { program: challenge.program, globalName: challenge.global_name,
          interpreterUrl: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue:
            challenge.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value } };
      });
      // Direct clients already supply usable URLs. Only ciphered formats need
      // player preparation; don't rewrite the signed direct URL on Hermes.
      // IOS formats can reject open-ended decoder requests (see LastWave).
      for (let round = 0; round < 2; round++) {
        const clients: StreamClient[] = round === 0 ? ["VISIONOS", "ANDROID_VR", "TV", "MWEB", "WEB"] : ["VISIONOS", "ANDROID_VR"];
        const preferred = successfulClients[lane];
        if (preferred && clients.includes(preferred)) clients.sort((a, b) => Number(b === preferred) - Number(a === preferred));
        for (const client of clients) {
          check();
          try {
            const resolutionId = `${videoId}:${client}`;
            if (!video && Date.now() - (rejected.get(resolutionId) || 0) < 60000) throw new Error("Recently rejected audio profile");
            if (client === "MWEB" && !proof && preferred !== "MWEB") continue;
            // Web proofs belong to a Web client, never VISIONOS/ANDROID_VR.
            // Bootstrap overlaps remaining direct profiles after an access failure.
            const poToken = client === "MWEB" ? await mintProof() : undefined;
            check();
            if (client === "MWEB" && !poToken) { failures.push(`MWEB: Attestation unavailable (${youtubePoTokens.failureReason || "no native token host"})`); continue; }
            // WEB player requests need the signature timestamp, not just the
            // decipher function after a response has already been rejected.
            if (client === "WEB" || client === "MWEB") { await preparePlayer(yt); check(); }
            const info = await yt.getBasicInfo(videoId, { client, ...(poToken ? { po_token: poToken } : {}) }); check();
            if (info.playability_status?.status !== "OK") {
              const status = info.playability_status?.status || "UNKNOWN";
              const reason = info.playability_status?.reason || "Video unavailable";
              throw new Error(`${status}: ${reason}`);
            }
            const formats = [...(info.streaming_data?.adaptive_formats || []), ...(video ? info.streaming_data?.formats || [] : [])]
              .filter(format => (video ? format.has_video && format.mime_type.startsWith("video/mp4") && /avc1/i.test(format.mime_type) : format.has_audio && !format.has_video && format.mime_type.startsWith("audio/mp4")) &&
                (format.url || format.signature_cipher || format.cipher))
              .sort((a, b) => a.bitrate - b.bitrate);
            if (!formats.length) throw new Error(video ? "No compatible H.264 video stream" : "No compatible AAC audio stream");
            // Medium avoids premium/high-bitrate formats when a standard AAC
            // format exists. High selects the best actually available AAC track.
            const standard = formats.filter(format => format.bitrate <= 160000);
            const candidates = video ? selectVideoFormats(formats, quality) : quality === "low" ? formats : quality === "medium"
              ? (standard.length ? standard.reverse() : formats.reverse())
              : formats.reverse();
            const formatFailures: string[] = [];
            for (const format of candidates.slice(0, 2)) {
              try {
                let url = format.url;
                if (!url) {
                  await preparePlayer(yt); check();
                  url = await format.decipher(yt.session.player);
                }
                const playbackUrl = new URL(url); check();
                if (playbackUrl.protocol !== "https:" || !playbackUrl.hostname.endsWith(".googlevideo.com"))
                  throw new Error("Invalid YouTube audio origin");
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
                  const response = await streamFetch(url, { headers, credentials: "omit", signal: controller.signal });
                  try {
                    check();
                    if (!response.ok) throw new Error(`Audio GET HTTP ${response.status}`);
                    if (!(video ? /^video\/mp4(?:;|$)/i : /^audio\/mp4(?:;|$)/i).test(response.headers.get("content-type") || ""))
                      throw new Error(video ? "Video GET returned a non-MP4 response" : "Audio GET returned a non-AAC response");
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
                  bitrate: format.bitrate, mimeType: format.mime_type, codec: video ? "h264" : "aac", clientProfile: client, resolutionId,
                  durationSeconds: Number.isFinite(format.approx_duration_ms) && format.approx_duration_ms > 0
                    ? format.approx_duration_ms / 1000 : undefined };
                successfulClients[lane] = client;
                return stream;
              } catch (error) { check(); formatFailures.push(safeError(error)); }
            }
            throw new Error(formatFailures.join(", "));
          } catch (error) {
            check();
            const detail = safeError(error);
            failures.push(`${client}: ${detail}`);
            if (round === 0 && /LOGIN_REQUIRED|SIGN_IN_REQUIRED|confirm.*not a bot|HTTP (?:401|403)/i.test(detail)) void mintProof();
          }
        }
        // A long-lived visitor session can become stale. Refresh it once after
        // access/session rejection; never retry private/removed videos endlessly.
        if (round !== 0 || !failures.some(error => /HTTP (?:401|403)|status code (?:401|403)|page needs to be reloaded/i.test(error))) break;
        const previous = session;
        if (previous && (await previous) === yt && session === previous) session = undefined;
        check(); yt = await youtube(); proof = undefined; check();
      }
      throw new Error(`YouTube ${video ? "video" : "audio"} unavailable. ${failures.join("; ")}`);
    });
}
