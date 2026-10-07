import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import type { Song } from "@/lib/musicData";
import { getRecentlyPlayed } from "@/lib/storage";
import { isYouTubeSong, youTubeAvailable } from "@/services/youtube/YouTubeMusic";
import { getYouTubeHomeRecommendations } from "@/services/youtube/YouTubeHomeRecommendations";

export function useYouTubeHomeFeed() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const account = user?.id || "guest";
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<{ account: string; seeds: Song[] }>();
  useFocusEffect(useCallback(() => {
    let active = true;
    const refreshHistory = () => {
      const scope = getAccountScope();
      void getRecentlyPlayed().then(items => {
        if (!active || !isCurrentAccount(scope)) return;
        const seeds = items.filter(item => item.type === "song" && item.data &&
          typeof item.data.id === "string" && typeof item.data.artist === "string" && isYouTubeSong(item.data))
          .sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 20).map(item => item.data as Song);
        setHistory({ account, seeds });
      }).catch(() => { if (active && isCurrentAccount(scope)) setHistory({ account, seeds: [] }); });
      if (isOnline && youTubeAvailable()) void queryClient.refetchQueries({ queryKey: ["youtube-home", account], type: "active", stale: true });
    };
    refreshHistory();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refreshHistory(); });
    return () => { active = false; listener.remove(); };
  }, [account, isOnline, queryClient]));
  const seeds = history?.account === account ? history.seeds : undefined;
  return useQuery({
    queryKey: ["youtube-home", account, getAccountScope().generation, seeds?.map(song => song.id).join(",")],
    queryFn: ({ signal }) => getYouTubeHomeRecommendations(seeds || [], signal),
    enabled: youTubeAvailable() && isOnline && seeds !== undefined,
    staleTime: 20 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnReconnect: true,
  });
}
