import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { Gesture, GestureDetector, Swipeable } from "react-native-gesture-handler";
import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackQueueState, usePlaybackPlayState } from "@/lib/playbackEngine";
import { Song } from "@/lib/musicData";

type DraggableQueueItem = {
  song: Song;
  index: number;
  key: string;
  section: "user" | "playlist";
  isFirstInSection: boolean;
};

const SHEET_BACKGROUND = "#1E1E1E";
const CONTROL_BACKGROUND = "#333333";
const HANDLE_COLOR = "#6D6D6D";
const SWIPE_ACTION_WIDTH = 92;

const QueueSwipeRow = React.memo(
  ({
    item,
    itemIndex,
    onSongPress,
    onRemoveAt,
    onSwipeOpen,
    onDrag,
    isDragging,
  }: {
    item: Song;
    itemIndex: number;
    onSongPress: (song: Song) => void;
    onRemoveAt: (index: number) => void;
    onSwipeOpen: (ref: Swipeable | null) => void;
    onDrag: () => void;
    isDragging?: boolean;
  }) => {
    const swipeableRef = React.useRef<Swipeable | null>(null);

    const handleRemove = React.useCallback(() => {
      swipeableRef.current?.close();
      onRemoveAt(itemIndex);
    }, [itemIndex, onRemoveAt]);

    const handlePress = React.useCallback(() => {
      swipeableRef.current?.close();
      onSongPress(item);
    }, [item, onSongPress]);

    const renderRightActions = React.useCallback(() => (
      <Pressable style={styles.removeAction} onPress={handleRemove}>
        <Ionicons name="trash" size={20} color="#FFFFFF" />
        <Text style={styles.removeText}>Remove</Text>
      </Pressable>
    ), [handleRemove]);

    return (
      <ScaleDecorator activeScale={1.035}>
        <View style={[styles.swipeWrap, isDragging && styles.draggingRow]}>
          <Swipeable
            ref={swipeableRef}
            enabled={!isDragging}
            friction={1.25}
            rightThreshold={22}
            dragOffsetFromRightEdge={8}
            overshootRight={false}
            enableTrackpadTwoFingerGesture
            onSwipeableWillOpen={() => onSwipeOpen(swipeableRef.current)}
            renderRightActions={renderRightActions}
          >
            <View style={styles.rowLayer}>
              <Pressable
                style={({ pressed }) => [
                  styles.queueRow,
                  pressed && styles.rowPressed,
                ]}
                onPress={handlePress}
              >
                <Image
                  recyclingKey={item.id}
                  source={{ uri: item.coverUrl }}
                  style={styles.queueArtwork}
                  contentFit="cover"
                />
                <View style={styles.queueText}>
                  <Text style={styles.queueTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.queueArtist} numberOfLines={1}>
                    {item.artist || "Unknown Artist"}
                  </Text>
                </View>
                <Pressable
                  style={styles.dragHandle}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  delayLongPress={120}
                  onLongPress={onDrag}
                >
                  <Ionicons name="menu" size={24} color={isDragging ? Colors.primary : "#7A7A7A"} />
                </Pressable>
              </Pressable>
            </View>
          </Swipeable>
        </View>
      </ScaleDecorator>
    );
  }
);

