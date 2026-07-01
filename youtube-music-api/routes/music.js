import express from "express";
import { Readable } from "node:stream";
import { getYoutube } from "../services/youtube.js";

const router = express.Router();

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const AUDIO_CACHE_MAX_ITEMS = 100;
const AUDIO_CACHE_MAX_AGE_SECONDS = 20 * 60;
const AUDIO_CACHE_EXPIRY_MARGIN_SECONDS = 90;
const AUDIO_RESOLVER_TOKEN = (process.env.YOUTUBE_MUSIC_AUDIO_TOKEN || "").trim();
const DEFAULT_PLAYBACK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "*/*",
};

const audioStreamCache = new Map();
const audioStreamRequests = new Map();

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value.toString === "function") {
    const rendered = value.toString();
    return rendered && rendered !== "[object Object]" ? rendered.trim() : "";
  }
  return "";
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function extractVideoId(value) {
  const raw = text(value).replace(/^youtube_/, "");
  if (VIDEO_ID_PATTERN.test(raw)) return raw;
  const match = raw.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})/);
  return match?.[1] || match?.[2] || "";
}

function getEndpointPayload(item) {
  return item?.endpoint?.payload || item?.overlay?.content?.endpoint?.payload || {};
}

function getMusicVideoType(item) {
  const payload = getEndpointPayload(item);
  const musicType =
    payload?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType ||
    payload?.watchEndpointMusicConfig?.musicVideoType;
  if (musicType) return musicType;
  if (item?.item_type === "song") return "MUSIC_VIDEO_TYPE_ATV";
  if (item?.item_type === "video") return "MUSIC_VIDEO_TYPE_OMV";
  return text(item?.item_type) || undefined;
}

function getThumbnails(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.contents)
      ? value.contents
      : Array.isArray(value?.thumbnails)
        ? value.thumbnails
        : Array.isArray(value?.thumbnail)
          ? value.thumbnail
          : [];

  return source.flatMap((thumb) => {
    const url = text(thumb?.url);
    if (!url) return [];
    return [{
      url,
      width: Number(thumb?.width) || 0,
      height: Number(thumb?.height) || 0,
    }];
  });
}

function itemThumbnails(item) {
  return getThumbnails(item?.thumbnails || item?.thumbnail || item?.thumbnail?.contents);
}

function normalizePeople(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.flatMap((person) => {
    const name = text(person?.name || person?.title || person);
    if (!name) return [];
    const id = text(person?.channel_id || person?.id || person?.browseId);
    return [id ? { name, id } : { name }];
  });
}

function getBrowseId(item) {
  const payload = getEndpointPayload(item);
  return text(payload?.browseId || item?.browseId || item?.playlistId || item?.id);
}

function getTrackId(item) {
  const payload = getEndpointPayload(item);
  return extractVideoId(item?.id || item?.videoId || payload?.videoId);
}

function normalizeTrack(item) {
  const videoId = getTrackId(item);
  const title = text(item?.title || item?.name);
  if (!videoId || !title) return null;

  const artists = normalizePeople(item?.artists || item?.authors || item?.author);
  const albumName = text(item?.album?.name || item?.album?.title);
  const albumId = text(item?.album?.id || item?.album?.browseId);

  return {
    videoId,
    title,
    artists,
    album: albumName ? { name: albumName, id: albumId || undefined } : undefined,
    duration: item?.duration?.text || text(item?.duration) || undefined,
    duration_seconds: Number(item?.duration?.seconds) || undefined,
    thumbnails: itemThumbnails(item),
    videoType: getMusicVideoType(item),
    resultType: item?.item_type || "song",
    category: item?.item_type === "video" || item?.item_type === "non_music_track" ? "video" : "song",
    views: text(item?.views) || undefined,
    year: text(item?.year) || undefined,
  };
}

function normalizeCollectionItem(item, fallbackType = "") {
  const itemType = item?.item_type || fallbackType;
  const id = getBrowseId(item);
  const title = text(item?.title || item?.name);
  const author = text(item?.author?.name || item?.subtitle);
  const thumbnails = itemThumbnails(item);

  if (itemType === "artist") {
    return {
      browseId: id,
      id,
      name: title,
      title,
      resultType: "artist",
      category: "artist",
      thumbnails,
      subscribers: text(item?.subscribers) || undefined,
    };
  }

  if (itemType === "album") {
    return {
      browseId: id,
      id,
      title,
      resultType: "album",
      category: "album",
      artists: normalizePeople(item?.author || item?.artists || item?.authors),
      year: text(item?.year) || undefined,
      thumbnails,
      trackCount: Number.parseInt(text(item?.item_count || item?.song_count), 10) || undefined,
    };
  }

  return {
    browseId: id,
    playlistId: id,
    id,
    title,
    resultType: "playlist",
    category: "playlist",
    author: author || undefined,
    thumbnails,
    description: text(item?.subtitle) || undefined,
    itemCount: text(item?.item_count || item?.song_count) || undefined,
    trackCount: Number.parseInt(text(item?.item_count || item?.song_count), 10) || undefined,
  };
}

