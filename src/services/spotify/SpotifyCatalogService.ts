import type { Song } from "@/lib/musicData";
import type { AlbumResult, ArtistResult, PlaylistResult } from "@/lib/searchRepository";
import { fetchAppApi } from "@/lib/api-config";

export function isAudioPreviewUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const l = url.toLowerCase();
  return (
    l.includes("preview.m4a") ||
    l.includes("audiopreview") ||
    l.includes("p.scdn.co/mp3-preview") ||
    l.includes("/preview/") ||
    (l.includes("itunes.apple.com") && l.includes("preview"))
  );
}

export interface SpotifyPreset {
  id: string;
  spotifyId?: string;
  name: string;
  description: string;
  coverUrl: string;
  query: string;
  songCount?: number;
  category?: string;
}

export interface SpotifyPodcast {
  id: string;
  title: string;
  description: string;
  publisher: string;
  query: string;
  coverUrl: string;
}

export const SPOTIFY_PRESETS: SpotifyPreset[] = [
  // --- OFFICIAL SPOTIFY CHARTS ---
  {
    id: "pl_trending_india",
    spotifyId: "37i9dQZF1DXbVhgADFy3im",
    name: "Trending Now India",
    description: "Every track on this playlist is buzzing in India right now.",
    query: "Trending Now India Bollywood Hits",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002b30d7e201b1c0085357deb4a",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_hot_hits_hindi",
    spotifyId: "37i9dQZF1DX0XUfTFmNBRM",
    name: "Hot Hits Hindi",
    description: "The biggest Bollywood & Hindi cinema hits right now.",
    query: "Hot Hits Hindi Arijit Singh Pritam",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002cdb9f3aa5daf93253b072a55",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_top_50_india",
    spotifyId: "37i9dQZEVXbLZ52XmnySJg",
    name: "Top 50 - India",
    description: "Your daily update of the most played tracks right now - India.",
    query: "Top 50 India",
    coverUrl: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_in_default.jpg",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_top50_india",
    spotifyId: "37i9dQZEVXbLZ52XmnySJg",
    name: "Top 50 - India",
    description: "Your daily update of the most played tracks right now - India.",
    query: "Top 50 India",
    coverUrl: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_in_default.jpg",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_top_50_global",
    spotifyId: "37i9dQZEVXbMDoHDwVN2tF",
    name: "Top 50 - Global",
    description: "Your daily update of the most played tracks right now - Global.",
    query: "Top 50 Global",
    coverUrl: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_global_default.jpg",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_top50_global",
    spotifyId: "37i9dQZEVXbMDoHDwVN2tF",
    name: "Top 50 - Global",
    description: "Your daily update of the most played tracks right now - Global.",
    query: "Top 50 Global",
    coverUrl: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_global_default.jpg",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_viral_50_india",
    spotifyId: "37i9dQZEVXbLiRSasKsNU9",
    name: "Viral 50 - India",
    description: "Your daily update of the most viral tracks right now - India.",
    query: "Viral Hits India",
    coverUrl: "https://charts-images.scdn.co/assets/locale_en/viral/daily/region_in_default.jpg",
    songCount: 50,
    category: "charts",
  },
  {
    id: "pl_viral50_india",
    spotifyId: "37i9dQZEVXbLiRSasKsNU9",
    name: "Viral 50 - India",
    description: "Your daily update of the most viral tracks right now - India.",
    query: "Viral Hits India",
    coverUrl: "https://charts-images.scdn.co/assets/locale_en/viral/daily/region_in_default.jpg",
    songCount: 50,
    category: "charts",
  },

  // --- HITS & POPULAR ---
  {
    id: "pl_bollywood_central",
    spotifyId: "37i9dQZF1DWXtlo6ENS92N",
    name: "Bollywood Central",
    description: "Your central hub for Bollywood blockbuster anthems.",
    query: "Bollywood Central Ranbir Kapoor Songs",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002fc392f1c1d0f9a1148b9fb8b",
    songCount: 65,
    category: "hits",
  },
  {
    id: "pl_hot_hits_punjabi",
    spotifyId: "37i9dQZF1DWXVJK4aT7pmk",
    name: "Hot Hits Punjabi",
    description: "The hottest tracks in Punjabi music right now.",
    query: "Hot Hits Punjabi Diljit Karan Aujla AP Dhillon",
    coverUrl: "https://i.scdn.co/image/ab67706f000000028585020686db2e3afb0791f8",
    songCount: 50,
    category: "hits",
  },
  {
    id: "pl_mega_punjabi",
    spotifyId: "37i9dQZF1DX29AbHCRoac8",
    name: "Mega Punjabi Hits",
    description: "Mega Punjabi anthems dominating Spotify charts.",
    query: "Mega Punjabi Hits Shubh AP Dhillon",
    coverUrl: "https://i.scdn.co/image/ab67706f000000029ec61175e1fe7acf4e2867f6",
    songCount: 45,
    category: "hits",
  },
  {
    id: "pl_house_party",
    spotifyId: "37i9dQZF1DX9xdJ1j2eMr3",
    name: "House Party Hits",
    description: "Turn up the volume with the ultimate Indian party bangers.",
    query: "House Party Hits Bollywood Punjabi",
    coverUrl: "https://i.scdn.co/image/ab67706f000000022468362accf60bcfadaf4916",
    songCount: 60,
    category: "hits",
  },
  {
    id: "pl_bollywood_dance",
    spotifyId: "37i9dQZF1DX8xfQRRX1PDm",
    name: "Bollywood Dance Music",
    description: "Electrifying Bollywood dance, club remixes, and party anthems.",
    query: "Bollywood Dance Music Party Hits",
    coverUrl: "https://i.scdn.co/image/ab67706f0000000299e454572d0578183d97ecc2",
    songCount: 55,
    category: "hits",
  },
  {
    id: "pl_all_out_00s",
    spotifyId: "37i9dQZF1DWZNJXX2UeBij",
    name: "All Out 00s Hindi",
    description: "The defining Bollywood tracks from 2000 to 2009.",
    query: "All Out 00s Hindi KK Pritam",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002c4eeffa35b610f28592c6950",
    songCount: 75,
    category: "hits",
  },
  {
    id: "pl_bollywood_mush",
    spotifyId: "37i9dQZF1DXdpQPPZq3F7n",
    name: "Bollywood Mush",
    description: "Heartfelt, romantic and acoustic Bollywood love songs.",
    query: "Bollywood Mush Romantic Love Arijit",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002087eaebce35bd015db2942e0",
    songCount: 50,
    category: "hits",
  },
  {
    id: "pl_indie_india",
    spotifyId: "37i9dQZF1DX5q67ZpWyRrZ",
    name: "Indie India",
    description: "Best of the Indian independent music scene.",
    query: "Indie India Anuv Jain Prateek Kuhad",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002656f14776fbb39aa2ae900f0",
    songCount: 50,
    category: "hits",
  },

  // --- MADE FOR YOU & MIXES ---
  {
    id: "pl_daily_mix_1",
    name: "Daily Mix 1",
    description: "Arijit Singh, Pritam, Sachin-Jigar and romantic Bollywood favorites.",
    query: "Arijit Singh Romance",
    coverUrl: "https://dailymix-images.scdn.co/v2/img/ab6761610000e5ebcb6926f44f620555ba444fca/1/en/default",
    songCount: 50,
    category: "made_for_you",
  },
  {
    id: "pl_daily_mix_2",
    name: "Daily Mix 2",
    description: "AP Dhillon, Shubh, Karan Aujla and fresh Punjabi powerhouse anthems.",
    query: "AP Dhillon Punjabi",
    coverUrl: "https://dailymix-images.scdn.co/v2/img/ab6761610000e5eb0261696c5df3be99da6ed3f3/2/en/default",
    songCount: 50,
    category: "made_for_you",
  },
  {
    id: "pl_daily_mix_3",
    name: "Daily Mix 3",
    description: "Badshah, Diljit Dosanjh, Yo Yo Honey Singh high energy party tracks.",
    query: "Badshah Party",
    coverUrl: "https://dailymix-images.scdn.co/v2/img/ab6761610000e5ebcb6926f44f620555ba444fca/3/en/default",
    songCount: 50,
    category: "made_for_you",
  },
  {
    id: "pl_daily_mix_4",
    name: "Daily Mix 4",
    description: "Atif Aslam, KK, Mohit Chauhan 2000s Bollywood soulful nostalgia.",
    query: "Atif Aslam Hits",
    coverUrl: "https://dailymix-images.scdn.co/v2/img/ab6761610000e5ebcb6926f44f620555ba444fca/4/en/default",
    songCount: 50,
    category: "made_for_you",
  },
  {
    id: "pl_discover_weekly",
    spotifyId: "37i9dQZEVXcS9OOihckwqC",
    name: "Discover Weekly",
    description: "Your weekly mixtape of fresh music. Handpicked for you every Monday.",
    query: "Bollywood Acoustic",
    coverUrl: "https://pickasso.spotifycdn.com/image/ab67c0de0000deef/dt/v1/img/dw/cover/en",
    songCount: 30,
    category: "made_for_you",
  },
  {
    id: "pl_release_radar",
    spotifyId: "37i9dQZEVXbkGhcXkBJxrA",
    name: "Release Radar",
    description: "Catch all the latest music from artists you follow, updated every Friday.",
    query: "New Hindi Songs",
    coverUrl: "https://pickasso.spotifycdn.com/image/ab67c0de0000bada/dt/v1/img/release-radar-v4/1wRPtKGflJrBx9BmLsSwlU/en",
    songCount: 30,
    category: "made_for_you",
  },
  {
    id: "pl_radar_india",
    spotifyId: "37i9dQZF1DWTAtTdFMiJYK",
    name: "RADAR India",
    description: "Discover the most exciting emerging artists from India.",
    query: "Indie Pop Hindi",
    coverUrl: "https://i.scdn.co/image/ab67706f000000020bbf9f4165316179e75ec63b",
    songCount: 40,
    category: "made_for_you",
  },

  // --- USER LIBRARY CLASSICS (from E:\ria) ---
  {
    id: "pl_satvik",
    spotifyId: "3iLU1K5QNgKz7R5y4qA4hC",
    name: "Satvik's",
    description: "Personal mix • Raabta, Shiddat, Toofan, AP Dhillon • 95 songs",
    query: "Raabta Arijit Singh Shiddat",
    coverUrl: "https://mosaic.scdn.co/640/ab67616d00001e021bcc10d3bd1d77d7c3f164c6ab67616d00001e02e4c77dc1b6c85c754f7f136cab67616d00001e02e810a88d506b30bdc0935247ab67616d00001e02eeb2de3c7773e8caa97f50bc",
    songCount: 95,
    category: "user_library",
  },
  {
    id: "pl_soulful",
    spotifyId: "2YzAWDQdXg2eO1BKp2UHA7",
    name: "Soulful",
    description: "Darshan Raval, Arijit Singh, AKASH MEHTA, Animal, Pehle Bhi Main • 93 songs",
    query: "Saathiya Darshan Raval Fitratein Arijit",
    coverUrl: "https://mosaic.scdn.co/640/ab67616d00001e0289bfe45fc54eb733eeab9a84ab67616d00001e028ad59c9012817d9889e1aaa7ab67616d00001e02c38bd1ecacc11b9ac9d080a9ab67616d00001e02dbd34fb6c8a7451502ef67c7",
    songCount: 93,
    category: "user_library",
  },
  {
    id: "pl_morning",
    spotifyId: "3Bp6my2rNlNDrvUvMbSuFI",
    name: "Morning fresh song🥰🥳",
    description: "Start your morning with fresh energy, upbeat vibe and feel good songs • 24 songs",
    query: "Sooraj Dooba Hain Love You Zindagi Amit Trivedi",
    coverUrl: "https://mosaic.scdn.co/640/ab67616d00001e021aac2079e5047e1bfd1b59d9ab67616d00001e021efbf8b77e571388b3520f72ab67616d00001e02ee0561696308231816aadac2ab67616d00001e02f6371011af4c82fb31d54820",
    songCount: 24,
    category: "user_library",
  },
  {
    id: "pl_travel_hindi",
    spotifyId: "3IpDoXyKOPgxJvUJYsagyM",
    name: "Travel Songs (Hindi)",
    description: "Bollywood Roadtrip Hindi | Best Indie Travels | Safarnama Vibes",
    query: "Safarnama Travel Hindi Bollywood Roadtrip",
    coverUrl: "https://image-cdn-fa.spotifycdn.com/image/ab67706c0000da8404fd89ab8064c32896fd0cdc",
    songCount: 40,
    category: "user_library",
  },
  {
    id: "pl_old_is_gold",
    spotifyId: "5CaulKIxLU74q6HYBEQkku",
    name: "Old is gold 🍷",
    description: "Timeless classic retro Hindi Bollywood melodies and golden era hits.",
    query: "Old Is Gold Kishore Kumar RD Burman Lata Mangeshkar",
    coverUrl: "https://mosaic.scdn.co/640/ab67616d00001e022f4210662c10380e7d836877ab67616d00001e02693987fce50b63a3fa03bbcbab67616d00001e027f282faaba2272a127bbf41fab67616d00001e02fbb0937acbbb0ae0ac8c21eb",
    songCount: 60,
    category: "user_library",
  },
  {
    id: "pl_party_songs",
    spotifyId: "5n5jp4oJ28cbmGaf8N4Jgs",
    name: "Party songs",
    description: "High bass and energy dance anthems for parties and celebrations.",
    query: "Party Songs Bollywood Punjabi High Energy",
    coverUrl: "https://mosaic.scdn.co/640/ab67616d00001e0215bdb7a86250e53e8a80163dab67616d00001e0233f89bc08b2d9cda09a857a1ab67616d00001e024ba2466aa6c47a2a87afd079ab67616d00001e0268166845814c84b0e76e2bd5",
    songCount: 50,
    category: "user_library",
  },
];

