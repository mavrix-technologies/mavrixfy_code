import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, FlatList } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { usePlayerQueue } from "@/contexts/PlayerContext";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";

type QueueItem = {
  song: Song;
  key: string;
};

let queueItemKeyCounter = 0;

function buildStableQueueItems(songs: Song[], previous: QueueItem[]): QueueItem[] {
  const keyBuckets = new Map<string, string[]>();
  for (const item of previous) {
    const bucket = keyBuckets.get(item.song.id) ?? [];
    bucket.push(item.key);
    keyBuckets.set(item.song.id, bucket);
  }

  return songs.map((song) => {
    const bucket = keyBuckets.get(song.id);
    const reusedKey = bucket && bucket.length > 0 ? bucket.shift() : null;
    if (reusedKey) {
      return { song, key: reusedKey };
    }
    queueItemKeyCounter += 1;
    return { song, key: `${song.id}-${queueItemKeyCounter}` };
  });
}

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const {
    queue,
    queueIndex,
    currentSong,
    playSong,
    removeFromQueue,
    reorderQueue,
    clearQueue,
  } = usePlayerQueue();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [upNextData, setUpNextData] = useState<QueueItem[]>([]);

  useEffect(() => {
    const upcomingSongs = queue.slice(queueIndex + 1);
    setUpNextData((prev) => buildStableQueueItems(upcomingSongs, prev));
  }, [queue, queueIndex]);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    void triggerImpact(style);
  }, []);

  const handleSongPress = useCallback(
    (song: Song) => {
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
      playSong(song, queue);
    },
    [playSong, queue, triggerHaptic]
  );

  const handleRemove = useCallback(
    (relativeIndex: number) => {
      const absoluteIndex = queueIndex + 1 + relativeIndex;
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      removeFromQueue(absoluteIndex);
    },
    [queueIndex, removeFromQueue, triggerHaptic]
  );

  const handleClearQueue = useCallback(() => {
    if (upNextData.length === 0) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    clearQueue();
  }, [clearQueue, triggerHaptic, upNextData.length]);

  const handleMove = useCallback(
    (relativeIndex: number, direction: -1 | 1) => {
      const targetIndex = relativeIndex + direction;
      if (targetIndex < 0 || targetIndex >= upNextData.length) {
        return;
      }

      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

      setUpNextData((prev) => {
        const next = [...prev];
        const [movedItem] = next.splice(relativeIndex, 1);
        if (!movedItem) {
          return prev;
        }
        next.splice(targetIndex, 0, movedItem);
        return next;
      });

      const absoluteFrom = queueIndex + 1 + relativeIndex;
      const absoluteTo = queueIndex + 1 + targetIndex;
      reorderQueue(absoluteFrom, absoluteTo);
    },
    [queueIndex, reorderQueue, triggerHaptic, upNextData.length]
  );

  const renderQueueItem = useCallback(
    ({ item, index }: { item: QueueItem; index: number }) => {
      const canMoveUp = index > 0;
      const canMoveDown = index < upNextData.length - 1;

      return (
        <Pressable
          style={styles.queueRow}
          onPress={() => handleSongPress(item.song)}
        >
          <Text style={styles.queueNumber}>{index + 1}</Text>

          {item.song.coverUrl ? (
            <Image
              source={{ uri: item.song.coverUrl }}
              style={styles.songImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.song.id}
            />
          ) : (
            <View style={[styles.songImage, styles.songImageFallback]}>
              <Ionicons name="musical-notes" size={18} color={Colors.subtext} />
            </View>
          )}

          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>
              {item.song.title}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {item.song.artist}
            </Text>
          </View>

          <View style={styles.rowActions}>
            <Pressable
              onPress={() => handleMove(index, -1)}
              hitSlop={10}
              style={[styles.actionButton, !canMoveUp && styles.actionButtonDisabled]}
              disabled={!canMoveUp}
            >
              <Ionicons name="chevron-up" size={18} color={canMoveUp ? Colors.subtext : Colors.inactive} />
            </Pressable>
            <Pressable
              onPress={() => handleMove(index, 1)}
              hitSlop={10}
              style={[styles.actionButton, !canMoveDown && styles.actionButtonDisabled]}
              disabled={!canMoveDown}
            >
              <Ionicons name="chevron-down" size={18} color={canMoveDown ? Colors.subtext : Colors.inactive} />
            </Pressable>
            <Pressable
              onPress={() => handleRemove(index)}
              hitSlop={10}
              style={styles.actionButton}
            >
              <Ionicons name="close" size={18} color={Colors.subtext} />
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [handleMove, handleRemove, handleSongPress, upNextData.length]
  );

  const listHeader = useMemo(
    () => (
      <>
        {currentSong ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Now Playing</Text>
            <Pressable style={styles.currentRow} onPress={() => router.push("/player")}>
              {currentSong.coverUrl ? (
                <Image
                  source={{ uri: currentSong.coverUrl }}
                  style={styles.currentImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.currentImage, styles.songImageFallback]}>
                  <Ionicons name="musical-notes" size={18} color={Colors.subtext} />
                </View>
              )}
              <View style={styles.currentInfo}>
                <Text style={styles.currentTitle} numberOfLines={1}>
                  {currentSong.title}
                </Text>
                <Text style={styles.currentArtist} numberOfLines={1}>
                  {currentSong.artist}
                </Text>
              </View>
              <Ionicons name="play-circle" size={24} color={Colors.primary} />
            </Pressable>
            <View style={styles.rowDivider} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Up Next {upNextData.length > 0 ? `(${upNextData.length})` : ""}</Text>
          <Text style={styles.sectionSubtitle}>Use the arrows to reorder upcoming songs.</Text>
        </View>
      </>
    ),
    [currentSong, upNextData.length]
  );

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="list-outline" size={56} color={Colors.inactive} />
        <Text style={styles.emptyTitle}>Queue is empty</Text>
        <Text style={styles.emptySubtitle}>Songs you add to queue will appear here.</Text>
      </View>
    ),
    []
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.topIconButton} onPress={safeGoBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Queue</Text>
        <Pressable
          style={[styles.clearButton, upNextData.length === 0 && styles.clearButtonDisabled]}
          onPress={handleClearQueue}
          hitSlop={10}
        >
          <Text style={[styles.clearText, upNextData.length === 0 && styles.clearTextDisabled]}>Clear</Text>
        </Pressable>
      </View>

      <FlatList
        data={upNextData}
        renderItem={renderQueueItem}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[
          styles.listContent,
          upNextData.length === 0 ? styles.listContentEmpty : undefined,
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  topIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  topTitle: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.2,
  },
  clearButton: {
    minWidth: 58,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 10,
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearText: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  clearTextDisabled: {
    color: Colors.subtext,
  },
  listContent: {
    paddingBottom: 136,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    marginTop: -6,
    marginBottom: 4,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  currentRow: {
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  currentImage: {
    width: 54,
    height: 54,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
  },
  currentInfo: {
    flex: 1,
    minWidth: 0,
  },
  currentTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  currentArtist: {
    marginTop: 2,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  queueRow: {
    marginHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 10,
  },
  queueNumber: {
    width: 18,
    textAlign: "center",
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  songImage: {
    width: 48,
    height: 48,
    borderRadius: 9,
    backgroundColor: Colors.surfaceLight,
  },
  songImageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  songArtist: {
    marginTop: 2,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.cardBorder,
    marginLeft: 28,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
