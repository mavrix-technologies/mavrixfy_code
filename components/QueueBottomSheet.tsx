/**
 * QueueBottomSheet — Spotify-style queue panel that slides up from inside the
 * player screen. Driven by @gorhom/bottom-sheet with native spring physics.
 *
 * Features:
 *  - Two snap points: collapsed (pill handle) → fully expanded (full queue)
 *  - Drag-to-reorder with DraggableFlatList
 *  - Swipe-left to remove individual tracks
 *  - Section dividers: "Added to queue" vs "Playing next"
 *  - Now-playing row at the top with play/pause toggle
 *  - Shuffle & sleep-timer footer buttons
 *  - Smooth backdrop dim that tracks sheet position via Reanimated
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { Swipeable } from "react-native-gesture-handler";
import { ImpactFeedbackStyle } from "expo-haptics";

import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import {
  usePlaybackQueueState,
  usePlaybackPlayState,
} from "@/lib/playbackEngine";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";


// ─── Constants ────────────────────────────────────────────────────────────────
const SHEET_BG = "#1A1A1A";
const HANDLE_COLOR = "#4A4A4A";
const SWIPE_WIDTH = 92;

// ─── Types ────────────────────────────────────────────────────────────────────
type QueueItem = {
  song: Song;
  index: number;
  key: string;
  section: "user" | "playlist";
  isFirstInSection: boolean;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single swipeable + draggable queue row */