export const SPOTIFY_PODCASTS: SpotifyPodcast[] = [
  {
    id: "pod_huberman",
    title: "Huberman Lab",
    description: "Science and science-based tools for everyday life by Dr. Andrew Huberman.",
    publisher: "Scicomm Media",
    query: "Huberman Lab Science Podcast",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/d3/19/9ad31912-0b5a-a16e-2d7c-9fd074698b9c/mza_8994222203629500925.jpg/600x600bb.jpg",
  },
  {
    id: "pod_ranveer",
    title: "The Ranveer Show (TRS)",
    description: "India's smartest podcast hosted by Ranveer Allahbadia / BeerBiceps.",
    publisher: "BeerBiceps",
    query: "The Ranveer Show Hindi Podcast",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/58/6e/a9/586ea984-3bf8-302e-a8fd-2e7b002044d2/mza_2944927475341717105.jpg/600x600bb.jpg",
  },
  {
    id: "pod_rogan",
    title: "The Joe Rogan Experience",
    description: "Long-form discussions with comedians, scientists, athletes, and experts.",
    publisher: "Joe Rogan",
    query: "The Joe Rogan Experience Podcast",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/2e/66/e8/2e66e849-207e-095a-d60f-6dbdb4fcafb5/mza_14425023460891140426.jpeg/600x600bb.jpg",
  },
];

