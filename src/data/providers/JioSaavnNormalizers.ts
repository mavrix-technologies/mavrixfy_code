import type { JioSaavnImage, JioSaavnSong } from "@/lib/musicData";
import { compactMap, mapFilter } from "@/lib/arrayUtils";
import { toTrimmedString } from "@/utils/stringUtils";
import type {
  JioSaavnPlaylistResult,
  JioSaavnAlbumResult,
  JioSaavnPlaylistDetailsData,
} from "./JioSaavnTypes";

export async function consumeResponseBody(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // Best effort only
  }
}

export function dedupeByPlaylistId(playlists: JioSaavnPlaylistResult[]): JioSaavnPlaylistResult[] {
  const seen = new Set<string>();
  return playlists.filter((playlist) => {
    if (!playlist?.id || seen.has(playlist.id)) return false;
    seen.add(playlist.id);
    return true;
  });
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = toTrimmedString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function normalizeImageList(raw: unknown): JioSaavnImage[] {
  if (Array.isArray(raw)) {
    const normalized = mapFilter(
      raw,
      (item) => {
        if (typeof item === "string") {
          const url = item.trim();
          return url ? { quality: "", url } : null;
        }

        if (!item || typeof item !== "object") return null;
        const image = item as { quality?: unknown; url?: unknown; link?: unknown };
        const url = toTrimmedString(image.url) || toTrimmedString(image.link);
        if (!url) return null;
        return {
          quality: toTrimmedString(image.quality),
          url,
        };
      },
      (item): item is JioSaavnImage => Boolean(item)
    );

    if (normalized.length > 0) return normalized;
  }

  const direct = toTrimmedString(raw);
  if (!direct) return [];
  return [{ quality: "", url: direct }];
}

export function parseSongCountValue(raw: any): number {
  const candidates = [
    raw?.songCount,
    raw?.song_count,
    raw?.listCount,
    raw?.list_count,
    raw?.count,
    raw?.total,
    raw?.totalSongs,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  if (typeof raw?.songIds === "string") {
    let count = 0;
    for (const id of raw.songIds.split(",")) {
      if (id.trim()) count += 1;
    }
    return count;
  }

  return 0;
}

export function normalizeArtistList(
  raw: unknown
): { id: string; name: string; image: JioSaavnImage[]; url: string; role: string }[] {
  if (!Array.isArray(raw)) return [];

  return mapFilter(
    raw,
    (artist: any, index) => {
      const name = toTrimmedString(artist?.name);
      if (!name) return null;

      const id = toTrimmedString(artist?.id) || `artist_${index}_${name.replace(/\s+/g, "_").toLowerCase()}`;
      return {
        id,
        name,
        image: normalizeImageList(artist?.image),
        url: toTrimmedString(artist?.url),
        role: toTrimmedString(artist?.role),
      };
    },
    (artist): artist is { id: string; name: string; image: JioSaavnImage[]; url: string; role: string } =>
      Boolean(artist)
  );
}

export function getArtistNames(artists: ReturnType<typeof normalizeArtistList>): string[] {
  return compactMap(artists, (artist) => artist.name || null);
}

export function normalizeArtists(raw: any): JioSaavnSong["artists"] {
  const primary = normalizeArtistList(raw?.primary).map(({ id, name, image, url }) => ({
    id,
    name,
    image,
    url,
  }));
  const featured = normalizeArtistList(raw?.featured).map(({ id, name, image, url }) => ({
    id,
    name,
    image,
    url,
  }));
  const all = normalizeArtistList(raw?.all).map(({ id, name, image, url, role }) => ({
    id,
    name,
    role: role || "",
    image,
    url,
  }));

  if (primary.length > 0 || featured.length > 0 || all.length > 0) {
    return {
      primary,
      featured,
      all:
        all.length > 0
          ? all
          : [...primary, ...featured].map(({ id, name, image, url }) => ({
              id,
              name,
              role: "",
              image,
              url,
            })),
    };
  }

  const fallbackNames = [
    ...compactMap(toTrimmedString(raw?.primaryArtists).split(","), (entry) => entry.trim()),
    ...compactMap(toTrimmedString(raw?.primary_artists).split(","), (entry) => entry.trim()),
    ...compactMap(toTrimmedString(raw?.artist).split(","), (entry) => entry.trim()),
    ...compactMap(toTrimmedString(raw?.singers).split(","), (entry) => entry.trim()),
  ];

  const fallbackUnique = Array.from(new Set(fallbackNames));
  const fallbackPrimary = fallbackUnique.map((name, index) => ({
    id: `artist_${index}_${name.replace(/\s+/g, "_").toLowerCase()}`,
    name,
    image: [],
    url: "",
  }));

  return {
    primary: fallbackPrimary,
    featured: [],
    all: fallbackPrimary.map(({ id, name, image, url }) => ({
      id,
      name,
      role: "",
      image,
      url,
    })),
  };
}

export function normalizePlaylistList(raw: unknown): JioSaavnPlaylistResult[] {
  if (!Array.isArray(raw)) return [];

  return mapFilter(
    raw,
    (playlist: any) => {
      const id =
        toTrimmedString(playlist?.id) ||
        toTrimmedString(playlist?.listid) ||
        toTrimmedString(playlist?.playlistid);
      const name = toTrimmedString(playlist?.name) || toTrimmedString(playlist?.title);
      const image = normalizeImageList(
        playlist?.image ?? playlist?.images ?? playlist?.imageUrl ?? playlist?.image_url
      );
      const parsedSongCount = parseSongCountValue(playlist);
      const songCount = parsedSongCount > 0 ? parsedSongCount : 10;
      const language =
        toTrimmedString(playlist?.language) ||
        toTrimmedString(playlist?.lang) ||
        toTrimmedString(playlist?.more_info?.language) ||
        toTrimmedString(playlist?.more_info?.lang);

      return {
        id,
        name,
        image,
        songCount,
        language: language || undefined,
      };
    },
    (playlist) => {
      if (!playlist.id || !playlist.name) return false;
      const lowerName = playlist.name.toLowerCase();
      const lowerLang = playlist.language?.toLowerCase() || "";

      if (
        lowerLang === "urdu" ||
        lowerName.includes("urdu") ||
        lowerName.includes("pakistani") ||
        lowerName.includes("peshawar") ||
        lowerName.includes("karachi")
      ) {
        return false;
      }

      const unwantedLangs = ["arabic", "spanish", "french", "portuguese", "turkish", "persian", "farsi"];
      if (unwantedLangs.includes(lowerLang)) {
        return false;
      }

      if (
        lowerName.includes("recommended for you") ||
        lowerName.includes("fresh discoveries")
      ) {
        return false;
      }
      return true;
    }
  );
}

export function parsePlaylistSearchResponse(json: any): JioSaavnPlaylistResult[] {
  if (!json) return [];

  const candidates = [
    json?.data?.results,
    json?.data?.playlists?.results,
    json?.data?.playlists,
    json?.results,
    json?.playlists?.results,
    json?.playlists,
    json?.data,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlaylistList(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

export function getAlbumArtistLabel(raw: any): string {
  const direct = [
    toTrimmedString(raw?.primaryArtists),
    toTrimmedString(raw?.primary_artists),
    toTrimmedString(raw?.artist),
    toTrimmedString(raw?.subtitle),
  ].find(Boolean);
  if (direct) return direct;

  const primary = normalizeArtistList(raw?.artists?.primary);
  const primaryNames = getArtistNames(primary);
  if (primaryNames.length > 0) return primaryNames.join(", ");

  const all = normalizeArtistList(raw?.artists?.all);
  const allNames = Array.from(new Set(getArtistNames(all)));
  return allNames.slice(0, 3).join(", ");
}

export function normalizeAlbumList(raw: unknown): JioSaavnAlbumResult[] {
  if (!Array.isArray(raw)) return [];

  return mapFilter(
    raw,
    (album: any) => {
      const id =
        toTrimmedString(album?.id) ||
        toTrimmedString(album?.albumId) ||
        toTrimmedString(album?.albumid) ||
        toTrimmedString(album?._id);
      const name = toTrimmedString(album?.name) || toTrimmedString(album?.title);
      const image = normalizeImageList(
        album?.image ?? album?.images ?? album?.imageUrl ?? album?.image_url
      );

      return {
        id,
        name,
        image,
        songCount: parseSongCountValue(album),
        year: toTrimmedString(album?.year) || undefined,
        language: toTrimmedString(album?.language) || toTrimmedString(album?.lang) || undefined,
        url: toTrimmedString(album?.url) || toTrimmedString(album?.perma_url) || undefined,
        artist: getAlbumArtistLabel(album) || undefined,
        description: toTrimmedString(album?.description) || undefined,
      };
    },
    (album) => Boolean(album.id && album.name)
  );
}

export function parseAlbumSearchResponse(json: any): JioSaavnAlbumResult[] {
  if (!json) return [];

  const candidates = [
    json?.data?.results,
    json?.data?.albums?.results,
    json?.data?.albums,
    json?.results,
    json?.albums?.results,
    json?.albums,
    json?.data,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAlbumList(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

export function normalizePlaylistSong(raw: any): JioSaavnSong | null {
  if (!raw || typeof raw !== "object") return null;

  const id =
    toTrimmedString(raw?.id) ||
    toTrimmedString(raw?.songid) ||
    toTrimmedString(raw?.songId) ||
    toTrimmedString(raw?._id);
  const name = toTrimmedString(raw?.name) || toTrimmedString(raw?.title) || toTrimmedString(raw?.song);
  if (!id || !name) return null;

  const albumRaw = raw?.album;
  const albumName =
    typeof albumRaw === "string"
      ? toTrimmedString(albumRaw)
      : toTrimmedString(albumRaw?.name) || toTrimmedString(raw?.more_info?.album);
  const albumId =
    typeof albumRaw === "string"
      ? ""
      : toTrimmedString(albumRaw?.id) || toTrimmedString(raw?.more_info?.album_id);
  const albumUrl =
    typeof albumRaw === "string"
      ? ""
      : toTrimmedString(albumRaw?.url) || toTrimmedString(raw?.more_info?.album_url);

  const downloadUrlCandidate =
    raw?.downloadUrl ??
    raw?.download_url ??
    raw?.more_info?.downloadUrl ??
    raw?.more_info?.download_url;
  const audioUrlCandidate =
    raw?.audioUrl ??
    raw?.audio_url ??
    raw?.media_url ??
    raw?.more_info?.media_url ??
    raw?.more_info?.preview_url;

  const durationValue = Number(raw?.duration ?? raw?.more_info?.duration ?? 0);

  return {
    id,
    name,
    type: toTrimmedString(raw?.type) || "song",
    year: toTrimmedString(raw?.year) || toTrimmedString(raw?.release_date),
    duration: Number.isFinite(durationValue) ? Math.max(0, durationValue) : 0,
    language: toTrimmedString(raw?.language) || toTrimmedString(raw?.lang),
    album: {
      id: albumId,
      name: albumName,
      url: albumUrl,
    },
    artists: normalizeArtists(raw?.artists ?? raw?.artistMap ?? raw),
    image: normalizeImageList(
      raw?.image ??
        raw?.images ??
        raw?.image_url ??
        raw?.imageUrl ??
        raw?.more_info?.image ??
        raw?.more_info?.albumArt
    ),
    downloadUrl: downloadUrlCandidate ?? audioUrlCandidate,
    audioUrl: audioUrlCandidate ?? downloadUrlCandidate,
    url: toTrimmedString(raw?.url) || toTrimmedString(raw?.perma_url),
  };
}

export function normalizePlaylistDetailsData(raw: any): JioSaavnPlaylistDetailsData | null {
  if (!raw || typeof raw !== "object") return null;
  const id =
    toTrimmedString(raw?.id) ||
    toTrimmedString(raw?.listid) ||
    toTrimmedString(raw?.playlistid);
  const name = toTrimmedString(raw?.name) || toTrimmedString(raw?.title);
  if (!id || !name) return null;

  const songArrays = [
    raw?.songs,
    raw?.list,
    raw?.results,
    raw?.tracks,
    raw?.data?.songs,
    raw?.data?.results,
  ];
  let selectedSongArray: unknown[] = [];
  for (const candidate of songArrays) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      selectedSongArray = candidate;
      break;
    }
  }

  const songs = mapFilter(
    selectedSongArray,
    (song) => normalizePlaylistSong(song),
    (song): song is JioSaavnSong => Boolean(song)
  );
  const songCount = parseSongCountValue(raw) || songs.length;
  const imageValue = raw?.image ?? raw?.images ?? raw?.imageUrl ?? raw?.image_url;
  const normalizedImage = normalizeImageList(imageValue);

  return {
    id,
    name,
    description: toTrimmedString(raw?.description) || toTrimmedString(raw?.subtitle) || undefined,
    type: toTrimmedString(raw?.type) || undefined,
    year: toTrimmedString(raw?.year) || undefined,
    playCount: Number(raw?.playCount || raw?.play_count || 0) || undefined,
    language: toTrimmedString(raw?.language) || toTrimmedString(raw?.lang) || undefined,
    explicitContent: parseBoolean(raw?.explicitContent ?? raw?.explicit_content),
    songCount,
    url: toTrimmedString(raw?.url) || toTrimmedString(raw?.perma_url) || undefined,
    image: normalizedImage.length > 0 ? normalizedImage : toTrimmedString(imageValue),
    songs,
  };
}

export function parsePlaylistDetailsResponse(json: any): JioSaavnPlaylistDetailsData | null {
  if (!json) return null;

  const candidates: unknown[] = [
    json?.data?.playlist,
    json?.data?.results?.[0],
    json?.data?.results,
    json?.data,
    json?.playlist,
    json?.results?.[0],
    json?.results,
    json?.result,
    json,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlaylistDetailsData(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function buildImagesFromSingleUrl(imageUrl: string): JioSaavnImage[] {
  if (!imageUrl) return [];
  const match = imageUrl.match(/([-_])(50x50|150x150|500x500)\.jpg/);
  if (match) {
    const sep = match[1];
    const cleanUrl = imageUrl.replace(/[-_](50x50|150x150|500x500)\.jpg/, ".jpg");
    const urlWithoutParams = cleanUrl.split("?")[0];
    const params = cleanUrl.includes("?") ? "?" + cleanUrl.split("?")[1] : "";
    const base = urlWithoutParams.replace(/\.jpg$/, "");
    return [
      { quality: "50x50", url: `${base}${sep}50x50.jpg${params}` },
      { quality: "150x150", url: `${base}${sep}150x150.jpg${params}` },
      { quality: "500x500", url: `${base}${sep}500x500.jpg${params}` },
    ];
  }
  return [
    { quality: "50x50", url: imageUrl },
    { quality: "150x150", url: imageUrl },
    { quality: "500x500", url: imageUrl },
  ];
}

export function mapHomepageItemToPlaylistResult(item: any): JioSaavnPlaylistResult {
  const isSong = item.type === "song";
  const isAlbum = item.type === "album" || item.type === "album_playlist";

  const name =
    (typeof item.title === "string" ? item.title : item.title?.text) ||
    item.name ||
    "Untitled";

  const rawPath =
    item.perma_url ||
    item.url ||
    (typeof item.title === "object" ? item.title?.action : "") ||
    item.action ||
    "";
  const url = rawPath.startsWith("/") ? `https://www.jiosaavn.com${rawPath}` : rawPath;

  let imageList: JioSaavnImage[];
  if (Array.isArray(item.image) && item.image.length > 0) {
    const first = item.image[0];
    if (typeof first === "object" && (first.url || first.link)) {
      imageList = item.image.map((img: any) => ({
        quality: img.quality || "500x500",
        url: img.url || img.link || "",
      }));
    } else {
      imageList = buildImagesFromSingleUrl(first);
    }
  } else {
    imageList = buildImagesFromSingleUrl(
      typeof item.image === "string" ? item.image : ""
    );
  }

  let description = "";
  if (typeof item.subtitle === "string" && item.subtitle) {
    description = item.subtitle;
  } else if (Array.isArray(item.be_subtitle) && item.be_subtitle.length > 0) {
    description = item.be_subtitle[0]?.text || "";
  } else if (Array.isArray(item.subtitle) && item.subtitle.length > 0) {
    description = item.subtitle.map((s: any) => s.text || "").join(", ");
  }

  return {
    id: item.id,
    name,
    image: imageList,
    songCount: isSong ? 1 : Number(item.songCount || item.song_count || item.count || 5),
    url,
    description,
    language: item.language || "hindi",
    type: isSong ? "song" : isAlbum ? "album" : "playlist",
  };
}
