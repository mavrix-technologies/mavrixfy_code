import React, { memo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { usePlayerRowActions } from "@/contexts/PlayerContext";
import { usePlaybackRowState } from "@/services/audio/PlaybackEngine";
import EqualizerBars from "@/components/EqualizerBars";
import DownloadButton from "@/components/DownloadButton";
import { logger } from "@/lib/logger";

interface Props {
  song: Song;
  index?: number;
  queue?: Song[];
  queueKey?: string;
  showCover?: boolean;
  /** Show the download button. Defaults to true. */
  showDownload?: boolean;
  optionContext?: "playlist";
  playlistId?: string;
  playlistSource?: "local" | "firestore";
  playlistName?: string;
  onRemove?: () => void;
  onSongPress?: (song: Song) => void;
  horizontalPadding?: number;
  showSearchSourceMeta?: boolean;
}

const SWIPE_ACTION_WIDTH = 92;
const SWIPE_COMMIT_DISTANCE = 68;
const ROW_ARTWORK_SIZE = 96;
const OPTION_OPEN_LOCK_MS = 650;
const SWIPE_RESET_DELAY_MS = 80;

function getSongRowCoverUrl(url: string | undefined): string {
  if (!url) return "";

  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    const rowSquare = `=w${ROW_ARTWORK_SIZE}-h${ROW_ARTWORK_SIZE}-l90-rj`;
    if (/=w\d+-h\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i.test(url)) {
      return url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i, rowSquare);
    }
    if (/=s\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i.test(url)) {
      return url.replace(/=s\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i, `=s${ROW_ARTWORK_SIZE}-c-k-c0x00ffffff-no-rj`);
    }
  }

  const youtubeMatch = url.match(/https?:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\/[^?#]+/i);
  if (youtubeMatch?.[1]) {
    return `https://i.ytimg.com/vi/${youtubeMatch[1]}/hqdefault.jpg`;
  }

  return url;
}

function QueueSwipeAction({
  dragX,
}: {
  dragX: SharedValue<number>;
}) {
  const animatedContainerStyle = useAnimatedStyle(() => {
    const distance = Math.abs(dragX.value);
    const opacity = interpolate(
      distance,
      [0, 20, SWIPE_COMMIT_DISTANCE],
      [0.2, 0.7, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const animatedIconStyle = useAnimatedStyle(() => {
    const distance = Math.abs(dragX.value);
    const scale = interpolate(
      distance,
      [0, SWIPE_COMMIT_DISTANCE * 0.5, SWIPE_COMMIT_DISTANCE],
      [0.65, 0.9, 1.06],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      distance,
      [0, 15, SWIPE_COMMIT_DISTANCE * 0.7],
      [0, 0.6, 1],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View style={[styles.queueActionWrapper, animatedContainerStyle]}>
      <Animated.View style={animatedIconStyle}>
        <Ionicons name="list" size={24} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

const SongRow = memo(function SongRow({
  song,
  index: _index,
  queue,
  queueKey: _queueKey,
  showCover = true,
  showDownload = true,
  optionContext,
  playlistId,
  playlistSource,
  playlistName,
  onRemove,
  onSongPress,
  horizontalPadding,
  showSearchSourceMeta = false,
}: Props) {
  const { playSong, addToQueue } = usePlayerRowActions();
  const { isActive, isPlaying } = usePlaybackRowState(song?.id);
  const queueCommittedRef = useRef(false);
  const didSwipeRef = useRef(false);
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionOpenLockRef = useRef(false);
  const optionOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimers = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (optionOpenTimerRef.current) {
      clearTimeout(optionOpenTimerRef.current);
      optionOpenTimerRef.current = null;
    }
  }, []);

  // Close swipeable on unmount — prevents stuck-open state when navigating back
  useEffect(() => {
    const swipeable = swipeableRef.current;
    return () => {
      clearPendingTimers();
      swipeable?.close();
    };
  }, [clearPendingTimers]);

  const resetSwipeStateSoon = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      didSwipeRef.current = false;
      queueCommittedRef.current = false;
      resetTimerRef.current = null;
    }, SWIPE_RESET_DELAY_MS);
  }, []);

  const handleSwipeAddToQueue = useCallback(() => {
    if (queueCommittedRef.current || onRemove) return;
    queueCommittedRef.current = true;
    didSwipeRef.current = true;
    void triggerImpact(ImpactFeedbackStyle.Medium);
    addToQueue(song);
    swipeableRef.current?.close();
    resetSwipeStateSoon();
  }, [addToQueue, onRemove, resetSwipeStateSoon, song]);

  const handleSwipeOpen = useCallback(() => {
    handleSwipeAddToQueue();
  }, [handleSwipeAddToQueue]);

  const handleSwipeClose = useCallback(() => {
    queueCommittedRef.current = false;
    resetSwipeStateSoon();
  }, [resetSwipeStateSoon]);

  const renderRightActions = useCallback(
    (
      _progress: SharedValue<number>,
      dragX: SharedValue<number>
    ) => <QueueSwipeAction dragX={dragX} />,
    []
  );

  const openSongOptions = useCallback(() => {
    if (optionOpenLockRef.current) return;

    optionOpenLockRef.current = true;
    didSwipeRef.current = false;
    queueCommittedRef.current = false;
    swipeableRef.current?.close();

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (optionOpenTimerRef.current) {
      clearTimeout(optionOpenTimerRef.current);
    }

    const canRemoveFromPlaylist = optionContext === "playlist" && Boolean(playlistId);

    try {
      router.push({
        pathname: "/song-options",
        params: {
          song: JSON.stringify({
            id: song.id,
            title: song.title,
            artist: song.artist,
            album: song.album || "",
            duration: song.duration || 0,
            coverUrl: song.coverUrl || "",
            audioUrl: song.audioUrl || "",
            downloadUrl: song.downloadUrl,
            source: song.source,
            genre: song.genre || "",
          }),
          showDownload: showDownload ? "1" : "0",
          canRemove: onRemove || canRemoveFromPlaylist ? "1" : "0",
          optionContext: optionContext ?? "",
          playlistId: playlistId ?? "",
          playlistSource: playlistSource ?? "",
          playlistName: playlistName ?? "",
        },
      });
    } catch (error) {
      logger.error("[SongRow] Failed to open song options:", error);
    }

    optionOpenTimerRef.current = setTimeout(() => {
      optionOpenLockRef.current = false;
      optionOpenTimerRef.current = null;
    }, OPTION_OPEN_LOCK_MS);
  }, [
    onRemove,
    optionContext,
    playlistId,
    playlistName,
    playlistSource,
    showDownload,
    song,
  ]);

  const handlePress = useCallback(() => {
    if (didSwipeRef.current) return;
    if (onSongPress) {
      onSongPress(song);
    } else {
      playSong(song, queue || [song]);
    }
  }, [onSongPress, playSong, queue, song]);

  const handleLongPress = useCallback(() => {
    void triggerImpact(ImpactFeedbackStyle.Medium);
    openSongOptions();
  }, [openSongOptions]);

  const handleRemove = useCallback(() => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    onRemove?.();
  }, [onRemove]);

  const handleMorePress = useCallback(() => {
    openSongOptions();
  }, [openSongOptions]);

  if (!song || !song.id || !song.title) return null;

  const showYouTubeSearchMeta = showSearchSourceMeta && song.source === "youtube";
  const rowCoverUrl = getSongRowCoverUrl(song.coverUrl);

  return (
    <View style={styles.swipeWrap}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        enabled={!onRemove}
        friction={1.6}
        rightThreshold={SWIPE_COMMIT_DISTANCE}
        dragOffsetFromLeftEdge={Platform.OS === "ios" ? 44 : 36}
        activeOffsetX={[-22, 500]}
        failOffsetY={[-14, 14]}
        overshootRight={false}
        overshootFriction={8}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={handleSwipeOpen}
        onSwipeableOpen={handleSwipeOpen}
        onSwipeableClose={handleSwipeClose}
        containerStyle={styles.swipeableContainer}
        childrenContainerStyle={styles.rowLayer}
      >
        <Pressable
          android_disableSound
          android_ripple={{
            color: "rgba(255, 255, 255, 0.08)",
            borderless: false,
            foreground: true,
          }}
          style={({ pressed }) => [
            styles.container,
            horizontalPadding !== undefined && { paddingHorizontal: horizontalPadding },
            pressed && styles.pressed,
          ]}
          onPress={handlePress}
          onLongPress={handleLongPress}
          accessibilityRole="button"
          accessibilityLabel={`${song.title} by ${song.artist}`}
        >
          {showCover && rowCoverUrl && (
            <Image
              recyclingKey={`${song.id}:${rowCoverUrl}`}
              source={{ uri: rowCoverUrl }}
              style={styles.cover}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="normal"
              placeholder={{ blurhash: "L5H2EC=PM+yV+^$gM_e-4Wo0WB%M" }}
              transition={0}
            />
          )}

          <View style={styles.info}>
            <View style={styles.titleRow}>
              {isActive && (
                <View style={styles.equalizerInline}>
                  <EqualizerBars isPlaying={isPlaying} size={3} gap={2} />
                </View>
              )}
              <Text
                style={[styles.title, isActive && styles.activeText]}
                numberOfLines={1}
              >
                {song.title || "Unknown Title"}
              </Text>
            </View>
            <Text style={styles.artist} numberOfLines={1}>
              {song.artist || "Unknown Artist"}
            </Text>
            {showYouTubeSearchMeta ? (
              <View style={styles.sourceMetaRow}>
                <View style={styles.sourcePill}>
                  <Ionicons name="videocam-outline" size={13} color="#D7D7D7" />
                </View>
              </View>
            ) : null}
          </View>

          {/* Remove / duration */}
          {onRemove ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                handleRemove();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${song.title} from playlist`}
              style={styles.removeBtn}
            >
              <Ionicons name="trash" size={18} color={Colors.subtext} />
            </Pressable>
          ) : null}

          {/* Download button */}
          {showDownload && !onRemove ? (
            <View
              onTouchStart={(e) => e.stopPropagation()}
              style={styles.downloadBtnWrapper}
            >
              <DownloadButton
                song={song}
                size={20}
                color={Colors.subtext}
              />
            </View>
          ) : null}

          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              handleMorePress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${song.title}`}
            style={styles.moreBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.subtext} />
          </Pressable>
        </Pressable>
      </ReanimatedSwipeable>
    </View>
  );
}, (prevProps, nextProps) => {
  // Optimized comparison - skip queue array comparison for better performance
  // Queue changes are detected via queueKey instead
  return (
    prevProps.song.id === nextProps.song.id &&
    prevProps.song.title === nextProps.song.title &&
    prevProps.song.artist === nextProps.song.artist &&
    prevProps.song.coverUrl === nextProps.song.coverUrl &&
    prevProps.index === nextProps.index &&
    prevProps.showCover === nextProps.showCover &&
    prevProps.showDownload === nextProps.showDownload &&
    prevProps.optionContext === nextProps.optionContext &&
    prevProps.playlistId === nextProps.playlistId &&
    prevProps.playlistSource === nextProps.playlistSource &&
    prevProps.playlistName === nextProps.playlistName &&
    prevProps.horizontalPadding === nextProps.horizontalPadding &&
    prevProps.showSearchSourceMeta === nextProps.showSearchSourceMeta &&
    prevProps.onSongPress === nextProps.onSongPress &&
    Boolean(prevProps.onRemove) === Boolean(nextProps.onRemove) &&
    prevProps.queueKey === nextProps.queueKey
  );
});

export default SongRow;

const styles = StyleSheet.create({
  swipeWrap: {
    position: "relative",
    width: "100%",
    backgroundColor: "transparent",
  },
  rowLayer: {
    width: "100%",
  },
  swipeableContainer: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  queueActionWrapper: {
    width: SWIPE_ACTION_WIDTH,
    height: "100%",
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 68,
    paddingVertical: 10,
    paddingHorizontal: 18,
    width: "100%",
    backgroundColor: "transparent",
  },
  pressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  equalizerInline: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 14,
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  activeText: {
    color: Colors.primary,
  },
  artist: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sourceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  sourcePill: {
    width: 22,
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  removeBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  downloadBtnWrapper: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  moreBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
});