const QueueRow = React.memo(
  ({
    item,
    itemIndex,
    isCurrent,
    isPlaying,
    onPress,
    onRemoveAt,
    onSwipeOpen,
    onDrag,
    isDragging,
  }: {
    item: Song;
    itemIndex: number;
    isCurrent: boolean;
    isPlaying: boolean;
    onPress: (song: Song) => void;
    onRemoveAt: (index: number) => void;
    onSwipeOpen: (ref: Swipeable | null) => void;
    onDrag: () => void;
    isDragging?: boolean;
  }) => {
    const swipeRef = useRef<Swipeable | null>(null);

    const handleRemove = useCallback(() => {
      swipeRef.current?.close();
      triggerImpact(ImpactFeedbackStyle.Light);
      onRemoveAt(itemIndex);
    }, [itemIndex, onRemoveAt]);

    const handlePress = useCallback(() => {
      swipeRef.current?.close();
      onPress(item);
    }, [item, onPress]);

    const renderRight = useCallback(
      () => (
        <Pressable style={s.removeAction} onPress={handleRemove}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
          <Text style={s.removeText}>Remove</Text>
        </Pressable>
      ),
      [handleRemove]
    );

    return (
      <ScaleDecorator activeScale={1.03}>
        <View style={[s.swipeWrap, isDragging && s.draggingRow]}>
          <Swipeable
            ref={swipeRef}
            enabled={!isDragging}
            friction={1.25}
            rightThreshold={22}
            overshootRight={false}
            renderRightActions={renderRight}
            onSwipeableWillOpen={() => onSwipeOpen(swipeRef.current)}
          >
            <View style={s.rowLayer}>
              <Pressable
                style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                onPress={handlePress}
                accessibilityRole="button"
                accessibilityLabel={`${isCurrent ? "Now playing: " : ""}${item.title} by ${item.artist || "Unknown"}`}
              >
                {/* Artwork */}
                <View style={s.artWrap}>
                  <Image
                    recyclingKey={item.id}
                    source={{ uri: item.coverUrl }}
                    style={s.artwork}
                    contentFit="cover"
                  />
                  {isCurrent && (
                    <View style={s.artOverlay}>
                      <Ionicons
                        name={isPlaying ? "pause" : "play"}
                        size={14}
                        color="#FFFFFF"
                        style={!isPlaying ? { marginLeft: 1 } : undefined}
                      />
                    </View>
                  )}
                </View>

                {/* Text */}
                <View style={s.textWrap}>
                  <Text
                    style={[s.title, isCurrent && s.titleActive]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={s.artist} numberOfLines={1}>
                    {item.artist || "Unknown Artist"}
                  </Text>
                </View>

                {/* Drag handle */}
                <Pressable
                  style={s.dragHandle}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  delayLongPress={120}
                  onLongPress={onDrag}
                  accessibilityRole="button"
                  accessibilityLabel="Drag to reorder"
                >
                  <Ionicons
                    name="menu"
                    size={22}
                    color={isDragging ? Colors.primary : "#585858"}
                  />
                </Pressable>
              </Pressable>
            </View>
          </Swipeable>
        </View>
      </ScaleDecorator>
    );
  }
);
QueueRow.displayName = "QueueRow";

type QueueHeaderProps = {
  upcomingQueueLength: number;
  onClose: () => void;
};
const QueueHeader = React.memo(({ upcomingQueueLength, onClose }: QueueHeaderProps) => {
  return (
    <View style={s.handleContainer}>
      <View style={s.handle} />
      <View style={s.handleTitleRow}>
        <View style={s.handleTitleLeft}>
          <Text style={s.handleTitle}>Queue</Text>
          {upcomingQueueLength > 0 && (
            <Text style={s.handleSubtitle}>
              {upcomingQueueLength} upcoming
            </Text>
          )}
        </View>
        <Pressable
          style={s.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Close queue"
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
});
QueueHeader.displayName = "QueueHeader";

type QueueNowPlayingProps = {
  nowPlaying: Song | null;
  isPlaying: boolean;
  isShuffled: boolean;
  upcomingQueueLength: number;
  onPress: () => void;
  togglePlay: () => void;
};
const QueueNowPlaying = React.memo(
  ({
    nowPlaying,
    isPlaying,
    isShuffled,
    upcomingQueueLength,
    onPress,
    togglePlay,
  }: QueueNowPlayingProps) => {
    if (!nowPlaying) return null;
    return (
      <View style={s.nowPlayingWrap}>
        <Pressable
          style={({ pressed }) => [s.nowPlayingRow, pressed && s.rowPressed]}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Now playing: ${nowPlaying.title}`}
        >
          <Image
            recyclingKey={nowPlaying.id}
            source={{ uri: nowPlaying.coverUrl }}
            style={s.nowArtwork}
            contentFit="cover"
          />
          <View style={s.nowTextWrap}>
            <View style={s.nowBadgeRow}>
              <View style={s.nowBadge}>
                <Ionicons name="musical-note" size={9} color={Colors.primary} />
                <Text style={s.nowBadgeText}>Now playing</Text>
              </View>
            </View>
            <Text style={s.nowTitle} numberOfLines={1}>
              {nowPlaying.title}
            </Text>
            <Text style={s.nowArtist} numberOfLines={1}>
              {nowPlaying.artist || "Unknown Artist"}
            </Text>
          </View>
          <Pressable
            onPress={togglePlay}
            hitSlop={10}
            style={s.playBtn}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={28}
              color="#111111"
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          </Pressable>
        </Pressable>

        {upcomingQueueLength > 0 && isShuffled && (
          <View style={s.shuffleRow}>
            <Ionicons name="shuffle" size={16} color="#9E9E9E" />
            <Text style={s.shuffleText}>Shuffling from playlist</Text>
          </View>
        )}
      </View>
    );
  }
);
QueueNowPlaying.displayName = "QueueNowPlaying";

type QueueFooterProps = {
  sleepTimer: { label: string } | null;
  bottomPad: number;
  handleShuffle: () => void;
  handleTimer: () => void;
};
const QueueFooter = React.memo(
  ({ sleepTimer, bottomPad, handleShuffle, handleTimer }: QueueFooterProps) => {
    return (
      <View style={[s.footer, { paddingBottom: bottomPad }]}>
        <Pressable
          style={({ pressed }) => [s.ctrlBtn, pressed && s.ctrlBtnPressed]}
          onPress={handleShuffle}
          accessibilityRole="button"
          accessibilityLabel="Shuffle queue"
        >
          <Ionicons name="shuffle" size={22} color={Colors.primary} />
          <Text style={[s.ctrlLabel, s.ctrlLabelActive]}>Shuffle</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [s.ctrlBtn, pressed && s.ctrlBtnPressed]}
          onPress={handleTimer}
          accessibilityRole="button"
          accessibilityLabel={
            sleepTimer ? `Sleep timer: ${sleepTimer.label}` : "Sleep timer"
          }
        >
          <Ionicons
            name="timer-outline"
            size={24}
            color={sleepTimer ? Colors.primary : "#FFFFFF"}
          />
          <Text style={[s.ctrlLabel, sleepTimer && s.ctrlLabelActive]}>
            {sleepTimer ? sleepTimer.label : "Timer"}
          </Text>
        </Pressable>
      </View>
    );
  }
);
QueueFooter.displayName = "QueueFooter";

// ─── Main exported component ─────────────────────────────────────────────────

export type QueueBottomSheetRef = {
  expand: () => void;
  collapse: () => void;
  close: () => void;
};

type Props = {
  /** Pass a callback so the player can tell if the sheet is open */
  onSheetChange?: (index: number) => void;
  ref?: React.Ref<QueueBottomSheetRef>;
};

const QueueBottomSheet = ({ onSheetChange, ref }: Props) => {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);

    // ── Queue state ──────────────────────────────────────────────────────────
    const {
      queue,
      userQueuedSongIds,
      queueIndex,
      currentSong,
      isShuffled,
    } = usePlaybackQueueState();
    const { isPlaying } = usePlaybackPlayState();
    const {
      playSong,
      removeFromQueue,
      reorderQueue,
      shuffleQueue,
      sleepTimer,
      togglePlay,
    } = usePlayerActions();

    const openSwipeRef = useRef<Swipeable | null>(null);
    const lastPlaceholderRef = useRef<number | null>(null);
    const [listReady, setListReady] = useState(false);
    const didMountRef = useRef(false);

    // Deferred list mount — avoids janking the sheet open animation
    const showList = useCallback(() => {
      if (didMountRef.current) return;
      didMountRef.current = true;
      setListReady(true);
    }, []);

    useEffect(() => {
      didMountRef.current = false;
      setListReady(false);
      const task = InteractionManager.runAfterInteractions(() => {
        setTimeout(showList, 60);
      });
      const fallback = setTimeout(showList, 240);
      return () => {
        task.cancel();
        clearTimeout(fallback);
      };
    }, [showList]);

    // Expose imperative handle
    React.useImperativeHandle(ref, () => ({
      expand: () => sheetRef.current?.expand(),
      collapse: () => sheetRef.current?.collapse(),
      close: () => sheetRef.current?.close(),
    }));

    // ── Derived queue data ───────────────────────────────────────────────────
    const nowPlaying = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;

    const upcomingQueue = useMemo(() => {
      const start = currentSong ? Math.max(0, queueIndex + 1) : 0;
      return queue.slice(start).filter((s) => Boolean(s?.id));
    }, [currentSong, queue, queueIndex]);

    const userQueuedCount = useMemo(() => {
      const start = currentSong ? Math.max(0, queueIndex + 1) : 0;
      return Math.max(
        0,
        Math.min(userQueuedSongIds.length, queue.length - start)
      );
    }, [currentSong, queue.length, queueIndex, userQueuedSongIds.length]);

    const data: QueueItem[] = useMemo(() => {
      const start = currentSong ? Math.max(0, queueIndex + 1) : 0;
      return upcomingQueue.map((song, idx) => ({
        song,
        index: start + idx,
        key: `${song.id}-${start + idx}`,
        section: idx < userQueuedCount ? "user" : "playlist",
        isFirstInSection: idx === 0 || idx === userQueuedCount,
      }));
    }, [currentSong, queueIndex, upcomingQueue, userQueuedCount]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSongPress = useCallback(
      (song: Song) => {
        openSwipeRef.current?.close();
        playSong(song, queue);
      },
      [playSong, queue]
    );

    const handleSwipeOpen = useCallback((ref: Swipeable | null) => {
      if (openSwipeRef.current && openSwipeRef.current !== ref) {
        openSwipeRef.current.close();
      }
      openSwipeRef.current = ref;
    }, []);

    const handleDragBegin = useCallback(() => {
      openSwipeRef.current?.close();
      lastPlaceholderRef.current = null;
      triggerImpact(ImpactFeedbackStyle.Medium);
    }, []);

    const handleDragEnd = useCallback(
      ({ from, to }: { from: number; to: number }) => {
        lastPlaceholderRef.current = null;
        if (from === to) return;
        triggerImpact(ImpactFeedbackStyle.Light);
        const start = currentSong ? Math.max(0, queueIndex + 1) : 0;
        void reorderQueue(start + from, start + to);
      },
      [currentSong, queueIndex, reorderQueue]
    );

    const handleShuffle = useCallback(() => {
      triggerImpact(ImpactFeedbackStyle.Medium);
      void shuffleQueue();
    }, [shuffleQueue]);

    const handleTimer = useCallback(() => {
      triggerImpact(ImpactFeedbackStyle.Light);
      sheetRef.current?.close();
      router.push("/sleep-timer");
    }, []);

    // ── Render item ──────────────────────────────────────────────────────────
    const renderItem = useCallback(
      ({ item, drag, isActive }: RenderItemParams<QueueItem>) => (
        <View>
          {item.isFirstInSection ? (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>
                {item.section === "user" ? "Added to queue" : "Playing next"}
              </Text>
            </View>
          ) : null}
          <QueueRow
            item={item.song}
            itemIndex={item.index}
            isCurrent={false}
            isPlaying={isPlaying}
            onPress={handleSongPress}
            onRemoveAt={removeFromQueue}
            onSwipeOpen={handleSwipeOpen}
            onDrag={drag}
            isDragging={isActive}
          />
        </View>
      ),
      [handleSongPress, handleSwipeOpen, isPlaying, removeFromQueue]
    );

    const keyExtractor = useCallback((item: QueueItem) => item.key, []);

    // ── Backdrop ─────────────────────────────────────────────────────────────
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={0}
          appearsOnIndex={1}
          opacity={0.52}
          pressBehavior="collapse"
        />
      ),
      []
    );

    const handleClose = useCallback(() => {
      triggerImpact(ImpactFeedbackStyle.Light);
      sheetRef.current?.close();
    }, []);

    const renderHandle = useCallback(
      () => (
        <QueueHeader
          upcomingQueueLength={upcomingQueue.length}
          onClose={handleClose}
        />
      ),
      [upcomingQueue.length, handleClose]
    );

    // ── Snap points ──────────────────────────────────────────────────────────
    // 0 = collapsed handle-only, 1 = 92% screen height (full queue)
    const snapPoints = useMemo(() => ["8%", "92%"], []);

    const bottomPad = Math.max(insets.bottom, 12);

    const handleNowPlayingPress = useCallback(() => {
      sheetRef.current?.close();
      router.push("/player");
    }, []);

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        handleComponent={renderHandle}
        backdropComponent={renderBackdrop}
        backgroundStyle={s.sheetBg}
        onChange={onSheetChange}
        style={{ zIndex: 999 }}
        // Native spring physics identical to Spotify feel
        animationConfigs={{
          damping: 80,
          mass: 1,
          stiffness: 400,
          overshootClamping: true,
        }}
      >
        {/* ── Now playing ──────────────────────────────────────────────── */}
        <QueueNowPlaying
          nowPlaying={nowPlaying}
          isPlaying={isPlaying}
          isShuffled={isShuffled}
          upcomingQueueLength={upcomingQueue.length}
          onPress={handleNowPlayingPress}
          togglePlay={togglePlay}
        />

        {/* ── Upcoming queue list ──────────────────────────────────────── */}
        {listReady ? (
          <DraggableFlatList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onDragBegin={handleDragBegin}
            onDragEnd={handleDragEnd}
            onPlaceholderIndexChange={(i) => {
              lastPlaceholderRef.current = i;
            }}
            activationDistance={8}
            autoscrollThreshold={148}
            autoscrollSpeed={140}
            dragItemOverflow
            animationConfig={{
              damping: 26,
              mass: 0.55,
              stiffness: 180,
              overshootClamping: true,
            }}
            containerStyle={s.list}
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={9}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="list" size={40} color="#4A4A4A" />
                <Text style={s.emptyTitle}>Queue is empty</Text>
                <Text style={s.emptySubtitle}>
                  Add songs to your queue to see them here
                </Text>
              </View>
            }
            ListFooterComponent={<View style={{ height: bottomPad + 32 }} />}
          />
        ) : (
          <View style={s.listPlaceholder} />
        )}

        {/* ── Footer controls ──────────────────────────────────────────── */}
        <QueueFooter
          sleepTimer={sleepTimer}
          bottomPad={bottomPad}
          handleShuffle={handleShuffle}
          handleTimer={handleTimer}
        />
      </BottomSheet>
    );
  };

QueueBottomSheet.displayName = "QueueBottomSheet";
export default QueueBottomSheet;

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Sheet
  sheetBg: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Handle area
  handleContainer: {
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 4,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 8,
    backgroundColor: HANDLE_COLOR,
    marginBottom: 14,
  },
  handleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  handleTitleLeft: {
    gap: 2,
  },
  handleTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
  },
  handleSubtitle: {
    color: "#8A8A8A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Now playing section
  nowPlayingWrap: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 4,
  },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  nowArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
    flexShrink: 0,
  },
  nowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  nowBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  nowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(29,185,84,0.14)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nowBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nowTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  nowArtist: {
    color: "#B0B0B0",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 1,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Shuffle hint
  shuffleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  shuffleText: {
    color: "#9E9E9E",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // Section headers
  sectionHeader: {
    paddingTop: 18,
    paddingBottom: 7,
    paddingHorizontal: 18,
  },
  sectionTitle: {
    color: "#8A8A8A",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1.0,
  },

  // Queue row
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
  },
  draggingRow: {
    zIndex: 20,
  },
  rowLayer: {
    backgroundColor: SHEET_BG,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingHorizontal: 18,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  artWrap: {
    position: "relative",
    width: 48,
    height: 48,
    flexShrink: 0,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
  },
  artOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  titleActive: {
    color: Colors.primary,
  },
  artist: {
    color: "#8A8A8A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 2,
  },
  dragHandle: {
    width: 40,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Swipe remove action
  removeAction: {
    width: SWIPE_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "rgba(255,60,60,0.85)",
  },
  removeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  listPlaceholder: {
    flex: 1,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    color: "#8A8A8A",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingTop: 8,
    paddingHorizontal: 18,
    backgroundColor: SHEET_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  ctrlBtn: {
    width: 102,
    maxWidth: "46%",
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  ctrlBtnPressed: {
    opacity: 0.72,
  },
  ctrlLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 14,
  },
  ctrlLabelActive: {
    color: Colors.primary,
  },
});
