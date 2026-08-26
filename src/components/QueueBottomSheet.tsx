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
  Platform,
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
  BottomSheetFooter,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ImpactFeedbackStyle } from "expo-haptics";

import Colors from "@/constants/colors";
import AdMobBanner from "@/components/AdMobBanner";
import { usePlayerActions } from "@/contexts/PlayerContext";
import {
  usePlaybackQueueState,
  usePlaybackPlayState,
} from "@/services/audio/PlaybackEngine";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { getSmartAutoplayModeLabel } from "@/lib/smartAutoplayConfig";


// ─── Constants ────────────────────────────────────────────────────────────────
const SHEET_BG = "#1A1A1A";
const HANDLE_COLOR = "#4A4A4A";

// ─── Types ────────────────────────────────────────────────────────────────────
type QueueItem = {
  song: Song;
  index: number;
  key: string;
  section: "user" | "playlist";
  isFirstInSection: boolean;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type QueueRowProps = {
  item: Song;
  itemIndex: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPress: (song: Song) => void;
  onDrag: () => void;
  isDragging?: boolean;
};

/** A single high-performance draggable queue row */
const QueueRow = React.memo(
  ({
    item,
    itemIndex,
    isCurrent,
    isPlaying,
    onPress,
    onDrag,
    isDragging,
  }: QueueRowProps) => {
    const handlePress = useCallback(() => {
      if (isDragging) return;
      onPress(item);
    }, [isDragging, item, onPress]);

    return (
      <View style={[s.rowLayer, isDragging && s.draggingRow]}>
        <Pressable
          style={({ pressed }) => [s.row, pressed && !isDragging && s.rowPressed]}
          onPress={handlePress}
          disabled={isDragging}
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

          {/* Drag Handle — Long press initiates smooth lift and reorder */}
          <Pressable
            style={s.dragHandle}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 14 }}
            delayLongPress={100}
            onLongPress={onDrag}
            accessibilityRole="button"
            accessibilityLabel="Drag to reorder"
          >
            <Ionicons
              name="menu"
              size={22}
              color={isDragging ? Colors.primary : "#8E8E93"}
            />
          </Pressable>
        </Pressable>
      </View>
    );
  }
);
QueueRow.displayName = "QueueRow";

