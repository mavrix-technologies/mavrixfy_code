import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import type { Song } from "@/lib/musicData";
import { playerUIStateStore } from "@/lib/playerUIState";
import { getSettings } from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback,useEffect,useState } from "react";
import { AppState } from "react-native";

export interface UseBackgroundVisualVideoParams {
  screenSong: Song | null;
  navigation: any;
}

const VISUAL_VIDEOS_STORAGE_KEY = "@mavrixfy_visual_candidates_v1";
const MAX_PERSISTENT_ENTRIES = 250;

// Fast in-memory cache
const memoryCandidatesCache = new Map<string, string[]>();
let persistentCacheLoaded = false;

async function loadPersistentCache(): Promise<void> {
  if (persistentCacheLoaded) return;
  persistentCacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(VISUAL_VIDEOS_STORAGE_KEY);
    if (raw) {
      const parsed: Record<string, string[]> = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v) && v.length > 0) {
            memoryCandidatesCache.set(k, v);
          }
        }
      }
    }
  } catch {}
}

async function persistCandidateEntry(key: string, candidates: string[]): Promise<void> {
  try {
    memoryCandidatesCache.set(key, candidates);
    const raw = await AsyncStorage.getItem(VISUAL_VIDEOS_STORAGE_KEY);
    let parsed: Record<string, string[]> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) || {};
      } catch {
        parsed = {};
      }
    }
    parsed[key] = candidates;
    const keys = Object.keys(parsed);
    if (keys.length > MAX_PERSISTENT_ENTRIES) {
      delete parsed[keys[0]];
    }
    await AsyncStorage.setItem(VISUAL_VIDEOS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
}

export function cleanSongTitleForSearch(title: string): string {
  if (!title) return "";
  const cleaned = title
    .replace(/\s*\([^)]*(?:from|soundtrack|movie|film|album|ost)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*(?:from|soundtrack|movie|film|album|ost)[^\]]*\]/gi, "")
    .replace(/\s*\((?:official\s+)?(?:video|audio|lyrics|lyrical|full\s+song|original|hd|4k)\)/gi, "")
    .replace(/\s*\[(?:official\s+)?(?:video|audio|lyrics|lyrical|full\s+song|original|hd|4k)\]/gi, "")
    .replace(/\s*\(feat\.[^)]+\)/gi, "")
    .replace(/\s*\[feat\.[^\]]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || title;
}

function parseViews(str?: string): number {
  if (!str) return 0;
  const digits = str.replace(/[^\d]/g, "");
  return parseInt(digits, 10) || 0;
}