const spotifyPlaylistCache = new Map<string, Song[]>();
const trackCoverCache = new Map<string, string>();

async function resolveTrackCover(tid: string | null, fallback: string): Promise<string> {
  if (!tid) return fallback;
  if (trackCoverCache.has(tid)) return trackCoverCache.get(tid)!;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${tid}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.thumbnail_url) {
        const hd = data.thumbnail_url.replace("ab67616d00001e02", "ab67616d0000b273");
        trackCoverCache.set(tid, hd);
        return hd;
      }
    }
  } catch {}
  return fallback;
}

/**
 * Scrapes real authentic Spotify tracks directly from Spotify's embed page
 * Resolves each track's authentic 640x640 album artwork via Spotify oEmbed in parallel.
 */
export async function fetchLiveSpotifyPlaylistTracks(spotifyIdOrPresetId: string): Promise<Song[]> {
  const preset = SPOTIFY_PRESETS.find((p) => p.id === spotifyIdOrPresetId || p.spotifyId === spotifyIdOrPresetId);
  const cleanId = preset?.spotifyId || spotifyIdOrPresetId.replace(/^(pl_|sp_)/, "");
  if (!cleanId) return [];

  if (spotifyPlaylistCache.has(cleanId)) {
    return spotifyPlaylistCache.get(cleanId)!;
  }

  try {
    const url = `https://open.spotify.com/embed/playlist/${cleanId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const entity = data.props?.pageProps?.state?.data?.entity;
    if (!entity || !Array.isArray(entity.trackList)) return [];

    const coverUrl =
      entity.coverArt?.sources?.[0]?.url ||
      entity.visualIdentity?.image?.[0]?.url ||
      preset?.coverUrl ||
      "https://i.scdn.co/image/ab67706f00000002b30d7e201b1c0085357deb4a";

    const tracks: Song[] = await Promise.all(
      entity.trackList
        .filter((t: any) => t && t.title && t.title.trim() !== "")
        .map(async (t: any) => {
          const durSec = Math.round((t.duration || 180000) / 1000);
          const tid = t.uri ? t.uri.split(":")[2] : null;
          const cleanTid = tid || Math.random().toString(36).slice(2);
          const trackCover = await resolveTrackCover(tid, coverUrl);
          return {
            id: `sp_${cleanTid}`,
            title: t.title,
            artist: String(t.subtitle || "Unknown Artist").replace(/\u00a0/g, " "),
            album: `Spotify · ${entity.name || preset?.name || "Playlist"}`,
            coverUrl: trackCover,
            audioUrl: "", // Never put preview in audioUrl so full-length 320kbps song is resolved
            previewUrl: t.audioPreview?.url || "",
            duration: durSec,
            genre: "Indian Music",
            source: "spotify" as const,
          };
        })
    );

    if (tracks.length > 0) {
      spotifyPlaylistCache.set(cleanId, tracks);
      if (preset?.id) spotifyPlaylistCache.set(preset.id, tracks);
    }
    return tracks;
  } catch {
    return [];
  }
}

export function searchSpotifyPlaylists(query: string): PlaylistResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isGenericSpotify = q.includes("spot") || q === "playlist";

  const words = q.split(/\s+/).filter(Boolean);

  const matched = SPOTIFY_PRESETS.filter((item) => {
    if (isGenericSpotify) return true;
    const name = item.name.toLowerCase();
    const desc = item.description.toLowerCase();
    const qStr = item.query.toLowerCase();
    return words.some((w) => name.includes(w) || desc.includes(w) || qStr.includes(w));
  }).map((item) => ({
    id: item.id,
    name: item.name,
    songCount: item.songCount || 50,
    image: [
      { quality: "50x50", url: item.coverUrl },
      { quality: "150x150", url: item.coverUrl },
      { quality: "500x500", url: item.coverUrl },
    ],
    description: `Spotify · ${item.description}`,
    url: `https://open.spotify.com/playlist/${item.spotifyId}`,
  }));

  // Also include podcasts if matching
  const matchedPodcasts: PlaylistResult[] = SPOTIFY_PODCASTS.filter((p) => {
    if (isGenericSpotify) return false;
    const title = p.title.toLowerCase();
    const pub = p.publisher.toLowerCase();
    const desc = p.description.toLowerCase();
    return words.some((w) => title.includes(w) || pub.includes(w) || desc.includes(w));
  }).map((p) => ({
    id: p.id,
    name: p.title,
    songCount: 100,
    image: [
      { quality: "50x50", url: p.coverUrl },
      { quality: "150x150", url: p.coverUrl },
      { quality: "500x500", url: p.coverUrl },
    ],
    description: `Podcast · ${p.publisher} · ${p.description}`,
  }));

  return [...matched, ...matchedPodcasts];
}

