import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type HomeHeroConfig = {
  enabled: boolean;
  title: string;
  videoUrl: string;
  posterUrl: string;
  adUnitId?: string;
  adSlotEnabled?: boolean;
  items: HomeHeroVideoItem[];
};

export type HomeHeroLinkedSong = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
  genre: string;
};

export type HomeHeroVideoItem = {
  id: string;
  kind?: "video" | "ad";
  enabled: boolean;
  title: string;
  videoUrl: string;
  posterUrl: string;
  adUnitId?: string;
  linkUrl: string;
  songId: string;
  song: HomeHeroLinkedSong | null;
  linkType?: 'song' | 'album' | 'playlist';
  album?: any | null;
  playlist?: any | null;
};

export const DEFAULT_HOME_HERO_CONFIG: HomeHeroConfig = {
  enabled: true,
  title: "COCKTAIL 2",
  videoUrl:
    "https://res.cloudinary.com/djqq8kba8/video/upload/f_mp4,vc_h264,c_crop,g_center,w_1440,h_810/c_fill,w_1080,h_608,q_auto:good/v1780900137/Cocktail_2_Official_Trailer___Shahid_Kapoor_Kriti_Sanon_Rashmika_Mandanna___In_Cinemas_19th_June_1440p_dwlaum.mp4",
  posterUrl:
    "https://res.cloudinary.com/djqq8kba8/video/upload/so_2,c_crop,g_center,w_1440,h_810/c_fill,w_1080,h_608,q_auto,f_jpg/v1780900137/Cocktail_2_Official_Trailer___Shahid_Kapoor_Kriti_Sanon_Rashmika_Mandanna___In_Cinemas_19th_June_1440p_dwlaum.jpg",
  adUnitId: "",
  adSlotEnabled: false,
  items: [
    {
      id: "default-home-video",
      kind: "video",
      enabled: true,
      title: "COCKTAIL 2",
      videoUrl:
        "https://res.cloudinary.com/djqq8kba8/video/upload/f_mp4,vc_h264,c_crop,g_center,w_1440,h_810/c_fill,w_1080,h_608,q_auto:good/v1780900137/Cocktail_2_Official_Trailer___Shahid_Kapoor_Kriti_Sanon_Rashmika_Mandanna___In_Cinemas_19th_June_1440p_dwlaum.mp4",
      posterUrl:
        "https://res.cloudinary.com/djqq8kba8/video/upload/so_2,c_crop,g_center,w_1440,h_810/c_fill,w_1080,h_608,q_auto,f_jpg/v1780900137/Cocktail_2_Official_Trailer___Shahid_Kapoor_Kriti_Sanon_Rashmika_Mandanna___In_Cinemas_19th_June_1440p_dwlaum.jpg",
      linkUrl: "",
      songId: "",
      song: null,
      linkType: 'song',
      album: null,
      playlist: null,
    },
  ],
};

export const DISABLED_HOME_HERO_CONFIG: HomeHeroConfig = {
  ...DEFAULT_HOME_HERO_CONFIG,
  enabled: false,
  adUnitId: "",
  adSlotEnabled: false,
  items: [],
};

const HOME_HERO_CONFIG_REF = doc(db, "appConfig", "homeHero");

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value: unknown): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function normalizeLinkedSong(value: unknown): HomeHeroLinkedSong | null {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = toTrimmedString(record.id);
  const title = toTrimmedString(record.title);
  const audioUrl = toTrimmedString(record.audioUrl);

  if (!id || !title || !audioUrl) return null;

  return {
    id,
    title,
    artist: toTrimmedString(record.artist) || "Unknown Artist",
    album: toTrimmedString(record.album),
    duration: toFiniteNumber(record.duration),
    coverUrl: toTrimmedString(record.coverUrl) || toTrimmedString(record.imageUrl),
    audioUrl,
    genre: toTrimmedString(record.genre),
  };
}

function normalizeVideoItem(value: unknown, index: number): HomeHeroVideoItem | null {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const videoUrl = toTrimmedString(record.videoUrl);
  const adUnitId = toTrimmedString(record.adUnitId);
  const kind = record.kind === "ad" || (!videoUrl && adUnitId) ? "ad" : "video";
  if (kind === "ad" && !adUnitId) return null;
  if (kind === "video" && !videoUrl) return null;

  const linkedSong = normalizeLinkedSong(record.song);
  const songId = toTrimmedString(record.songId) || linkedSong?.id || "";

  return {
    id: toTrimmedString(record.id) || `home-video-${index + 1}`,
    kind,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    title: toTrimmedString(record.title) || (kind === "ad" ? "Sponsored" : DEFAULT_HOME_HERO_CONFIG.title),
    videoUrl: kind === "ad" ? "" : videoUrl,
    posterUrl: kind === "ad" ? "" : toTrimmedString(record.posterUrl),
    adUnitId: kind === "ad" ? adUnitId : "",
    linkUrl: toTrimmedString(record.linkUrl),
    songId: kind === "ad" ? "" : songId,
    song: kind === "ad" ? null : linkedSong,
    linkType: (record.linkType === 'song' || record.linkType === 'album' || record.linkType === 'playlist') ? record.linkType : 'song',
    album: kind === "ad" ? null : record.album || null,
    playlist: kind === "ad" ? null : record.playlist || null,
  };
}