function normalizeSearchItem(item, fallbackType) {
  if (["song", "video", "non_music_track"].includes(item?.item_type) || getTrackId(item)) {
    return normalizeTrack(item);
  }
  return normalizeCollectionItem(item, fallbackType);
}

function shelfItems(search, type) {
  if (type === "song") return search.songs?.contents || [];
  if (type === "video") return search.videos?.contents || [];
  if (type === "album") return search.albums?.contents || [];
  if (type === "artist") return search.artists?.contents || [];
  if (type === "playlist") return search.playlists?.contents || [];
  return (search.contents || []).flatMap((section) => section?.contents || []);
}

function mapFilterToType(filter) {
  const value = text(filter).toLowerCase();
  if (value === "songs") return "song";
  if (value === "videos" || value === "uploads") return "video";
  if (value === "albums") return "album";
  if (value === "artists") return "artist";
  if (value.includes("playlist")) return "playlist";
  return "song";
}

function headerThumbnails(header) {
  return getThumbnails(header?.thumbnail?.contents || header?.thumbnail || header?.thumbnails);
}

function headerTitle(header, fallback) {
  return text(header?.title || fallback);
}

function parseYearFromSubtitle(value) {
  const match = text(value).match(/\b(19|20)\d{2}\b/);
  return match?.[0] || undefined;
}

function normalizePlaylist(playlist, fallbackId) {
  const header = playlist?.header || {};
  const tracks = (playlist?.contents || []).flatMap((item) => {
    const track = normalizeTrack(item);
    return track ? [track] : [];
  });

  return {
    browseId: fallbackId,
    title: headerTitle(header, "YouTube Music Playlist"),
    description: text(header?.second_subtitle || header?.subtitle) || `${tracks.length} tracks`,
    thumbnails: headerThumbnails(header),
    trackCount: tracks.length,
    tracks,
  };
}

function normalizeAlbum(album, fallbackId) {
  const header = album?.header || {};
  const tracks = (album?.contents || []).flatMap((item) => {
    const track = normalizeTrack(item);
    return track ? [track] : [];
  });

  return {
    browseId: fallbackId,
    title: headerTitle(header, "YouTube Music Album"),
    artists: normalizePeople(header?.strapline_text_one),
    year: parseYearFromSubtitle(header?.subtitle || header?.second_subtitle),
    description: text(header?.second_subtitle || header?.subtitle) || `${tracks.length} tracks`,
    thumbnails: headerThumbnails(header),
    trackCount: tracks.length,
    tracks,
  };
}

function sectionTitle(section) {
  return text(section?.title || section?.header?.title);
}

function normalizeArtist(artist, fallbackId) {
  const header = artist?.header || {};
  const sections = artist?.sections || [];
  const tracks = [];
  const albums = [];

  for (const section of sections) {
    const title = sectionTitle(section).toLowerCase();
    const isSongSection = /song/i.test(title);
    for (const item of section?.contents || []) {
      if ((item?.item_type === "song" || item?.item_type === "video") && (isSongSection || tracks.length < 10)) {
        const track = normalizeTrack(item);
        if (track) tracks.push(track);
      } else if (item?.item_type === "album") {
        const album = normalizeCollectionItem(item, "album");
        if (album?.browseId) albums.push(album);
      }
    }
  }

  return {
    browseId: fallbackId,
    name: headerTitle(header, "Artist"),
    description: text(header?.description) || undefined,
    thumbnails: headerThumbnails(header),
    subscribers: text(header?.subscription_button?.subscriber_count || header?.subtitle) || undefined,
    tracks: tracks.slice(0, 25),
    albums: albums.slice(0, 20),
  };
}

