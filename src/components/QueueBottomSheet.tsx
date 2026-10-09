/** Queue sheet: the list owns scrolling/reordering; the header owns dismissal. */

import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { ImpactFeedbackStyle } from "expo-haptics";
import { Image } from "expo-image";
import QueueSleepTimer from "@/features/player/components/QueueSleepTimer";
import { PlayerPlayButton } from "@/features/player/components/PlayerControlComponents";
import { expandPlayer } from "@/lib/playerUIState";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  type ViewToken,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AdMobBanner from "@/components/AdMobBanner";
import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { triggerImpact } from "@/lib/haptics";
import { type Song } from "@/lib/musicData";
import type { QueueBottomSheetRef } from "@/lib/queueRef";
import {
  usePlaybackPlayState,
  usePlaybackQueueState,
} from "@/services/audio/PlaybackEngine";
import { resolveQueueDragMove } from "@/services/audio/queueDrag";

import { QUEUE_ROW_HEIGHT, s } from "./styles/queueBottomSheetStyles";

// ─── Types ────────────────────────────────────────────────────────────────────
type QueueItem = {
  song: Song;
  key: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type QueueRowProps = {
  item: Song;
  onPress: (song: Song) => void;
  onDrag: () => void;
  isDragging?: boolean;
};

/** A single high-performance draggable queue row */
const QueueRow = React.memo(
  ({
    item,
    onPress,
    onDrag,
    isDragging,
  }: QueueRowProps) => {
    const handlePress = useCallback(() => {
      if (isDragging) return;
      onPress(item);
    }, [isDragging, item, onPress]);

    return (
      <View style={[s.row, s.rowLayer]}>
        <Pressable
          style={({ pressed }) => [s.rowContent, pressed && !isDragging && s.rowPressed]}
          onPress={handlePress}
          disabled={isDragging}
          accessibilityRole="button"
          accessibilityLabel={`${item.title} by ${item.artist || "Unknown"}`}
        >
          <View style={s.artWrap}>
            <Image
              recyclingKey={item.id}
              source={{ uri: item.coverUrl }}
              style={s.artwork}
              contentFit="cover"
            />
          </View>

          <View style={s.textWrap}>
            <Text
              style={s.title}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={s.artist} numberOfLines={1}>
              {item.artist || "Unknown Artist"}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={s.dragHandle}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
          onPressIn={onDrag}
          accessibilityRole="button"
          accessibilityLabel="Drag to reorder"
        >
          <Ionicons
            name="menu"
            size={22}
            color={isDragging ? Colors.primary : "#8E8E93"}
          />
        </Pressable>
      </View>
    );
  }
);
QueueRow.displayName = "QueueRow";

type QueueHeaderProps = {
  upcomingQueueLength: number;
  isShuffled: boolean;
  sleepTimer: { label: string } | null;
  onShuffle: () => void;
  onTimer: () => void;
};
const QueueHeader = React.memo(({ upcomingQueueLength, isShuffled, sleepTimer, onShuffle, onTimer }: QueueHeaderProps) => {
  return (
    <View style={s.queueHeader}>
      <View style={s.handleTitleRow}>
        <View style={s.handleTitleLeft}>
          <Text style={s.handleTitle}>Queue</Text>
          <Text style={s.handleSubtitle} numberOfLines={1}>
            {upcomingQueueLength > 0 ? `${upcomingQueueLength} upcoming` : "No upcoming songs"}
          </Text>
        </View>
        <View style={s.headerControls}>
          <Pressable
            style={({ pressed }) => [s.headerButton, isShuffled && s.headerButtonActive, pressed && s.rowPressed]}
            onPress={onShuffle}
            accessibilityRole="button"
            accessibilityLabel="Shuffle queue"
            accessibilityState={{ selected: isShuffled }}
          >
            <Ionicons name="shuffle" size={22} color={isShuffled ? Colors.primary : "#FFFFFF"} />
            <Text style={[s.headerButtonLabel, isShuffled && s.headerButtonLabelActive]} numberOfLines={1}>Shuffle</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.headerButton, sleepTimer && s.headerButtonActive, pressed && s.rowPressed]}
            onPress={onTimer}
            accessibilityRole="button"
            accessibilityLabel={sleepTimer ? `Sleep timer: ${sleepTimer.label}` : "Sleep timer"}
          >
            <Ionicons name="timer-outline" size={22} color={sleepTimer ? Colors.primary : "#FFFFFF"} />
            <Text style={[s.headerButtonLabel, sleepTimer && s.headerButtonLabelActive]} numberOfLines={1}>
              {sleepTimer?.label ?? "Timer"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});
QueueHeader.displayName = "QueueHeader";

type QueueNowPlayingProps = {
  nowPlaying: Song | null;
  onPress: () => void;
};
const QueueNowPlaying = React.memo(
  ({
    nowPlaying,
    onPress,
  }: QueueNowPlayingProps) => {
    const { isPlaying } = usePlaybackPlayState();
    const { togglePlay } = usePlayerActions();
    if (!nowPlaying) return null;
    return (
      <View style={s.nowPlayingWrap}>
        <Text style={s.nowLabel}>Now playing</Text>
        <View style={s.nowPlayingRow}>
          <Pressable
            style={({ pressed }) => [s.rowContent, pressed && s.rowPressed]}
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
              <Text style={s.nowTitle} numberOfLines={1}>
                {nowPlaying.title}
              </Text>
              <Text style={s.nowArtist} numberOfLines={1}>
                {nowPlaying.artist || "Unknown Artist"}
              </Text>
            </View>
          </Pressable>
          <PlayerPlayButton
            active={isPlaying}
            buttonSize={44}
            iconSize={24}
            onAccentColor={Colors.primary}
            style={s.playBtn}
            onPress={togglePlay}
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          />
        </View>
      </View>
    );
  }
);
QueueNowPlaying.displayName = "QueueNowPlaying";

// ─── Main exported component ─────────────────────────────────────────────────

export type { QueueBottomSheetRef } from "@/lib/queueRef";

type Props = {
  /** Pass a callback so the player can tell if the sheet is open */
  onSheetChange?: (index: number) => void;
  ref?: React.Ref<QueueBottomSheetRef>;
};

const queueItemKeyExtractor = (item: QueueItem) => item.key;
const getQueueItemLayout = (_data: unknown, index: number) => ({
  index, length: QUEUE_ROW_HEIGHT, offset: QUEUE_ROW_HEIGHT * index,
});
const QUEUE_SNAP_POINTS = ["94%"];
const QUEUE_SPRING = { damping: 24, mass: 0.8, stiffness: 260, overshootClamping: true };
const ROW_SPRING = { damping: 28, mass: 0.5, stiffness: 220, overshootClamping: true };

type QueueContentProps = {
  interactionReady: boolean;
  onClose: () => void;
  onReady: () => void;
};

/** Playback subscriptions and list allocations exist only while the sheet is visible. */
const QueueContent = React.memo(({ interactionReady, onClose, onReady }: QueueContentProps) => {
  const insets = useSafeAreaInsets();
  const [timerOpen, setTimerOpen] = useState(false);
  const handleTimerBack = useCallback(() => setTimerOpen(false), []);

  useEffect(() => {
    if (Platform.OS !== "android" || !timerOpen) return;
    // Registered after the shell handler, so Back returns to the queue first.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleTimerBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleTimerBack, timerOpen]);

  // ── Queue state ──────────────────────────────────────────────────────────
  const {
    queue,
    queueIndex,
    currentSong,
    isShuffled,
  } = usePlaybackQueueState();
  const {
    playSong,
    reorderQueue,
    shuffleQueue,
    sleepTimer,
  } = usePlayerActions();

  const queueRef = useRef(queue);
  useLayoutEffect(() => { queueRef.current = queue; }, [queue]);
  const dragItemRef = useRef<{ visibleSongs: Song[]; from: number } | null>(null);

  // ── Derived queue data ───────────────────────────────────────────────────
  const nowPlaying = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;

  const upcomingQueue = useMemo(() => {
    const start = currentSong ? Math.max(0, queueIndex + 1) : 0;
    return queue.slice(start).filter((s) => Boolean(s?.id));
  }, [currentSong, queue, queueIndex]);

  const data: QueueItem[] = useMemo(() => {
    const occurrences = new Map<string, number>();

    return upcomingQueue.map((song) => {
      const occurrence = occurrences.get(song.id) ?? 0;
      occurrences.set(song.id, occurrence + 1);
      return {
        song,
        key: `queue-entry:${song.id}:${occurrence}`,
      };
    });
  }, [upcomingQueue]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSongPress = useCallback(
    (song: Song) => {
      playSong(song, queueRef.current);
    },
    [playSong]
  );

  const handleDragBegin = useCallback((index: number) => {
    const item = data[index];
    dragItemRef.current = item
      ? { visibleSongs: data.map((entry) => entry.song), from: index }
      : null;
    triggerImpact(ImpactFeedbackStyle.Medium);
  }, [data]);

  const handleDragEnd = useCallback(
    ({ from, to }: { from: number; to: number; data: QueueItem[] }) => {
      const draggedItem = dragItemRef.current;
      dragItemRef.current = null;
      if (from === to) return;
      if (!draggedItem || from !== draggedItem.from) return;
      // DraggableFlatList's `to` is the final visible slot. Map it through
      // the order captured at drag start, because its `data` is already
      // reordered and `data[to]` would point back to the dragged song.
      const firstUpcomingIndex = currentSong ? Math.max(0, queueIndex + 1) : 0;
      const move = resolveQueueDragMove(
        queue,
        draggedItem.visibleSongs,
        from,
        to,
        firstUpcomingIndex,
      );
      if (move) {
        triggerImpact(ImpactFeedbackStyle.Light);
        void reorderQueue(move.from, move.to, { queue, queueIndex });
      }
    },
    [currentSong, queue, queueIndex, reorderQueue]
  );

  const handleShuffle = useCallback(() => {
    triggerImpact(ImpactFeedbackStyle.Medium);
    void shuffleQueue();
  }, [shuffleQueue]);

  const handleTimer = useCallback(() => {
    triggerImpact(ImpactFeedbackStyle.Light);
    setTimerOpen(true);
  }, []);

  // ── Render item ──────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<QueueItem>) => (
      <QueueRow
        item={item.song}
        onPress={handleSongPress}
        onDrag={drag}
        isDragging={isActive}
      />
    ),
    [handleSongPress]
  );

  const bottomPad = Math.max(insets.bottom, 12);

  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<QueueItem>[] }) => {
    if (viewableItems.some(item => item.isViewable)) onReady();
  }, [onReady]);

  const handleNowPlayingPress = useCallback(() => {
    onClose();
    expandPlayer();
  }, [onClose]);

  return (
    <BottomSheetView style={s.sheetContent} onLayout={data.length === 0 ? onReady : undefined}>
      {/* Keep the list mounted and measured so Back preserves its scroll position. */}
      <View style={[s.contentPage, timerOpen && s.hiddenPage]} pointerEvents={timerOpen ? "none" : "auto"}
        accessibilityElementsHidden={timerOpen} importantForAccessibility={timerOpen ? "no-hide-descendants" : "auto"}>
      <QueueHeader
        upcomingQueueLength={upcomingQueue.length}
        isShuffled={isShuffled}
        sleepTimer={sleepTimer}
        onShuffle={handleShuffle}
        onTimer={handleTimer}
      />
      {/* ── Now playing ──────────────────────────────────────────────── */}
      <QueueNowPlaying
        nowPlaying={nowPlaying}
        onPress={handleNowPlayingPress}
      />

      {interactionReady && <AdMobBanner />}

      {upcomingQueue.length > 0 && (
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Playing next</Text>
          <Text style={s.reorderHint}>Drag to reorder</Text>
        </View>
      )}

      {/* ── Upcoming queue list ──────────────────────────────────────── */}
      <DraggableFlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={queueItemKeyExtractor}
        getItemLayout={getQueueItemLayout}
        onDragBegin={handleDragBegin}
        onDragEnd={handleDragEnd}
        onViewableItemsChanged={handleViewableItemsChanged}
        activationDistance={10}
        autoscrollThreshold={96}
        autoscrollSpeed={100}
        animationConfig={ROW_SPRING}
        containerStyle={s.list}
        style={s.list}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
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
      />
      <View style={{ height: bottomPad }} />
      </View>
      {timerOpen && <QueueSleepTimer onBack={handleTimerBack} />}
    </BottomSheetView>
  );
});
QueueContent.displayName = "QueueContent";