function parseDurationSeconds(lenStr?: string): number {
  if (!lenStr) return 0;
  const parts = lenStr.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function scoreVideoCandidate(vr: any, song: Song): number {
  const vidTitle = (vr.title?.runs?.[0]?.text || "").toLowerCase();
  const channel = (vr.ownerText?.runs?.[0]?.text || "").toLowerCase();
  const isVerified = (vr.ownerBadges || []).some((b: any) =>
    /verified|official/i.test(b.metadataBadgeRenderer?.tooltip || "")
  );
  const views = parseViews(vr.viewCountText?.simpleText);
  const durSec = parseDurationSeconds(vr.lengthText?.simpleText);

  // Reject videos longer than 12 mins or shorter than 35s
  if (durSec > 720 || (durSec > 0 && durSec < 35)) return -1000;

  let score = 0;

  const songTitle = (song.title || "").toLowerCase();
  const cleanSongTitle = cleanSongTitleForSearch(songTitle);
  const artist = (song.artist || "").toLowerCase();
  const primaryArtist = artist.split(/[,&/|]/)[0].trim();

  // 1. Title match
  if (vidTitle.includes(cleanSongTitle)) {
    score += 65;
  } else {
    const words = cleanSongTitle.split(/\s+/).filter((w) => w.length > 2);
    const matched = words.filter((w) => vidTitle.includes(w));
    if (matched.length > 0) {
      score += Math.round((matched.length / words.length) * 45);
    } else {
      score -= 60; // Title doesn't match at all
    }
  }

  // 2. Artist match (in title or channel name)
  if (primaryArtist && (vidTitle.includes(primaryArtist) || channel.includes(primaryArtist))) {
    score += 35;
  }

  // 3. Album match if available
  if (song.album) {
    const cleanAlbum = cleanSongTitleForSearch(song.album.toLowerCase());
    if (cleanAlbum && cleanAlbum !== cleanSongTitle && vidTitle.includes(cleanAlbum)) {
      score += 20;
    }
  }

  // 4. Year match if available
  if (
    song.year &&
    (vidTitle.includes(song.year) ||
      (vr.publishedTimeText?.simpleText || "").includes(song.year))
  ) {
    score += 15;
  }

  // 5. Channel verification (Official Artist or Verified Label)
  if (isVerified) {
    score += 25;
  }

  // 6. Keyword bonuses (Official lyrical videos are best for background)
  if (/official\s+lyric/i.test(vidTitle)) score += 35;
  else if (/lyric|lyrical/i.test(vidTitle)) score += 25;
  else if (/official\s+video/i.test(vidTitle)) score += 20;
  else if (/official\s+audio/i.test(vidTitle)) score += 10;

  // 7. Negative keyword filter (covers, reactions, dance, status, shorts)
  if (
    /reaction|cover|parody|dance\s+cover|status|shorts|tutorial|karaoke\s+without|slowed\s+reverb/i.test(
      vidTitle
    )
  ) {
    score -= 100;
  }

  // 8. Views (most viewed / popular)
  if (views >= 10000000) score += 35;
  else if (views >= 1000000) score += 25;
  else if (views >= 100000) score += 15;
  else if (views > 0 && views < 5000) score -= 20;

  // 9. Duration proximity (matches audio length)
  if (song.duration && song.duration > 30 && durSec > 0) {
    const diff = Math.abs(durSec - song.duration);
    if (diff <= 5) score += 35;
    else if (diff <= 15) score += 25;
    else if (diff <= 30) score += 15;
    else if (diff > 90) score -= 35;
  }

  return score;
}

async function searchYouTubeForVideoCandidates(query: string, song: Song): Promise<string[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240101.01.00",
            hl: "en",
            gl: "IN",
          },
        },
        query,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const json = await res.json();
    const contents =
      json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
        ?.itemSectionRenderer?.contents || [];

    const scoredCandidates: { id: string; score: number }[] = [];
    for (const item of contents) {
      const vr = item?.videoRenderer;
      const vid = vr?.videoId;
      if (vid && typeof vid === "string" && vid.length === 11) {
        const score = scoreVideoCandidate(vr, song);
        if (score > 0) {
          scoredCandidates.push({ id: vid, score });
        }
      }
    }

    // Sort by descending score (most verified, highest accuracy, most viewed first)
    scoredCandidates.sort((a, b) => b.score - a.score);

    return scoredCandidates.slice(0, 3).map((c) => c.id);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

export async function getVisualCandidatesForSong(song: Song): Promise<string[]> {
  if (!song) return [];

  const list: string[] = [];
  if (song.youtubeVisualVideoId && song.youtubeVisualVideoId.length === 11) {
    list.push(song.youtubeVisualVideoId);
  }
  if (
    song.youtubeVideoId &&
    song.youtubeVideoId.length === 11 &&
    !list.includes(song.youtubeVideoId)
  ) {
    list.push(song.youtubeVideoId);
  }
  if (list.length > 0) return list;

  const songKey = song.id || `${song.title}-${song.artist}`;
  if (songKey && memoryCandidatesCache.has(songKey)) {
    return memoryCandidatesCache.get(songKey)!;
  }

  await loadPersistentCache();
  if (songKey && memoryCandidatesCache.has(songKey)) {
    return memoryCandidatesCache.get(songKey)!;
  }

  const cleanTitle = cleanSongTitleForSearch(song.title || "");
  const primaryArtist = (song.artist || "").split(/[,&/|]/)[0].trim();
  const query = `${cleanTitle} ${primaryArtist} official lyrical video`.trim();
  if (!query) return [];

  let candidates = await searchYouTubeForVideoCandidates(query, song);

  if (candidates.length === 0) {
    const fallbackQuery = `${cleanTitle} ${primaryArtist} official video`.trim();
    candidates = await searchYouTubeForVideoCandidates(fallbackQuery, song);
  }

  if (candidates.length > 0 && songKey) {
    void persistCandidateEntry(songKey, candidates);
  }

  return candidates;
}