function normalizeHomeShelf(section) {
  const title = sectionTitle(section);
  const contents = (section?.contents || []).flatMap((item) => {
    const id = getBrowseId(item);
    const isMatch =
      item?.item_type === "playlist" ||
      id.startsWith("VL") ||
      id.startsWith("PL") ||
      id.startsWith("RDCLAK") ||
      id.startsWith("RDTMAK");
    if (!isMatch) return [];
    const normalized = normalizeCollectionItem(item, "playlist");
    if (normalized?.playlistId || normalized?.browseId) {
      return [normalized];
    }
    return [];
  });

  return title && contents.length > 0 ? { title, contents } : null;
}

async function searchPlaylists(query, limit) {
  const yt = await getYoutube();
  const search = await yt.music.search(query, { type: "playlist" });
  return shelfItems(search, "playlist")
    .slice(0, limit)
    .flatMap((item) => {
      const normalized = normalizeCollectionItem(item, "playlist");
      return (normalized?.playlistId || normalized?.browseId) ? [normalized] : [];
    });
}

function getAudioUrlExpiry(audioUrl) {
  try {
    const expiry = Number.parseInt(new URL(audioUrl).searchParams.get("expire") || "", 10);
    if (expiry > Math.floor(Date.now() / 1000)) return expiry;
  } catch {}
  return Math.floor(Date.now() / 1000) + AUDIO_CACHE_MAX_AGE_SECONDS;
}

function mimeExtension(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "opus";
  return "mp3";
}

function audioCodec(mimeType) {
  const mime = text(mimeType);
  const match = mime.match(/codecs="([^"]+)"/i);
  if (match?.[1]) return match[1];

  const value = mime.toLowerCase();
  if (value.includes("opus")) return "opus";
  if (value.includes("mp4") || value.includes("m4a") || value.includes("aac")) return "mp4a.40.2";
  if (value.includes("vorbis")) return "vorbis";
  return "";
}

function audioCodecScore(mimeType) {
  const codec = audioCodec(mimeType).toLowerCase();
  if (codec.includes("opus")) return 4;
  if (codec.includes("mp4a") || codec.includes("aac")) return 3;
  if (codec.includes("vorbis")) return 2;
  return 1;
}

function audioQualityScore(value) {
  const quality = text(value).toLowerCase();
  if (quality.includes("high")) return 3;
  if (quality.includes("medium")) return 2;
  if (quality.includes("low")) return 1;
  return 0;
}

function audioContainerScore(mimeType) {
  const mime = text(mimeType).toLowerCase();
  if (mime.includes("webm")) return 3;
  if (mime.includes("mp4") || mime.includes("m4a")) return 2;
  if (mime.includes("ogg")) return 1;
  return 0;
}

function audioBitrate(format) {
  return Number(format?.average_bitrate || format?.bitrate || 0) || 0;
}

function audioContentLength(format) {
  return Number(format?.content_length || format?.contentLength || 0) || 0;
}

function compareAudioQuality(left, right) {
  const leftBitrate = audioBitrate(left);
  const rightBitrate = audioBitrate(right);
  if (leftBitrate !== rightBitrate) return leftBitrate - rightBitrate;

  const leftQuality = audioQualityScore(left?.audio_quality || left?.quality);
  const rightQuality = audioQualityScore(right?.audio_quality || right?.quality);
  if (leftQuality !== rightQuality) return leftQuality - rightQuality;

  const leftCodec = audioCodecScore(left?.mime_type || left?.mimeType);
  const rightCodec = audioCodecScore(right?.mime_type || right?.mimeType);
  if (leftCodec !== rightCodec) return leftCodec - rightCodec;

  const leftLength = audioContentLength(left);
  const rightLength = audioContentLength(right);
  if (leftLength !== rightLength) return leftLength - rightLength;

  return audioContainerScore(left?.mime_type || left?.mimeType) - audioContainerScore(right?.mime_type || right?.mimeType);
}

function shouldPreferMp4Audio(options = {}) {
  const platform = text(options.platform).toLowerCase();
  return platform === "ios" || platform === "iphone" || platform === "ipad";
}

function selectAudioFormat(formats, options = {}) {
  const audioOnly = formats.filter((format) => format?.has_audio && !format?.has_video);
  if (audioOnly.length === 0) return undefined;
  const preferred = shouldPreferMp4Audio(options)
    ? audioOnly.filter((format) => {
        const mime = text(format?.mime_type).toLowerCase();
        return mime.includes("mp4") || mime.includes("m4a");
      })
    : audioOnly;
  const candidates = preferred.length > 0 ? preferred : audioOnly;
  return candidates.reduce((best, current) => (
    compareAudioQuality(current, best) > 0 ? current : best
  ));
}

