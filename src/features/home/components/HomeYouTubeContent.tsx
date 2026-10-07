import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePlayerActions } from "@/contexts/PlayerContext";
import type { getYouTubeHomeRecommendations } from "@/services/youtube/YouTubeHomeRecommendations";
import { HomeHorizontalSection, type HomeCardItem } from "./HomeHorizontalSection";
import { HomeSectionSkeleton } from "./HomeSkeletons";

type Feed = Awaited<ReturnType<typeof getYouTubeHomeRecommendations>>;
export const HomeYouTubeContent = memo(function HomeYouTubeContent({ feed, loading, failed, online, onRetry }: {
  feed?: Feed; loading: boolean; failed: boolean; online: boolean; onRetry: () => void;
}) {
  const { playSong } = usePlayerActions();
  const songs = useMemo<HomeCardItem[]>(() => (feed?.songs || []).map(song => ({
    id: song.id, name: song.title, imageUrl: song.coverUrl, subtitle: song.artist, type: "song", source: "youtube",
  })), [feed?.songs]);
  const playlists = useMemo<HomeCardItem[]>(() => (feed?.playlists || []).map(item => ({
    ...item, imageUrl: item.coverUrl, subtitle: item.description || "YouTube Music", type: "playlist",
  })), [feed?.playlists]);
  const handleSong = useCallback((item: HomeCardItem) => {
    const song = feed?.songs.find(song => song.id === item.id);
    if (song) void playSong(song, feed!.songs);
  }, [feed, playSong]);
  return <View>
    {feed ? <>
      <HomeHorizontalSection title={feed.personalized ? "YouTube Music · For you" : "YouTube Music · Discover"} items={songs} onItemPress={handleSong} />
      <HomeHorizontalSection title="YouTube Music · Mixes & playlists" items={playlists} />
    </> : loading ? <View><Text style={styles.title}>YouTube Music</Text><HomeSectionSkeleton /></View> : null}
    {failed || (!feed && !online) ? <View style={styles.notice}>
      <Text style={styles.message}>{online ? "YouTube Music could not load right now." : "Connect to load YouTube Music."}</Text>
      {online && <Pressable accessibilityRole="button" onPress={onRetry} disabled={loading} hitSlop={10}><Text style={styles.retry}>{loading ? "Loading…" : "Retry"}</Text></Pressable>}
    </View> : null}
  </View>;
});
const styles = StyleSheet.create({
  title: { marginHorizontal: 16, marginTop: 12, color: "#FFFFFF", fontSize: 20, fontFamily: "Inter_700Bold" },
  notice: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  message: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", fontSize: 13 },
  retry: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
