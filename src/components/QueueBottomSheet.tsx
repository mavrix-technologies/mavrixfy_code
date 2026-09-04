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
import { type Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { getSmartAutoplayModeLabel } from "@/lib/smartAutoplayConfig";


import { SHEET_BG, HANDLE_COLOR, s } from "./styles/queueBottomSheetStyles";

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

const queueItemKeyExtractor = (item: QueueItem) => item.key;

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

    const keyExtractor = queueItemKeyExtractor;

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