function getCachedAudioStream(videoId) {
  const cached = audioStreamCache.get(videoId);
  if (!cached) return null;
  if (cached._cacheUntil <= Math.floor(Date.now() / 1000)) {
    audioStreamCache.delete(videoId);
    return null;
  }
  audioStreamCache.delete(videoId);
  audioStreamCache.set(videoId, cached);
  const { _cacheUntil, ...stream } = cached;
  return stream;
}

function cacheAudioStream(videoId, stream) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(stream.expiresAt) || now + AUDIO_CACHE_MAX_AGE_SECONDS;
  const cacheUntil = Math.min(expiresAt - AUDIO_CACHE_EXPIRY_MARGIN_SECONDS, now + AUDIO_CACHE_MAX_AGE_SECONDS);
  if (cacheUntil <= now) return;

  audioStreamCache.set(videoId, { ...stream, _cacheUntil: cacheUntil });
  while (audioStreamCache.size > AUDIO_CACHE_MAX_ITEMS) {
    const oldest = audioStreamCache.keys().next().value;
    if (!oldest) break;
    audioStreamCache.delete(oldest);
  }
}

function verifyAudioResolverToken(req) {
  if (!AUDIO_RESOLVER_TOKEN) return;
  const provided = text(req.get("x-resolver-token") || req.query.token);
  if (provided !== AUDIO_RESOLVER_TOKEN) {
    throw httpError(403, "Invalid audio resolver token");
  }
}

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
];

let pipedIndex = 0;