QueueSwipeRow.displayName = "QueueSwipeRow";

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { queue, userQueuedSongIds, queueIndex, currentSong, isShuffled } = usePlaybackQueueState();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, removeFromQueue, reorderQueue, shuffleQueue, sleepTimer, togglePlay } = usePlayerActions();
  const openSwipeableRef = useRef<Swipeable | null>(null);
  const lastPlaceholderIndexRef = useRef<number | null>(null);
  const didMountListRef = useRef(false);
  const [listReady, setListReady] = useState(false);
  const isCompactHeight = height < 760;
  const bottomListSpacer = isCompactHeight ? 40 : 56;

  const showList = useCallback(() => {
    if (didMountListRef.current) return;
    didMountListRef.current = true;
    setListReady(true);
  }, []);

  useEffect(() => {
    let mountTimer: ReturnType<typeof setTimeout> | null = null;
    didMountListRef.current = false;

    const task = InteractionManager.runAfterInteractions(() => {
      mountTimer = setTimeout(showList, 90);
    });
    const fallbackTimer = setTimeout(showList, 280);

    return () => {
      task.cancel();
      clearTimeout(fallbackTimer);
      if (mountTimer) {
        clearTimeout(mountTimer);
      }
    };
  }, [showList]);

  const nowPlaying = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;

  const upcomingQueue = useMemo(() => {
    const startFrom = currentSong ? Math.max(0, queueIndex + 1) : 0;
    return queue.slice(startFrom).filter((song) => Boolean(song?.id));
  }, [currentSong, queue, queueIndex]);

  const userQueuedCount = useMemo(() => {
    const startFrom = currentSong ? Math.max(0, queueIndex + 1) : 0;
    return Math.max(0, Math.min(userQueuedSongIds.length, queue.length - startFrom));
  }, [currentSong, queue.length, queueIndex, userQueuedSongIds.length]);

  const data: DraggableQueueItem[] = useMemo(() => {
    const startFrom = currentSong ? Math.max(0, queueIndex + 1) : 0;
    return upcomingQueue.map((song, idx) => ({
      song,
      index: startFrom + idx,
      key: `${song.id}-${startFrom + idx}`,
      section: idx < userQueuedCount ? "user" : "playlist",
      isFirstInSection: idx === 0 || idx === userQueuedCount,
    }));
  }, [currentSong, queueIndex, upcomingQueue, userQueuedCount]);

  const handleSongPress = useCallback((song: Song) => {
    openSwipeableRef.current?.close();
    playSong(song, queue);
  }, [playSong, queue]);

  const handleSwipeOpen = useCallback((ref: Swipeable | null) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
      openSwipeableRef.current.close();
    }
    openSwipeableRef.current = ref;
  }, []);

  const handleShuffle = useCallback(() => {
    void shuffleQueue();
  }, [shuffleQueue]);

  const handleTimer = useCallback(() => {
    router.push("/sleep-timer");
  }, []);

  const handleDragBegin = useCallback(() => {
    openSwipeableRef.current?.close();
    lastPlaceholderIndexRef.current = null;
  }, []);

  const handleDragEnd = useCallback(({ from, to }: { from: number; to: number }) => {
    lastPlaceholderIndexRef.current = null;
    if (from === to) return;
    const startFrom = currentSong ? Math.max(0, queueIndex + 1) : 0;
    void reorderQueue(startFrom + from, startFrom + to);
  }, [currentSong, queueIndex, reorderQueue]);

  const handlePlaceholderIndexChange = useCallback((placeholderIndex: number) => {
    if (lastPlaceholderIndexRef.current === placeholderIndex) return;
    lastPlaceholderIndexRef.current = placeholderIndex;
  }, []);

  const renderQueueSong = useCallback(({
    item,
    drag,
    isActive,
  }: RenderItemParams<DraggableQueueItem>) => {
    return (
      <View>
        {item.isFirstInSection ? (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {item.section === "user" ? "Added to queue" : "Playing next"}
            </Text>
          </View>
        ) : null}
        <QueueSwipeRow
          item={item.song}
          itemIndex={item.index}
          onSongPress={handleSongPress}
          onRemoveAt={removeFromQueue}
          onSwipeOpen={handleSwipeOpen}
          onDrag={drag}
          isDragging={isActive}
        />
      </View>
    );
  }, [handleSongPress, handleSwipeOpen, removeFromQueue]);

  const androidSheetSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS === "android")
        .runOnJS(true)
        .onEnd((event) => {
          const isDownwardSwipe =
            event.translationY > 80 ||
            (event.translationY > 40 && event.velocityY > 500);
          const isMostlyVertical = Math.abs(event.translationY) > Math.abs(event.translationX) * 1.5;
          if (isDownwardSwipe && isMostlyVertical) {
            router.back();
          }
        }),
    []
  );

  const keyExtractor = useCallback((item: DraggableQueueItem) => item.key, []);

  return (
    <View style={[styles.root, Platform.OS === "android" && { maxHeight: height * 0.85 }]}>
      <View style={styles.sheet}>
        <GestureDetector gesture={androidSheetSwipeGesture}>
          <View style={styles.headerContent}>
            <View style={styles.grabber} />

            <Text style={styles.title}>Queue</Text>
            <Text style={styles.subtitle}>Playing Queue</Text>

            {nowPlaying ? (
              <Pressable
                style={({ pressed }) => [styles.nowPlayingRow, pressed && styles.rowPressed]}
                onPress={() => router.push("/player")}
              >
                <Image
                  recyclingKey={nowPlaying.id}
                  source={{ uri: nowPlaying.coverUrl }}
                  style={styles.nowArtwork}
                  contentFit="cover"
                />
                <View style={styles.nowText}>
                  <Text style={styles.nowTitle} numberOfLines={1}>
                    {nowPlaying.title}
                  </Text>
                  <View style={styles.nowMetaRow}>
                    <Ionicons name="list" size={20} color={Colors.primary} />
                    <Text style={styles.nowArtist} numberOfLines={1}>
                      {nowPlaying.artist || "Unknown Artist"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={togglePlay}
                  hitSlop={10}
                  style={styles.playButton}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={34}
                    color="#111111"
                    style={!isPlaying ? { marginLeft: 2 } : undefined}
                  />
                </Pressable>
              </Pressable>
            ) : null}

            {upcomingQueue.length > 0 && isShuffled ? (
              <View style={styles.shufflingRow}>
                <Ionicons name="shuffle" size={23} color="#BEBEBE" />
                <Text style={styles.shufflingText}>Shuffling from:</Text>
              </View>
            ) : null}
            </View>
        </GestureDetector>

        <View style={styles.listWrap}>
          {listReady ? (
            <DraggableFlatList
              data={data}
              containerStyle={styles.list}
              style={styles.list}
              renderItem={renderQueueSong}
              keyExtractor={keyExtractor}
              onDragBegin={handleDragBegin}
              onDragEnd={handleDragEnd}
              onPlaceholderIndexChange={handlePlaceholderIndexChange}
              activationDistance={8}
              autoscrollThreshold={148}
              autoscrollSpeed={150}
              dragItemOverflow
              animationConfig={{
                damping: 26,
                mass: 0.55,
                stiffness: 180,
                overshootClamping: true,
              }}
              contentContainerStyle={styles.songListContent}
              ListFooterComponent={<View style={{ height: bottomListSpacer }} />}
              ListEmptyComponent={
                nowPlaying ? null : (
                  <View style={styles.emptyState}>
                    <Ionicons name="list" size={42} color="#777777" />
                    <Text style={styles.emptyTitle}>Queue is empty</Text>
                    <Text style={styles.emptySubtitle}>Add songs to your queue to see them here</Text>
                  </View>
                )
              }
              showsVerticalScrollIndicator={false}
              contentInsetAdjustmentBehavior="never"
              removeClippedSubviews={false}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              windowSize={9}
            />
          ) : (
            <View style={styles.deferredListPlaceholder} />
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
            onPress={handleShuffle}
          >
            <Ionicons name="shuffle" size={26} color={Colors.primary} />
            <Text style={[styles.controlLabel, styles.controlLabelActive]}>Shuffle</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
            onPress={handleTimer}
          >
            <Ionicons name="timer-outline" size={28} color={sleepTimer ? Colors.primary : "#FFFFFF"} />
            <Text style={[styles.controlLabel, sleepTimer && styles.controlLabelActive]}>
              {sleepTimer ? sleepTimer.label : "Timer"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHEET_BACKGROUND,
  },
  sheet: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: SHEET_BACKGROUND,
  },
  headerContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  songListContent: {
    paddingHorizontal: 18,
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  deferredListPlaceholder: {
    flex: 1,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: HANDLE_COLOR,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 19,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: "#D4D4D4",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    marginTop: 10,
  },
  rowPressed: {
    opacity: 0.72,
  },
  nowArtwork: {
    width: 42,
    height: 42,
    borderRadius: 5,
    backgroundColor: "#2A2A2A",
  },
  nowText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 8,
  },
  nowTitle: {
    color: Colors.primary,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  nowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  nowArtist: {
    flex: 1,
    color: "#D6D6D6",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
  },
  shufflingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    marginBottom: 6,
  },
  shufflingText: {
    color: "#BDBDBD",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
  },
  sectionHeader: {
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    color: "#BDBDBD",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
  },
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
  },
  draggingRow: {
    zIndex: 20,
  },
  rowLayer: {
    backgroundColor: SHEET_BACKGROUND,
  },
  removeAction: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "rgba(255,68,68,0.82)",
  },
  removeText: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_700Bold",
  },
  queueArtwork: {
    width: 48,
    height: 48,
    borderRadius: 5,
    backgroundColor: "#2A2A2A",
  },
  queueText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 12,
  },
  queueTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  queueArtist: {
    color: "#CFCFCF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  dragHandle: {
    width: 42,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingTop: 7,
    paddingHorizontal: 18,
    backgroundColor: SHEET_BACKGROUND,
  },
  controlButton: {
    width: 96,
    maxWidth: "46%",
    minHeight: 46,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CONTROL_BACKGROUND,
  },
  controlButtonPressed: {
    opacity: 0.75,
  },
  controlLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  controlLabelActive: {
    color: Colors.primary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    color: "#BDBDBD",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