type QueueHeaderProps = {
  upcomingQueueLength: number;
};
const QueueHeader = React.memo(({ upcomingQueueLength }: QueueHeaderProps) => {
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

type QueueSmartAutoplayProps = {
  enabled: boolean;
  isRefreshing: boolean;
  modeLabel: string;
  basisLabels: string[];
  generatedCount: number;
};

const QueueSmartAutoplay = React.memo(
  ({ enabled, isRefreshing, modeLabel, basisLabels, generatedCount }: QueueSmartAutoplayProps) => {
    if (!enabled) return null;
    const hasBasis = basisLabels.length > 0;

    return (
      <View style={s.smartWrap}>
        <View style={s.smartHeaderRow}>
          <View style={s.smartBadge}>
            <Ionicons name="sparkles-outline" size={12} color={Colors.primary} />
            <Text style={s.smartBadgeText}>Generated for You</Text>
          </View>
          <Text style={s.smartModeText} numberOfLines={1}>
            {isRefreshing ? "Refreshing" : modeLabel}
          </Text>
        </View>
        <Text style={s.smartBasisText} numberOfLines={1}>
          {hasBasis
            ? `Based on: ${basisLabels.join(" • ")}`
            : generatedCount > 0
              ? `${generatedCount} recommended songs ready`
              : "Smart Autoplay will fill your next songs"}
        </Text>
      </View>
    );
  }
);
QueueSmartAutoplay.displayName = "QueueSmartAutoplay";

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

const SMART_AUTOPLAY_STATUS = {
  enabled: false,
  isRefreshing: false,
  mode: "similar-trending" as const,
  basisLabels: [],
  generatedCount: 0,
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- queue gestures, sheet index state, and playback actions are tightly coordinated in this bottom sheet.
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
      reorderQueue,
      shuffleQueue,
      sleepTimer,
      togglePlay,
    } = usePlayerActions();

    const smartAutoplayStatus = SMART_AUTOPLAY_STATUS;

    const lastPlaceholderRef = useRef<number | null>(null);
    const currentSheetIndexRef = useRef(-1);
    const isClosingRef = useRef(false);
    const [isSheetMounted, setIsSheetMounted] = useState(false);
    const [listReady] = useState(true);

    const finishClosedSheet = useCallback(() => {
      isClosingRef.current = false;
      currentSheetIndexRef.current = -1;
      setIsSheetMounted(false);
    }, []);

    const expandSheet = useCallback(() => {
      if (!isSheetMounted) {
        setIsSheetMounted(true);
      }
      requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex(0);
      });
    }, [isSheetMounted]);

    const closeSheet = useCallback(() => {
      sheetRef.current?.close();
    }, []);

    // Expose imperative handle
    React.useImperativeHandle(ref, () => ({
      expand: expandSheet,
      collapse: closeSheet,
      close: closeSheet,
    }), [closeSheet, expandSheet]);

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

    const smartModeLabel = useMemo(
      () => getSmartAutoplayModeLabel(smartAutoplayStatus.mode),
      [smartAutoplayStatus.mode]
    );

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSongPress = useCallback(
      (song: Song) => {
        playSong(song, queue);
      },
      [playSong, queue]
    );

    const handleDragBegin = useCallback(() => {
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
      closeSheet();
      router.push("/sleep-timer");
    }, [closeSheet]);

    // ── Render item ──────────────────────────────────────────────────────────
    const renderItem = useCallback(
      ({ item, drag, isActive }: RenderItemParams<QueueItem>) => (
        <ScaleDecorator activeScale={1.03}>
          <View style={isActive ? s.draggingRow : undefined}>
            {item.isFirstInSection ? (
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>
                  {item.section === "user"
                    ? "Added to queue"
                    : smartAutoplayStatus.enabled
                      ? "Generated for You"
                      : "Playing next"}
                </Text>
              </View>
            ) : null}
            <QueueRow
              item={item.song}
              itemIndex={item.index}
              isCurrent={false}
              isPlaying={isPlaying}
              onPress={handleSongPress}
              onDrag={drag}
              isDragging={isActive}
            />
          </View>
        </ScaleDecorator>
      ),
      [handleSongPress, isPlaying, smartAutoplayStatus.enabled]
    );

    const keyExtractor = useCallback((item: QueueItem) => item.key, []);

    // ── Backdrop ─────────────────────────────────────────────────────────────
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.52}
          pressBehavior="close"
        />
      ),
      []
    );

    const renderHandle = useCallback(
      () => (
        <QueueHeader
          upcomingQueueLength={upcomingQueue.length}
        />
      ),
      [upcomingQueue.length]
    );

    // ── Snap points ──────────────────────────────────────────────────────────
    // Full Spotify height queue sheet with downward swipe to dismiss.
    const snapPoints = useMemo(() => ["94%"], []);

    const bottomPad = Math.max(insets.bottom, 12);

    const renderFooter = useCallback(
      (props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props} bottomInset={0}>
          <QueueFooter
            sleepTimer={sleepTimer}
            bottomPad={bottomPad}
            handleShuffle={handleShuffle}
            handleTimer={handleTimer}
          />
        </BottomSheetFooter>
      ),
      [sleepTimer, bottomPad, handleShuffle, handleTimer]
    );

    const handleNowPlayingPress = useCallback(() => {
      closeSheet();
      router.push("/player");
    }, [closeSheet]);

    const handleSheetChange = useCallback(
      (index: number) => {
        currentSheetIndexRef.current = index;
        if (index >= 0) {
          isClosingRef.current = false;
        }
        onSheetChange?.(index);
      },
      [onSheetChange]
    );

    if (!isSheetMounted) {
      return null;
    }

    return (
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        animateOnMount
        enablePanDownToClose
        enableDynamicSizing={false}
        handleComponent={renderHandle}
        backdropComponent={renderBackdrop}
        footerComponent={renderFooter}
        backgroundStyle={s.sheetBg}
        onChange={handleSheetChange}
        onClose={finishClosedSheet}
        style={{ zIndex: 999 }}
        // Native spring physics identical to Spotify feel
        animationConfigs={{
          damping: 24,
          mass: 0.8,
          stiffness: 260,
          overshootClamping: false,
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

        <QueueSmartAutoplay
          enabled={smartAutoplayStatus.enabled}
          isRefreshing={smartAutoplayStatus.isRefreshing}
          modeLabel={smartModeLabel}
          basisLabels={smartAutoplayStatus.basisLabels}
          generatedCount={smartAutoplayStatus.generatedCount}
        />

        <AdMobBanner loadDelayMs={600} />

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
            activationDistance={10}
            autoscrollThreshold={120}
            autoscrollSpeed={160}
            dragItemOverflow
            animationConfig={{
              damping: 28,
              mass: 0.5,
              stiffness: 220,
              overshootClamping: true,
            }}
            containerStyle={s.list}
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="list" size={40} color="#4A4A4A" />
                <Text style={s.emptyTitle}>Queue is empty</Text>
                <Text style={s.emptySubtitle}>
                  Add songs to your queue to see them here
                </Text>
              </View>
            }
            ListFooterComponent={<View style={{ height: bottomPad + 76 }} />}
          />
        ) : (
          <View style={s.listPlaceholder} />
        )}
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

  // Smart Autoplay
  smartWrap: {
    marginHorizontal: 18,
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(29,185,84,0.09)",
    borderWidth: 1,
    borderColor: "rgba(29,185,84,0.20)",
  },
  smartHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  smartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  smartBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  smartModeText: {
    flexShrink: 1,
    color: Colors.primary,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  smartBasisText: {
    marginTop: 5,
    color: "#A9A9A9",
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
  rowRemoveBtn: {
    width: 36,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dragHandle: {
    width: 40,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 18,
    backgroundColor: SHEET_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexShrink: 0,
    zIndex: 10,
  },
  ctrlBtn: {
    flex: 1,
    maxWidth: 160,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctrlBtnPressed: {
    opacity: 0.72,
  },
  ctrlLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  ctrlLabelActive: {
    color: Colors.primary,
  },
});