type QueueSheetState = {
  index: -1 | 0;
  visible: boolean;
  interactionReady: boolean;
  revision: number;
};

/** Keep native layout ready; release the list only after a current close completes. */
const QueueBottomSheet = ({ onSheetChange, ref }: Props) => {
  const sheetRef = useRef<BottomSheet>(null);
  const contentReady = useRef(false);
  const revision = useRef(0);
  const closingRevision = useRef<number | null>(null);
  const [state, setState] = useState<QueueSheetState>({
    index: -1, visible: false, interactionReady: false, revision: 0,
  });

  const expandSheet = useCallback(() => {
    const nextRevision = ++revision.current;
    closingRevision.current = null;
    setState(previous => ({
      index: 0, visible: true,
      interactionReady: previous.visible && previous.interactionReady,
      revision: nextRevision,
    }));
  }, []);
  const closeSheet = useCallback(() => {
    const nextRevision = ++revision.current;
    const ready = contentReady.current;
    closingRevision.current = ready ? nextRevision : null;
    setState(previous => ({ ...previous, index: -1,
      visible: previous.visible && ready,
      revision: nextRevision }));
  }, []);

  useLayoutEffect(() => {
    if (!contentReady.current) return;
    // Install callbacks for this request before starting the native animation.
    if (state.index === 0) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [state.index, state.revision]);

  useEffect(() => {
    if (Platform.OS !== "android" || !state.visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSheet();
      return true;
    });
    return () => subscription.remove();
  }, [closeSheet, state.visible]);

  React.useImperativeHandle(ref, () => ({
    expand: expandSheet, collapse: closeSheet, close: closeSheet,
  }), [closeSheet, expandSheet]);

  const handleContentReady = useCallback(() => {
    if (state.revision !== revision.current) return;
    // Wait for native list measurements, not just the outer content container.
    if (state.index !== 0 || contentReady.current) return;
    contentReady.current = true;
    sheetRef.current?.snapToIndex(0);
  }, [state.index, state.revision]);

  const handleAnimate = useCallback((_from: number, to: number) => {
    if (state.revision !== revision.current) return;
    closingRevision.current = to === -1 ? state.revision : null;
  }, [state.revision]);
  const handleChange = useCallback((index: number) => {
    if (state.revision !== revision.current) return;
    if (index === 0) {
      setState(previous => previous.index === 0 && !previous.interactionReady
        ? { ...previous, interactionReady: true } : previous);
    }
    onSheetChange?.(index);
  }, [onSheetChange, state.revision]);
  const handleClose = useCallback(() => {
    if (closingRevision.current !== revision.current || state.revision !== revision.current) return;
    closingRevision.current = null;
    contentReady.current = false;
    setState(previous => ({ ...previous, index: -1, visible: false,
      interactionReady: false }));
  }, [state.revision]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0}
      opacity={0.52} pressBehavior="close" />
  ), []);
  const renderHandle = useCallback(() => (
    <View style={s.handleContainer}><View style={s.handle} /></View>
  ), []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={QUEUE_SNAP_POINTS}
      animateOnMount={false}
      enablePanDownToClose
      enableContentPanningGesture={false}
      enableDynamicSizing={false}
      handleComponent={renderHandle}
      backdropComponent={renderBackdrop}
      backgroundStyle={s.sheetBg}
      style={s.sheetLayer}
      animationConfigs={QUEUE_SPRING}
      onAnimate={handleAnimate}
      onChange={handleChange}
      onClose={handleClose}
    >
      {state.visible && <QueueContent interactionReady={state.interactionReady}
        onClose={closeSheet} onReady={handleContentReady} />}
    </BottomSheet>
  );
};

QueueBottomSheet.displayName = "QueueBottomSheet";
export default QueueBottomSheet;