/**
 * Generates Dynamic Playlists matching search query (exact logic from E:\ria\js\api.js lines 178-232)
 */
export function generateDynamicSpotifyPlaylists(
  query: string,
  topCoverUrl?: string
): PlaylistResult[] {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ || cleanQ.length < 2) return [];

  const capQuery = query
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const fallbackCover =
    topCoverUrl || "https://i.scdn.co/image/ab67706f00000002b30d7e201b1c0085357deb4a";

  const imgObj = [
    { quality: "50x50", url: fallbackCover },
    { quality: "150x150", url: fallbackCover },
    { quality: "500x500", url: fallbackCover },
  ];

  return [
    {
      id: `pl_dyn_this_is_${encodeURIComponent(cleanQ)}`,
      name: `This Is ${capQuery}`,
      description: `This is ${capQuery}. The essential tracks, all in one playlist.`,
      songCount: 30,
      image: imgObj,
    },
    {
      id: `pl_dyn_radio_${encodeURIComponent(cleanQ)}`,
      name: `${capQuery} Radio`,
      description: `With songs by ${capQuery} and related popular hits.`,
      songCount: 40,
      image: imgObj,
    },
    {
      id: `pl_dyn_mix_${encodeURIComponent(cleanQ)}`,
      name: `${capQuery} Mix`,
      description: `A personalized mix of ${capQuery} and today's trending songs.`,
      songCount: 35,
      image: imgObj,
    },
    {
      id: `pl_dyn_chill_${encodeURIComponent(cleanQ)}`,
      name: `${capQuery} Chill & Acoustic`,
      description: `Soothing, unplugged and mellow tracks for ${capQuery}.`,
      songCount: 25,
      image: imgObj,
    },
  ];
}