function buildHomeHeroAdItem(adUnitId: string, enabled = true): HomeHeroVideoItem {
  return {
    id: "home-native-video-ad",
    kind: "ad",
    enabled,
    title: "Sponsored",
    videoUrl: "",
    posterUrl: "",
    adUnitId,
    linkUrl: "",
    songId: "",
    song: null,
    linkType: "song",
    album: null,
    playlist: null,
  };
}

function normalizeHomeHeroConfig(data: unknown): HomeHeroConfig {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const title = toTrimmedString(record.title) || DEFAULT_HOME_HERO_CONFIG.title;
  const videoUrl = toTrimmedString(record.videoUrl) || DEFAULT_HOME_HERO_CONFIG.videoUrl;
  const posterUrl = toTrimmedString(record.posterUrl) || DEFAULT_HOME_HERO_CONFIG.posterUrl;
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const legacyItemAdUnitId = rawItems
    .map((item) => (item && typeof item === "object" ? toTrimmedString((item as Record<string, unknown>).adUnitId) : ""))
    .find(Boolean) || "";
  const adUnitId = toTrimmedString(record.adUnitId) || legacyItemAdUnitId;
  const adSlotEnabled =
    typeof record.adSlotEnabled === "boolean" ? record.adSlotEnabled : Boolean(adUnitId);
  const configuredItems = Array.isArray(record.items)
    ? record.items
        .map((item, index) => normalizeVideoItem(item, index))
        .filter((item): item is HomeHeroVideoItem => Boolean(item))
    : [];
  const fallbackItems = [
    {
      ...DEFAULT_HOME_HERO_CONFIG.items[0],
      id: "home-video-1",
      kind: "video" as const,
      title,
      videoUrl,
      posterUrl,
      adUnitId: "",
    },
  ];
  const baseItems = configuredItems.length > 0 ? configuredItems : fallbackItems;
  const adFilteredBaseItems = adSlotEnabled ? baseItems : baseItems.filter((item) => item.kind !== "ad");
  const sourceItems = adFilteredBaseItems.length > 0 ? adFilteredBaseItems : fallbackItems;
  const hasAdItem = sourceItems.some((item) => item.kind === "ad");
  const items =
    adSlotEnabled && adUnitId && !hasAdItem
      ? [...sourceItems, buildHomeHeroAdItem(adUnitId)]
      : sourceItems;
  const firstVisibleVideoItem =
    items.find((item) => item.enabled && item.kind !== "ad") ||
    items.find((item) => item.kind !== "ad") ||
    fallbackItems[0];

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_HOME_HERO_CONFIG.enabled,
    title: firstVisibleVideoItem.title || title,
    videoUrl: firstVisibleVideoItem.videoUrl || videoUrl,
    posterUrl: firstVisibleVideoItem.posterUrl || posterUrl,
    adUnitId,
    adSlotEnabled,
    items,
  };
}

export async function getHomeHeroConfig(): Promise<HomeHeroConfig> {
  try {
    const snapshot = await getDoc(HOME_HERO_CONFIG_REF);
    return snapshot.exists() ? normalizeHomeHeroConfig(snapshot.data()) : DEFAULT_HOME_HERO_CONFIG;
  } catch {
    return DEFAULT_HOME_HERO_CONFIG;
  }
}

export function subscribeHomeHeroConfig(onChange: (config: HomeHeroConfig) => void): () => void {
  return onSnapshot(
    HOME_HERO_CONFIG_REF,
    (snapshot) => {
      onChange(snapshot.exists() ? normalizeHomeHeroConfig(snapshot.data()) : DISABLED_HOME_HERO_CONFIG);
    },
    () => {
      onChange(DISABLED_HOME_HERO_CONFIG);
    }
  );
}

export async function saveHomeHeroConfig(config: HomeHeroConfig, updatedBy?: string): Promise<void> {
  const normalized = normalizeHomeHeroConfig(config);
  await setDoc(
    HOME_HERO_CONFIG_REF,
    {
      ...normalized,
      schemaVersion: 3,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy || null,
    },
    { merge: true }
  );
}
