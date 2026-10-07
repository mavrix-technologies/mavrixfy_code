import EqualizerBars from "@/components/EqualizerBars";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { type Song } from "@/lib/musicData";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { MusicArtwork } from "@/components/MusicArtwork";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { usePlaybackRowState } from "@/services/audio/PlaybackEngine";

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

const QuickPickItem = memo(function QuickPickItem({
  song,
  accentColor,
  onPress,
  onOptionsPress,
  width,
}: {
  song: Song;
  accentColor: string;
  onPress: (song: Song) => void;
  onOptionsPress: (song: Song) => void;
  width: number;
}) {
  const { isActive, isPlaying } = usePlaybackRowState(song?.id);

  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  const handleMorePress = useCallback(() => {
    onOptionsPress(song);
  }, [onOptionsPress, song]);

  return (
    <View style={[styles.quickPickRow, { width }]}>
      <Pressable
        style={({ pressed }) => [
          styles.quickPickMain,
          pressed && styles.quickPickRowPressed,
        ]}
        onPress={handlePress}
      >
        <MusicArtwork
          uri={song.coverUrl}
          size={48}
          recyclingKey={song.id}
          style={styles.quickPickCover}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <View style={styles.quickPickInfo}>
          <View style={styles.quickPickTitleRow}>
            {isActive && (
              <EqualizerBars
                color={accentColor}
                size={2}
                gap={1.5}
                isPlaying={isPlaying}
              />
            )}
            <Text
              style={[
                styles.quickPickTitle,
                isActive && styles.quickPickTitleActive,
              ]}
              numberOfLines={1}
            >
              {song.title}
            </Text>
          </View>
          <Text style={styles.quickPickArtist} numberOfLines={1}>
            {song.artist}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.quickPickMore}
        onPress={handleMorePress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name="ellipsis-vertical"
          size={18}
          color="rgba(255, 255, 255, 0.70)"
        />
      </Pressable>
    </View>
  );
});

export const HomeQuickPicks = memo(function HomeQuickPicks({
  songs,
  playSong,
}: {
  songs: Song[];
  currentSongId?: string | null;
  currentSong?: Song | null;
  playSong: (song: Song, queue?: Song[]) => void;
}) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = useMemo(() => Math.round(Math.min(windowWidth * 0.85, 340)), [windowWidth]);
  const accentColor = Colors.primary;

  const handleSongPress = useCallback(
    (song: Song) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      playSong(song, songs);
    },
    [playSong, songs]
  );

  const handleOptionsPress = useCallback(
    (song: Song) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: "/song-options",
        params: {
          song: JSON.stringify(song),
          showDownload: "1",
          canRemove: "0",
          optionContext: "home",
        },
      });
    },
    [router]
  );

  const chunks = useMemo(() => chunkArray(songs, 4), [songs]);

  const renderColumn = useCallback(
    ({ item }: { item: Song[] }) => (
      <View style={{ width: columnWidth, gap: 8 }}>
        {item.map((song) => (
          <QuickPickItem
            key={song.id}
            song={song}
            accentColor={accentColor}
            onPress={handleSongPress}
            onOptionsPress={handleOptionsPress}
            width={columnWidth}
          />
        ))}
      </View>
    ),
    [accentColor, columnWidth, handleOptionsPress, handleSongPress]
  );

  const keyExtractor = useCallback((col: Song[], idx: number) => (col[0]?.id ? `col-${col[0].id}` : `col-${idx}`), []);
  const ItemSeparatorComponent = useCallback(() => <View style={{ width: 14 }} />, []);
  const getItemLayout = useCallback(
    (_: ArrayLike<Song[]> | null | undefined, index: number) => ({
      length: columnWidth + 14,
      offset: (columnWidth + 14) * index,
      index,
    }),
    [columnWidth]
  );

  if (songs.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Picks</Text>
      </View>

      <FlatList
        data={chunks}
        keyExtractor={keyExtractor}
        renderItem={renderColumn}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={columnWidth + 14}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSeparatorComponent}
        getItemLayout={getItemLayout}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    marginBottom: 18,
  },

  header: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 18.5,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  quickPickRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 0,
    overflow: "hidden",
  },

  quickPickRowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  quickPickMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  quickPickRowPressed: {
    opacity: 0.75,
  },
  quickPickCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#1C2128",
  },

  quickPickInfo: {
    flex: 1,
    paddingRight: 6,
  },
  quickPickTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickPickTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    flex: 1,
  },
  quickPickTitleActive: {
    color: Colors.primary,
    fontFamily: "Inter_700Bold",
  },
  quickPickArtist: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.65)",
    marginTop: 1.5,
  },
  quickPickMore: {
    padding: 6,
  },
});