async function tryPipedInstance(instance, videoId, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(`${instance}/streams/${videoId}`, {
    signal: controller.signal,
    headers: { "Accept": "application/json" },
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawStreams = (data.audioStreams || [])
    .filter((s) => s.url && s.mimeType && !s.videoOnly);
  const preferredStreams = shouldPreferMp4Audio(options)
    ? rawStreams.filter((s) => {
        const mime = text(s.mimeType).toLowerCase();
        return mime.includes("audio/mp4") || mime.includes("audio/m4a");
      })
    : rawStreams;
  const audioStreams = (preferredStreams.length > 0 ? preferredStreams : rawStreams)
    .sort((a, b) => compareAudioQuality(b, a));

  const best = audioStreams[0];

  if (!best) {
    throw new Error("no audio streams in response");
  }

  return {
    url: best.url,
    mimeType: (best.mimeType || "audio/mp4").split(";")[0].trim(),
    bitrateKbps: best.bitrate ? Math.round(best.bitrate / 1000) : null,
    duration: typeof data.duration === "number" ? data.duration : null,
  };
}

async function tryPipedWithRotation(videoId, options = {}, attempt = 0, errors = []) {
  if (attempt >= PIPED_INSTANCES.length) {
    console.warn(`[StreamResolver] All Piped instances failed for ${videoId}:`, errors);
    return null;
  }

  const instance = PIPED_INSTANCES[(pipedIndex + attempt) % PIPED_INSTANCES.length];
  try {
    const result = await tryPipedInstance(instance, videoId, options);
    pipedIndex = (pipedIndex + attempt + 1) % PIPED_INSTANCES.length;
    console.log(
      `[StreamResolver] Piped fallback resolved ${videoId} via ${instance} → ${result.mimeType}`
    );
    return result;
  } catch (err) {
    errors.push(`${instance}: ${err.message}`);
    return tryPipedWithRotation(videoId, options, attempt + 1, errors);
  }
}

function getAudioStreamCacheKey(videoId, options = {}) {
  return `${videoId}:${shouldPreferMp4Audio(options) ? "mp4" : "best"}`;
}

async function resolveViaPiped(videoId, options = {}) {
  return tryPipedWithRotation(videoId, options, 0, []);
}

async function resolveAudioStreamUncached(videoId, options = {}, cacheKey) {
  // 1. Try youtubei.js (InnerTube)
  try {
    const yt = await getYoutube();
    const info = await yt.music.getInfo(videoId, process.env.YOUTUBE_PO_TOKEN ? { po_token: process.env.YOUTUBE_PO_TOKEN } : undefined);
    const formats = [
      ...(info?.streaming_data?.formats || []),
      ...(info?.streaming_data?.adaptive_formats || []),
    ];
    const format = selectAudioFormat(formats, options);
    if (format) {
      const url = await format.decipher(yt.session.player);
      if (url && url.startsWith("https://")) {
        const mimeType = text(format.mime_type).split(";")[0] || "audio/mp4";
        const stream = {
          videoId,
          url,
          expiresAt: getAudioUrlExpiry(url),
          headers: {},
          formatId: String(format.itag || ""),
          extension: mimeExtension(mimeType),
          mimeType,
          audioCodec: audioCodec(text(format.mime_type)),
          bitrateKbps: Math.round(Number(format.average_bitrate || format.bitrate || 0) / 1000) || null,
          duration: Math.round(Number(format.approx_duration_ms || info?.basic_info?.duration || 0) / 1000) || info?.basic_info?.duration || null,
          contentLength: Number(format.content_length) || null,
        };
        cacheAudioStream(cacheKey, stream);
        return stream;
      }
    }
  } catch (err) {
    console.warn(`[StreamResolver] youtubei.js failed for ${videoId}:`, err.message);
  }

  // 2. Try Piped API as fallback
  try {
    const piped = await resolveViaPiped(videoId, options);
    if (piped?.url) {
      const stream = {
        videoId,
        url: piped.url,
        expiresAt: Math.floor(Date.now() / 1000) + 3 * 60 * 60, // 3-hour TTL for Piped
        headers: {},
        formatId: "piped",
        extension: mimeExtension(piped.mimeType),
        mimeType: piped.mimeType,
        audioCodec: audioCodec(piped.mimeType),
        bitrateKbps: piped.bitrateKbps,
        duration: piped.duration,
        contentLength: null,
      };
      cacheAudioStream(cacheKey, stream);
      return stream;
    }
  } catch (err) {
    console.warn(`[StreamResolver] Piped fallback failed for ${videoId}:`, err.message);
  }

  throw httpError(502, "All stream resolvers failed to resolve this video");
}

async function resolveAudioStream(videoId, options = {}) {
  const cacheKey = getAudioStreamCacheKey(videoId, options);
  const cached = getCachedAudioStream(cacheKey);
  if (cached) return cached;

  const pending = audioStreamRequests.get(cacheKey);
  if (pending) return pending;

  const request = resolveAudioStreamUncached(videoId, options, cacheKey)
    .finally(() => {
      audioStreamRequests.delete(cacheKey);
    });

  audioStreamRequests.set(cacheKey, request);
  return request;
}

async function resolveAudioStreamForRequest(req) {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) throw httpError(400, "Invalid YouTube video ID");
  verifyAudioResolverToken(req);
  return resolveAudioStream(videoId, {
    platform: req.query.platform,
  });
}

router.get("/healthz", asyncRoute(async (_req, res) => {
  const yt = await getYoutube();
  res.json({
    status: "ok",
    provider: "youtubei.js",
    lang: yt.session.lang,
    location: yt.session.context?.client?.gl,
    hasCookie: Boolean(process.env.YOUTUBE_COOKIE),
    hasPoToken: Boolean(process.env.YOUTUBE_PO_TOKEN),
  });
}));

router.get("/search", asyncRoute(async (req, res) => {
  const term = text(req.query.q || req.query.query);
  if (!term) throw httpError(400, "Missing search query");

  const limit = parsePositiveInt(req.query.limit, 20, 50);
  const type = mapFilterToType(req.query.filter);
  const yt = await getYoutube();
  const search = await yt.music.search(term, { type });
  const results = shelfItems(search, type)
    .slice(0, limit)
    .flatMap((item) => {
      const normalized = normalizeSearchItem(item, type);
      return normalized ? [normalized] : [];
    });

  res.json(results);
}));

router.get("/search/suggestions", asyncRoute(async (req, res) => {
  const term = text(req.query.q || req.query.query);
  if (!term) throw httpError(400, "Missing search query");

  const yt = await getYoutube();
  const sections = await yt.music.getSearchSuggestions(term);
  const suggestions = [];
  const seen = new Set();

  for (const section of sections || []) {
    for (const item of section?.contents || []) {
      const suggestion = text(item?.suggestion || item?.title || item?.endpoint?.payload?.query);
      if (!suggestion || seen.has(suggestion.toLowerCase())) continue;
      seen.add(suggestion.toLowerCase());
      suggestions.push(suggestion);
    }
  }

  res.json(suggestions);
}));

router.get("/song/:videoId", asyncRoute(async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) throw httpError(400, "Invalid YouTube video ID");

  const yt = await getYoutube();
  const info = await yt.music.getInfo(videoId);
  const basic = info?.basic_info || {};

  res.json({
    id: basic.id || videoId,
    videoId: basic.id || videoId,
    title: basic.title,
    duration: basic.duration,
    views: basic.view_count,
    author: basic.author,
    channelId: basic.channel_id,
    thumbnails: getThumbnails(basic.thumbnail),
    thumbnail: getThumbnails(basic.thumbnail)?.[0]?.url,
  });
}));