/**
 * Helper: Enhances iTunes image resolution to 600x600 HD artwork (from E:\ria\js\api.js)
 */
export function enhanceCover(url: string): string {
  if (!url) {
    return "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9f/13/ca/9f13ca3b-e533-03e0-f19a-f0aaa774581d/196589311191.jpg/600x600bb.jpg";
  }
  return url.replace(/100x100bb/g, "600x600bb").replace(/60x60bb/g, "600x600bb");
}

/**
 * Live Music Search via iTunes India API (from E:\ria\js\api.js)
 * 100% real studio titles, artists, studio album covers & instant speed.
 */
export async function searchLiveITunesSongs(query: string, limit = 25, signal?: AbortSignal): Promise<Song[]> {
  if (!query || query.trim() === "") return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&entity=song&country=IN&limit=${limit}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((t: any) => t && t.trackName)
      .map((t: any) => ({
        id: `itunes_${t.trackId}`,
        title: t.trackName || "Unknown Title",
        artist: t.artistName || "Unknown Artist",
        album: t.collectionName || t.trackName || "Single",
        coverUrl: enhanceCover(t.artworkUrl100),
        audioUrl: "", // Never put preview in audioUrl so full-length 320kbps song is resolved
        previewUrl: t.previewUrl || "",
        duration: Math.round((t.trackTimeMillis || 215000) / 1000),
        genre: t.primaryGenreName || "Indian Music",
        source: "spotify" as const,
      }));
  } catch {
    return [];
  }
}

