import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { accountStorageKey, getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import type { Song } from "@/lib/musicData";
import { getRecentlyPlayed } from "@/lib/storage";
import { clearYouTubeHomeCache, isYouTubeSong, loadYouTubeExplore, youTubeAvailable } from "@/services/youtube/YouTubeMusic";
import { readHomeFeedCache, writeHomeFeedCache } from "./homeFeedCache";
import { getYouTubeHomeRecommendations, type YouTubeRecommendationFeed } from "@/services/youtube/YouTubeHomeRecommendations";

const HOME_STALE_MS = 20 * 60 * 1000;

type ExploreFeed = Awaited<ReturnType<typeof loadYouTubeExplore>>;

function subscribeHomeCacheHydration(
  account: string,
  generation: number,
  queryClient: ReturnType<typeof useQueryClient>,
  onHydrated: (state: { account: string; generation: number }) => void
): () => void {
  const controller = new AbortController();
  const accountScope = getAccountScope();
  const homeKey = ["youtube-home", account, accountScope.generation];
  const exploreKey = ["youtube-explore", "IN", "en", "regional-v3"];

  const homeCache = readHomeFeedCache<YouTubeRecommendationFeed>(accountStorageKey("home-recommendations-v1", account)).then(cached => {
    if (!controller.signal.aborted && isCurrentAccount(accountScope) && cached && !queryClient.getQueryData(homeKey)) {
      queryClient.setQueryData(homeKey, cached.data, { updatedAt: cached.at });
    }
  });
  const exploreCache = readHomeFeedCache<ExploreFeed>("@mavrixfy_explore_IN_en_regional_v3")
    .then(cached => cached ?? readHomeFeedCache<ExploreFeed>("@mavrixfy_explore_IN_en_regional_v2"))
    .then(cached => {
      if (!controller.signal.aborted && cached && !queryClient.getQueryData(exploreKey)) {
        queryClient.setQueryData(exploreKey, cached.data, { updatedAt: cached.at });
      }
    });

  void Promise.allSettled([homeCache, exploreCache]).then(() => {
    if (!controller.signal.aborted && isCurrentAccount(accountScope)) {
      onHydrated({ account, generation });
    }
  });

  return () => {
    controller.abort();
  };
}

export function useYouTubeHomeFeed() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const account = user?.id || "guest";
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<{ account: string; seeds: Song[] }>();
  const scope = getAccountScope();
  const [cacheReady, setCacheReady] = useState<{ account: string; generation: number }>();
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(() => (AppState?.currentState ?? "active") === "active");
  useEffect(() => {
    const subscription = AppState?.addEventListener?.("change", state => {
      setAppActive(state === "active");
    });
    return () => subscription?.remove?.();
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    let active = true;
    const refreshHistory = () => {
      const historyScope = getAccountScope();
      if (historyScope.generation !== scope.generation) return;
      void getRecentlyPlayed().then(items => {
        if (!active || !isCurrentAccount(historyScope)) return;
        const seeds = items.filter(item => item.type === "song" && item.data &&
          typeof item.data.id === "string" && typeof item.data.artist === "string" && isYouTubeSong(item.data))
          .sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 20).map(item => item.data as Song);
        setHistory(previous => previous?.account === account &&
          previous.seeds.map(song => song.id).join(",") === seeds.map(song => song.id).join(",")
          ? previous : { account, seeds });
      }).catch(() => { if (active && isCurrentAccount(historyScope)) setHistory({ account, seeds: [] }); });
    };
    refreshHistory();
    return () => { active = false; setFocused(false); };
  }, [account, scope.generation]));
  const seeds = history?.account === account ? history.seeds : undefined;
  const hydrated = cacheReady?.account === account && cacheReady.generation === scope.generation;
  const queryKey = ["youtube-home", account, scope.generation];
  const home = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      const existing = queryClient.getQueryState?.(queryKey);
      const lastAt = Math.max(existing?.dataUpdatedAt ?? 0, existing?.errorUpdatedAt ?? 0);
      if (lastAt > 0 && Date.now() - lastAt >= HOME_STALE_MS) {
        clearYouTubeHomeCache();
      }
      return getYouTubeHomeRecommendations(seeds || [], signal, partial => {
        if (!signal.aborted) queryClient.setQueryData(queryKey, (previous: typeof partial | undefined) => previous ?? partial);
      });
    },
    // History feeds the next explicit refresh, without replacing visible shelves
    // or creating a new network request when returning from a playlist.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === account &&
      previousQuery?.queryKey[2] === scope.generation ? previous : undefined,
    enabled: youTubeAvailable() && isOnline && hydrated && seeds !== undefined,
    staleTime: HOME_STALE_MS,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchInterval: query => {
      if (!focused || !hydrated || !isOnline || !youTubeAvailable() || !appActive || seeds === undefined) return false;
      const lastAt = Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt);
      if (!lastAt) return false;
      const remaining = HOME_STALE_MS - (Date.now() - lastAt);
      return remaining <= 0 ? 500 : remaining;
    },
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const explore = useQuery({
    queryKey: ["youtube-explore", "IN", "en", "regional-v3"],
    queryFn: ({ signal }) => loadYouTubeExplore(signal),
    enabled: youTubeAvailable() && isOnline && hydrated,
    staleTime: HOME_STALE_MS, gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchInterval: query => {
      if (!focused || !hydrated || !isOnline || !youTubeAvailable() || !appActive) return false;
      const lastAt = Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt);
      if (!lastAt) return false;
      const remaining = HOME_STALE_MS - (Date.now() - lastAt);
      return remaining <= 0 ? 500 : remaining;
    },
    refetchOnReconnect: false, refetchOnMount: false, refetchOnWindowFocus: false,
  });
  useEffect(
    () => subscribeHomeCacheHydration(account, scope.generation, queryClient, setCacheReady),
    [account, scope.generation, queryClient]
  );
  useEffect(() => {
    if (home.data && !home.isFetching && home.isSuccess && !home.isPlaceholderData)
      void writeHomeFeedCache(accountStorageKey("home-recommendations-v1", account), home.data, home.dataUpdatedAt);
  }, [account, home.data, home.dataUpdatedAt, home.isFetching, home.isSuccess, home.isPlaceholderData]);
  useEffect(() => {
    if (explore.data && !explore.isFetching && explore.isSuccess)
      void writeHomeFeedCache("@mavrixfy_explore_IN_en_regional_v3", explore.data, explore.dataUpdatedAt);
  }, [explore.data, explore.dataUpdatedAt, explore.isFetching, explore.isSuccess]);
  return { ...home, explore };
}