router.get("/playlist/:playlistId", asyncRoute(async (req, res) => {
  const playlistId = text(req.params.playlistId);
  if (!playlistId) throw httpError(400, "Missing playlist ID");
  const yt = await getYoutube();
  const playlist = await yt.music.getPlaylist(playlistId);
  res.json(normalizePlaylist(playlist, playlistId));
}));

router.get("/album/:albumId", asyncRoute(async (req, res) => {
  const albumId = text(req.params.albumId);
  if (!albumId) throw httpError(400, "Missing album ID");
  const yt = await getYoutube();
  const album = await yt.music.getAlbum(albumId);
  res.json(normalizeAlbum(album, albumId));
}));

router.get("/artist/:artistId", asyncRoute(async (req, res) => {
  const artistId = text(req.params.artistId).replace(/^youtube_/, "");
  if (!artistId) throw httpError(400, "Missing artist ID");
  const yt = await getYoutube();
  const artist = await yt.music.getArtist(artistId);
  res.json(normalizeArtist(artist, artistId));
}));

router.get("/watch/:videoId", asyncRoute(async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) throw httpError(400, "Invalid YouTube video ID");

  const limit = parsePositiveInt(req.query.limit, 25, 50);
  const radio = text(req.query.radio).toLowerCase() !== "false";
  const yt = await getYoutube();
  const upNext = await yt.music.getUpNext(videoId, radio);
  const tracks = (upNext?.contents || [])
    .flatMap((item) => {
      const track = normalizeTrack(item);
      return track ? [track] : [];
    })
    .slice(0, limit);

  res.json({
    tracks,
    playlistId: text(upNext?.playlist_id) || null,
  });
}));

router.get("/home", asyncRoute(async (req, res) => {
  const limit = parsePositiveInt(req.query.limit, 3, 10);
  const yt = await getYoutube();
  const home = await yt.music.getHomeFeed();
  const shelves = (home?.sections || [])
    .flatMap((section) => {
      const shelf = normalizeHomeShelf(section);
      return shelf ? [shelf] : [];
    })
    .slice(0, limit);

  res.json(shelves);
}));

router.get("/charts", asyncRoute(async (req, res) => {
  const country = text(req.query.country || "IN").toUpperCase();
  const suffix = country === "IN" ? "India" : country;
  const [daily, weekly] = await Promise.all([
    searchPlaylists(`${suffix} top songs chart`, 12),
    searchPlaylists(`${suffix} trending music playlist`, 12),
  ]);

  res.json({
    daily,
    weekly,
    videos: [],
    trending: daily,
    playlists: [...daily, ...weekly],
  });
}));

router.get("/audio/:videoId", asyncRoute(async (req, res) => {
  const stream = await resolveAudioStreamForRequest(req);
  res.json({ stream });
}));

router.get("/stream-info/:videoId", asyncRoute(async (req, res) => {
  const stream = await resolveAudioStreamForRequest(req);
  res.json({ stream });
}));

async function sendStream(req, res, headOnly = false) {
  const stream = await resolveAudioStreamForRequest(req);
  const headers = { ...DEFAULT_PLAYBACK_HEADERS };
  if (req.get("range")) headers.Range = req.get("range");

  const upstream = await fetch(stream.url, {
    method: headOnly ? "HEAD" : "GET",
    headers,
  });

  res.status(upstream.status);
  for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  if (!res.getHeader("content-type")) res.setHeader("content-type", stream.mimeType || "audio/mp4");
  res.setHeader("accept-ranges", res.getHeader("accept-ranges") || "bytes");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-disposition", `inline; filename="${stream.videoId}.${stream.extension || "m4a"}"`);

  if (headOnly || !upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

router.get("/stream/:videoId", asyncRoute((req, res) => sendStream(req, res, false)));
router.head("/stream/:videoId", asyncRoute((req, res) => sendStream(req, res, true)));

router.get("/moods", (_req, res) => res.json([]));
router.get("/mood-playlists", (_req, res) => res.json([]));
router.get("/mood-playlist/:params", (_req, res) => res.json([]));
router.get("/new-releases", (_req, res) => res.json([]));

export default router;