/**
 * Live Album Search via iTunes India API (from E:\ria\js\api.js)
 */
export async function searchLiveITunesAlbums(query: string, limit = 12, signal?: AbortSignal): Promise<AlbumResult[]> {
  if (!query || query.trim() === "") return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&entity=album&country=IN&limit=${limit}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((a: any) => a && a.collectionName)
      .map((a: any) => ({
        id: `album_${a.collectionId}`,
        name: a.collectionName,
        artist: a.artistName,
        year: a.releaseDate ? String(new Date(a.releaseDate).getFullYear()) : "Recent",
        songCount: Number(a.trackCount) || 0,
        image: [
          { quality: "50x50", url: enhanceCover(a.artworkUrl100) },
          { quality: "150x150", url: enhanceCover(a.artworkUrl100) },
          { quality: "500x500", url: enhanceCover(a.artworkUrl100) },
        ],
        description: `Album · ${a.artistName}`,
      }));
  } catch {
    return [];
  }
}

/**
 * Live Artist Search via iTunes India API (from E:\ria\js\api.js)
 */
export async function searchLiveITunesArtists(query: string, limit = 10, signal?: AbortSignal): Promise<ArtistResult[]> {
  if (!query || query.trim() === "") return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&entity=musicArtist&country=IN&limit=${limit}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((ar: any) => ar && ar.artistName)
      .map((ar: any) => ({
        id: `artist_${ar.artistId}`,
        name: ar.artistName,
        subtitle: ar.primaryGenreName || "Artist",
        image: [
          { quality: "50x50", url: "https://i.scdn.co/image/ab6761610000e5ebcb6926f44f620555ba444fca" },
          { quality: "150x150", url: "https://i.scdn.co/image/ab6761610000e5ebcb6926f44f620555ba444fca" },
          { quality: "500x500", url: "https://i.scdn.co/image/ab6761610000e5ebcb6926f44f620555ba444fca" },
        ],
      }));
  } catch {
    return [];
  }
}