export async function getVisualVideoIdForSong(song: Song): Promise<string | null> {
  const candidates = await getVisualCandidatesForSong(song);
  return candidates[0] || null;
}

export function useBackgroundVisualVideo({
  screenSong,
  navigation,
}: UseBackgroundVisualVideoParams) {
  const [ambientBackdropEnabled, setAmbientBackdropEnabled] = useState(false);
  const [isNavigationFocused, setIsNavigationFocused] = useState(() => navigation.isFocused());
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === "active");
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(
    () => playerUIStateStore.current === "expanded"
  );
  const isScreenFocused = isNavigationFocused && isAppActive && isPlayerExpanded;
  const [isLowEnd, setIsLowEnd] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getDevicePerformanceProfile().then((profile) => {
      if (mounted) {
        setIsLowEnd(profile.isLowEndDevice);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void loadPersistentCache();
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchSettings = () => {
      getSettings().then((s) => {
        if (mounted) {
          setAmbientBackdropEnabled(s.ambientBackdropEnabled);
        }
      });
    };
    fetchSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchSettings = () => {
      getSettings().then((s) => {
        setAmbientBackdropEnabled(s.ambientBackdropEnabled);
      });
    };
    const handler = () => {
      fetchSettings();
      setIsNavigationFocused(true);
    };
    navigation.addListener("focus", handler);
    const blurHandler = () => {
      setIsNavigationFocused(false);
    };
    navigation.addListener("blur", blurHandler);

    const unsubscribe = playerUIStateStore.subscribe((state) => {
      const isExpanded = state === "expanded";
      setIsPlayerExpanded(isExpanded);
      if (isExpanded) {
        fetchSettings();
      }
    });

    return () => {
      navigation.removeListener("focus", handler);
      navigation.removeListener("blur", blurHandler);
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  const [candidateIndexState, setCandidateIndexState] = useState<{ songId: string | null; index: number }>({
    songId: null,
    index: 0,
  });

  const screenSongIdForVideo = screenSong?.id ?? null;

  const { data: candidates = [] } = useQuery({
    queryKey: ["visualCandidates", screenSongIdForVideo],
    queryFn: () => (screenSong ? getVisualCandidatesForSong(screenSong) : Promise.resolve([])),
    enabled: Boolean(ambientBackdropEnabled && screenSongIdForVideo && screenSong),
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  const candidateIndex = candidateIndexState.songId === screenSongIdForVideo ? candidateIndexState.index : 0;
  const backgroundVideoId = candidates[candidateIndex] || null;

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const videoActive = Boolean(backgroundVideoId && activeVideoId === backgroundVideoId);
  const handleVideoActive = useCallback(
    (active: boolean) => {
      if (active && backgroundVideoId) {
        setActiveVideoId(backgroundVideoId);
      } else {
        setActiveVideoId(null);
      }
    },
    [backgroundVideoId]
  );

  // If a video fails (e.g. YouTube error 101/150 embed blocked), try next candidate
  const handleVideoError = useCallback(
    (_err: string) => {
      setActiveVideoId(null);
      setCandidateIndexState((prev) => {
        const curIdx = prev.songId === screenSongIdForVideo ? prev.index : 0;
        if (curIdx + 1 < candidates.length) {
          return { songId: screenSongIdForVideo, index: curIdx + 1 };
        }
        return prev;
      });
    },
    [candidates.length, screenSongIdForVideo]
  );

  const shouldRenderBackgroundVideo = Boolean(
    ambientBackdropEnabled && backgroundVideoId && isScreenFocused
  );
  const ambientVideoLayoutActive = Boolean(shouldRenderBackgroundVideo && videoActive);

  return {
    isLowEnd,
    backgroundVideoId,
    videoActive,
    handleVideoActive,
    handleVideoError,
    isScreenFocused,
    shouldRenderBackgroundVideo,
    ambientVideoLayoutActive,
  };
}
