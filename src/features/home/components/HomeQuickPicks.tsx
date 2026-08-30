import React, { memo, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { showGlobalToast } from "@/utils/globalToast";
import { logger } from "@/lib/logger";
import { type Song, convertJioSaavnSong } from "@/lib/musicData";
import { getJioSaavnSongDetails } from "@/data/providers/JioSaavnProvider";
import {
  useArtworkPalette,
  colorWithAlpha,
} from "@/lib/colorExtractor";



function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

const QuickPickItem = memo(function QuickPickItem({
  song,
  isActive,
  accentColor,
  onPress,
  onOptionsPress,
  width,
}: {
  song: Song;
  isActive: boolean;
  accentColor: string;
  onPress: (song: Song) => void;
  onOptionsPress: (song: Song) => void;
  width: number;
}) {
  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  const handleMorePress = useCallback(() => {
    onOptionsPress(song);
  }, [onOptionsPress, song]);

  const activeProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, {
      duration: 400,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isActive, activeProgress]);

  const activeBg = useMemo(
    () => colorWithAlpha(accentColor, 0.16, "rgba(38, 225, 154, 0.12)"),
    [accentColor]
  );

  const animatedRowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      ["transparent", activeBg]
    ),
  }));




  return (
    <Animated.View
      style={[
        styles.quickPickRow,
        { width },
        animatedRowStyle,
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.quickPickMain,
          pressed && styles.quickPickRowPressed,
        ]}
        onPress={handlePress}
      >
        <Image
          source={{ uri: song.coverUrl || undefined }}
          style={styles.quickPickCover}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
        <View style={styles.quickPickInfo}>
          <Text
            style={[styles.quickPickTitle, isActive && { color: accentColor, fontFamily: "Inter_700Bold" }]}
            numberOfLines={1}
          >
            {song.title}
          </Text>
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
          color={isActive ? accentColor : "rgba(255,255,255,0.70)"}
        />
      </Pressable>
    </Animated.View>
  );
});

export const HomeQuickPicks = memo(function HomeQuickPicks({
  songs,
  currentSongId,
  currentSong,
  playSong,
}: {
  songs: Song[];
  currentSongId: string | null;
  currentSong?: Song | null;
  playSong: (song: Song, queue?: Song[]) => void;
}) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = useMemo(() => Math.round(Math.min(windowWidth * 0.85, 340)), [windowWidth]);

  const artworkPalette = useArtworkPalette(currentSong?.coverUrl);
  const accentColor = artworkPalette.accent;

  const playableQueue = useMemo(
    () => songs.filter((s) => typeof s.audioUrl === "string" && s.audioUrl.trim().length > 0),
    [songs]
  );

  const handleSongPress = useCallback(
    async (song: Song) => {
      try {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);

        // Play directly if URL exists
        if (song.audioUrl?.trim()) {
          const queue = playableQueue.some((q) => q.id === song.id)
            ? playableQueue
            : [song, ...playableQueue];

          playSong(song, queue);
          return;
        }

        // On-demand resolve if metadata only
        if (song.source === "jiosaavn") {
          showGlobalToast("Loading song...");
          const resolved = await getJioSaavnSongDetails(song.id, undefined);
          if (!resolved) {
            showGlobalToast("Failed to load song");
            return;
          }
          const playable = convertJioSaavnSong(resolved);
          if (!playable?.audioUrl?.trim()) {
            showGlobalToast("Song is unavailable");
            return;
          }

          const updatedQueue = [
            playable,
            ...playableQueue.filter((q) => q.id !== playable.id),
          ];

          playSong(playable, updatedQueue);
          return;
        }

        showGlobalToast("Song is unavailable");
      } catch (error) {
        logger.error("[QuickPicks] Playback failed:", error);
        showGlobalToast("Could not play this song");
      }
    },
    [playSong, playableQueue]
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
            isActive={currentSongId === song.id}
            accentColor={accentColor}
            onPress={handleSongPress}
            onOptionsPress={handleOptionsPress}
            width={columnWidth}
          />
        ))}
      </View>
    ),
    [accentColor, columnWidth, currentSongId, handleOptionsPress, handleSongPress]
  );

  const keyExtractor = useCallback((_: Song[], idx: number) => `col-${idx}`, []);
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
    backgroundColor: "rgba(38, 225, 154, 0.10)",
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
  quickPickTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
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