/** Existing playback order: catalog URL, JioSaavn high-quality audio, then YouTube. */
export async function resolveFullSongAudio(song: Song): Promise<{ url: string; bitrate: number } | null> {
  const cleanTitle = song.title.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").replace(/\{.*?\}/g, "").trim();
  const primaryArtist = (song.artist || "").split(/[,&]/)[0].trim();
  const searchQ = `${cleanTitle} ${primaryArtist}`.trim();

  // 1. If the song already has a valid 320kbps downloadUrl, extract directly
  if (song.downloadUrl) {
    try {
      const { resolveAudioStreamWithQuality } = await import("@/lib/musicData");
      const stream = resolveAudioStreamWithQuality(song.downloadUrl, "high");
      if (stream?.url && !isAudioPreviewUrl(stream.url)) {
        return { url: stream.url, bitrate: stream.bitrate || 320 };
      }
    } catch {}
  }

  // 2. HIGHEST QUALITY PRIORITY: 320kbps Master Stream from JioSaavn CDN

  const queries = [searchQ, cleanTitle].filter(Boolean);
  for (const q of queries) {
    try {
      const resp = await fetchAppApi(`/search/songs?query=${encodeURIComponent(q)}&limit=5`);
      if (resp?.ok) {
        const payload = await resp.json();
        const results = [
          payload?.data?.results,
          payload?.data?.songs?.results,
          payload?.data?.songs,
          payload?.results,
          payload?.songs,
          payload?.data,
        ].find(Array.isArray) || [];

        for (const raw of results) {
          if (!raw?.downloadUrl) continue;
          const dl = Array.isArray(raw.downloadUrl) ? raw.downloadUrl : [];
          const best = dl.find((d: any) => d.quality === "320kbps") || dl[dl.length - 1];
          const streamUrl = best?.url || best?.link;
          if (streamUrl && typeof streamUrl === "string" && streamUrl.startsWith("http") && !isAudioPreviewUrl(streamUrl)) {
            return { url: streamUrl, bitrate: 320 };
          }
        }
      }
    } catch {}
  }

  // 3. Spotify Audio Engine: Resolve via YouTube Audio Stream (VISIONOS Unblocked Transport)

  // 0. Query mavrixfy-song-api resolve-full-song endpoint
  try {
    const resp = await fetchAppApi(`/spotify/resolve-full-song?query=${encodeURIComponent(searchQ)}`);
    if (resp?.ok) {
      const json = await resp.json();
      if (json?.data?.streamUrl && !isAudioPreviewUrl(json.data.streamUrl)) {
        return { url: json.data.streamUrl, bitrate: json.data.bitrate || 320 };
      }
      if (json?.data?.videoId) {
        const { resolveYouTubeStream } = await import("@/services/youtube/YouTubeMusic");
        const ytSong: Song = {
          id: `youtube_${json.data.videoId}`,
          title: song.title,
          artist: song.artist,
          album: song.album || "Spotify Single",
          duration: song.duration,
          coverUrl: song.coverUrl,
          audioUrl: "",
          source: "spotify",
          genre: song.genre || "Music",
          youtubeVideoId: json.data.videoId,
        };
        const stream = await resolveYouTubeStream(ytSong, "high", true);
        if (stream?.url && !isAudioPreviewUrl(stream.url)) {
          const kbps = Math.round((stream.bitrate || 320000) / 1000);
          return { url: stream.url, bitrate: kbps > 0 ? kbps : 320 };
        }
      }
    }
  } catch {}

  // A. Direct YouTube Audio Scraper
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQ + " Audio Song")}`;
    const yres = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (yres.ok) {
      const text = await yres.text();
      const match = text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (match && match[1]) {
        const { resolveYouTubeStream } = await import("@/services/youtube/YouTubeMusic");
        const ytSong: Song = {
          id: `youtube_${match[1]}`,
          title: song.title,
          artist: song.artist,
          album: song.album || "Spotify Single",
          duration: song.duration,
          coverUrl: song.coverUrl,
          audioUrl: "",
          source: "spotify",
          genre: song.genre || "Music",
          youtubeVideoId: match[1],
        };
        const stream = await resolveYouTubeStream(ytSong, "high", true);
        if (stream?.url && !isAudioPreviewUrl(stream.url)) {
          const kbps = Math.round((stream.bitrate || 320000) / 1000);
          return { url: stream.url, bitrate: kbps > 0 ? kbps : 320 };
        }
      }
    }
  } catch {}

  // B. YouTube Music search
  try {
    const { searchYouTubeMusic, resolveYouTubeStream } = await import("@/services/youtube/YouTubeMusic");
    const ytResults = await searchYouTubeMusic(searchQ, "songs");
    const topSong = ytResults.songs?.[0];
    if (topSong) {
      const stream = await resolveYouTubeStream({ ...topSong, source: "spotify" }, "high", true);
      if (stream?.url && !isAudioPreviewUrl(stream.url)) {
        const kbps = Math.round((stream.bitrate || 320000) / 1000);
        return { url: stream.url, bitrate: kbps > 0 ? kbps : 320 };
      }
    }
  } catch {}

  return null;
}
