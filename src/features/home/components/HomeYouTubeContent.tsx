import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePlayerActions } from "@/contexts/PlayerContext";
import type { YouTubeHomeSection } from "@/services/youtube/YouTubeMusic";
import { youtubePlaylistPublisher } from "@/services/youtube/YouTubePlaylistIdentity";
import { HomeHorizontalSection, type HomeCardItem } from "./HomeHorizontalSection";
import { homeDisplayText } from "./homeDisplayText";
import { HomeSectionSkeleton } from "./HomeSkeletons";

export const HomeYouTubeContent = memo(function HomeYouTubeContent({ section }: { section: YouTubeHomeSection }) {
  const { playSong } = usePlayerActions();
  const songs = useMemo<HomeCardItem[]>(() => section.songs.map(song => ({
    id: song.id, name: song.title, imageUrl: song.coverUrl, subtitle: homeDisplayText(song.artist, "Artist"), type: "song", source: "youtube",
  })), [section.songs]);
  const playlists = useMemo<HomeCardItem[]>(() => section.playlists.map(item => ({
    ...item, imageUrl: item.coverUrl, subtitle: homeDisplayText(item.kind === "album" ? item.description || "Album" : youtubePlaylistPublisher(item).label, item.kind === "album" ? "Album" : "Playlist"), type: item.kind === "album" ? "album" : "playlist",
  })), [section.playlists]);
  const releaseItems = useMemo(() => {
    const combined: HomeCardItem[] = [];
    for (let i = 0; i < Math.max(songs.length, playlists.length); i++) {
      if (playlists[i]) combined.push(playlists[i]);
      if (songs[i]) combined.push(songs[i]);
    }
    return combined;
  }, [songs, playlists]);
  const handleSong = useCallback((item: HomeCardItem) => {
    const song = section.songs.find(song => song.id === item.id);
    if (song) void playSong(song, section.songs);
  }, [section.songs, playSong]);
  if (section.category === "new-releases") return <HomeHorizontalSection title="New Releases" items={releaseItems} onSongPress={handleSong} />;
  return <View>
    <HomeHorizontalSection title={homeDisplayText(section.title)} items={songs} onItemPress={handleSong} />
    <HomeHorizontalSection title={songs.length ? `${homeDisplayText(section.title)} · Playlists` : homeDisplayText(section.title)} items={playlists} />
  </View>;
});

export const HomeYouTubeStatus = memo(function HomeYouTubeStatus({ hasFeed, loading, failed, online, onRetry, emptyMessage }: {
  hasFeed: boolean; loading: boolean; failed: boolean; online: boolean; onRetry: () => void; emptyMessage?: string;
}) {
  if (hasFeed && !failed) return emptyMessage ? <View style={styles.notice}><Text style={styles.message}>{emptyMessage}</Text></View> : null;
  if (!hasFeed && loading) return <HomeSectionSkeleton />;
  if (!failed && online) return null;
  return <View style={styles.notice}>
    <Text style={styles.message}>{online ? "Recommendations could not load right now." : "Connect to load recommendations."}</Text>
    {online && <Pressable accessibilityRole="button" onPress={onRetry} disabled={loading} hitSlop={10}><Text style={styles.retry}>{loading ? "Loading…" : "Retry"}</Text></Pressable>}
  </View>;
});
const styles = StyleSheet.create({
  notice: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  message: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", fontSize: 13 },
  retry: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
