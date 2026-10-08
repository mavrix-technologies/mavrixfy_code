import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { accountStorageKey, getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import type { Song } from "@/lib/musicData";
import { getRecentlyPlayed } from "@/lib/storage";
import { isYouTubeSong, loadYouTubeExplore, youTubeAvailable } from "@/services/youtube/YouTubeMusic";
import { readHomeFeedCache, writeHomeFeedCache } from "./homeFeedCache";
import { getYouTubeHomeRecommendations, type YouTubeRecommendationFeed } from "@/services/youtube/YouTubeHomeRecommendations";

export function useYouTubeHomeFeed() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const account = user?.id || "guest";
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<{ account: string; seeds: Song[] }>();
  const scope = getAccountScope();
  const [cacheReady, setCacheReady] = useState<{ account: string; generation: number }>();
  useFocusEffect(useCallback(() => {
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
    return () => { active = false; };
  }, [account, scope.generation]));
  const seeds = history?.account === account ? history.seeds : undefined;
  const hydrated = cacheReady?.account === account && cacheReady.generation === scope.generation;
  const queryKey = ["youtube-home", account, scope.generation];
  const home = useQuery({
    queryKey,
    queryFn: ({ signal }) => getYouTubeHomeRecommendations(seeds || [], signal, partial => {
      if (!signal.aborted) queryClient.setQueryData(queryKey, (previous: typeof partial | undefined) => previous ?? partial);
    }),
    // History feeds the next explicit refresh, without replacing visible shelves
    // or creating a new network request when returning from a playlist.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === account &&
      previousQuery?.queryKey[2] === scope.generation ? previous : undefined,
    enabled: youTubeAvailable() && isOnline && hydrated && seeds !== undefined,
    staleTime: 20 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const explore = useQuery({
    queryKey: ["youtube-explore", "IN", "en", "regional-v2"],
    queryFn: ({ signal }) => loadYouTubeExplore(signal),
    enabled: youTubeAvailable() && isOnline && hydrated,
    staleTime: 20 * 60 * 1000, gcTime: 30 * 60 * 1000,
    retry: 1, refetchOnReconnect: false, refetchOnMount: false, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    let active = true;
    const accountScope = getAccountScope();
    const homeKey = ["youtube-home", account, accountScope.generation];
    const exploreKey = ["youtube-explore", "IN", "en", "regional-v2"];
    const homeCache = readHomeFeedCache<YouTubeRecommendationFeed>(accountStorageKey("home-recommendations-v1", account)).then(cached => {
      if (active && isCurrentAccount(accountScope) && cached && !queryClient.getQueryData(homeKey))
        queryClient.setQueryData(homeKey, cached.data, { updatedAt: cached.at });
    });
    const exploreCache = readHomeFeedCache<Awaited<ReturnType<typeof loadYouTubeExplore>>>("@mavrixfy_explore_IN_en_regional_v2").then(cached => {
      if (active && cached && !queryClient.getQueryData(exploreKey))
        queryClient.setQueryData(exploreKey, cached.data, { updatedAt: cached.at });
    });
    void Promise.allSettled([homeCache, exploreCache]).then(() => {
      if (active && isCurrentAccount(accountScope))
        setCacheReady({ account, generation: accountScope.generation });
    });
    return () => { active = false; };
  }, [account, scope.generation, queryClient]);
  useEffect(() => {
    if (home.data && !home.isFetching && home.isSuccess && !home.isPlaceholderData)
      void writeHomeFeedCache(accountStorageKey("home-recommendations-v1", account), home.data, home.dataUpdatedAt);
  }, [account, home.data, home.dataUpdatedAt, home.isFetching, home.isSuccess, home.isPlaceholderData]);
  useEffect(() => {
    if (explore.data && !explore.isFetching && explore.isSuccess)
      void writeHomeFeedCache("@mavrixfy_explore_IN_en_regional_v2", explore.data, explore.dataUpdatedAt);
  }, [explore.data, explore.dataUpdatedAt, explore.isFetching, explore.isSuccess]);
  return { ...home, explore };
}
