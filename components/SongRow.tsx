import React, { memo, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert, ToastAndroid, Animated as RNAnimated } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import Colors from "@/constants/colors";
import { Song, formatDuration } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { usePlayerRow } from "@/contexts/PlayerContext";
import EqualizerBars from "@/components/EqualizerBars";
import DownloadButton from "@/components/DownloadButton";
import { showGlobalToast } from "@/app/_layout";

interface Props {
  song: Song;
  index?: number;
  queue?: Song[];
  showCover?: boolean;
  /** Show the download button. Defaults to true. */
  showDownload?: boolean;
  onRemove?: () => void;
}

const SWIPE_ACTION_WIDTH = 184;
const SWIPE_COMMIT_DISTANCE = 82;
const SWIPE_SOFT_LIMIT = 214;

function QueueSwipeAction({
  dragX,
}: {
  dragX: RNAnimated.AnimatedInterpolation<number>;
}) {
  const actionOpacity = dragX.interpolate({
    inputRange: [0, 10, 42],
    outputRange: [0, 0.58, 1],
    extrapolate: "clamp",
  });

  const commitOpacity = dragX.interpolate({
    inputRange: [SWIPE_COMMIT_DISTANCE - 18, SWIPE_COMMIT_DISTANCE, SWIPE_SOFT_LIMIT],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  const contentTranslateX = dragX.interpolate({
    inputRange: [0, SWIPE_COMMIT_DISTANCE],
    outputRange: [-22, 0],
    extrapolate: "clamp",
  });

  const contentScale = dragX.interpolate({
    inputRange: [0, SWIPE_COMMIT_DISTANCE, SWIPE_SOFT_LIMIT],
    outputRange: [0.82, 1, 1.08],
    extrapolate: "clamp",
  });

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[styles.queueAction, { opacity: actionOpacity }]}
    >
      <View style={styles.queueActionBase} />
      <RNAnimated.View style={[styles.queueActionCommit, { opacity: commitOpacity }]} />
      <RNAnimated.View
        style={[
          styles.queueActionContent,
          { transform: [{ translateX: contentTranslateX }, { scale: contentScale }] },
        ]}
      >
        <View style={styles.queueActionGlyph}>
          <Ionicons name="list" size={38} color="#FFFFFF" />
          <View style={styles.queueActionPlusBadge}>
            <Ionicons name="add" size={15} color="#FFFFFF" />
          </View>
        </View>
      </RNAnimated.View>
    </RNAnimated.View>
  );
}

const SongRow = memo(function SongRow({
  song,
  index,
  queue,
  showCover = true,
  showDownload = true,
  onRemove,
}: Props) {
  const { playSong, currentSongId, isPlaying, toggleLike, isLiked, addToQueue, playNext } = usePlayerRow();
  const queueCommittedRef = useRef(false);
  const didSwipeRef = useRef(false);
  const swipeableRef = useRef<Swipeable | null>(null);

  // Close swipeable on unmount — prevents stuck-open state when navigating back
  useEffect(() => {
    return () => {
      swipeableRef.current?.close();
    };
  }, []);

  const showActionFeedback = useCallback((message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
  }, []);

  const resetSwipeStateSoon = useCallback(() => {
    setTimeout(() => {
      didSwipeRef.current = false;
      queueCommittedRef.current = false;
    }, 80);
  }, []);

  const handleSwipeAddToQueue = useCallback(() => {
    if (queueCommittedRef.current || onRemove) return;
    queueCommittedRef.current = true;
    didSwipeRef.current = true;
    void triggerImpact(ImpactFeedbackStyle.Medium);
    addToQueue(song);
    showGlobalToast("Added to queue");
    requestAnimationFrame(() => {
      swipeableRef.current?.close();
      resetSwipeStateSoon();
    });
  }, [addToQueue, onRemove, resetSwipeStateSoon, song]);

  const handleSwipeOpen = useCallback((direction: "left" | "right") => {
    if (direction === "left") {
      handleSwipeAddToQueue();
    }
  }, [handleSwipeAddToQueue]);

  const handleSwipeClose = useCallback(() => {
    queueCommittedRef.current = false;
    resetSwipeStateSoon();
  }, [resetSwipeStateSoon]);

  const renderLeftActions = useCallback((
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
  ) => (
    <QueueSwipeAction dragX={dragX} />
  ), []);

  if (!song || !song.id || !song.title) return null;

  const isActive = currentSongId === song.id;
  const liked = isLiked(song.id);

  const handlePlayNext = () => {
    playNext(song);
    showActionFeedback("Will play next");
  };

  const handleAddToQueue = () => {
    addToQueue(song);
    showGlobalToast("Added to queue");
  };

  const handlePress = () => {
    if (didSwipeRef.current) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    playSong(song, queue || [song]);
  };

  const handleLongPress = () => {
    void triggerImpact(ImpactFeedbackStyle.Medium);
    Alert.alert("Queue Options", "What would you like to do?", [
      { text: "Play Next", onPress: handlePlayNext },
      { text: "Add to Queue", onPress: handleAddToQueue },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleLike = () => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    toggleLike(song);
  };

  const handleRemove = () => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    onRemove?.();
  };

  return (
    <View style={styles.swipeWrap}>
      <Swipeable
        ref={swipeableRef}
        enabled={!onRemove}
        friction={1.6}
        leftThreshold={SWIPE_COMMIT_DISTANCE}
        dragOffsetFromLeftEdge={Platform.OS === "ios" ? 28 : 8}
        failOffsetY={[-10, 10]}
        overshootLeft
        overshootFriction={8}
        useNativeAnimations
        animationOptions={{ bounciness: 0, speed: 32 }}
        enableTrackpadTwoFingerGesture
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={handleSwipeOpen}
        onSwipeableClose={handleSwipeClose}
        containerStyle={styles.swipeableContainer}
        childrenContainerStyle={styles.rowLayer}
      >
        <Pressable
          style={({ pressed }) => [styles.container, pressed && styles.pressed]}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          {index !== undefined && (
            <View style={styles.indexWrap}>
              {isActive ? (
                <EqualizerBars isPlaying={isPlaying} size={3} />
              ) : (
                <Text style={styles.index}>{index + 1}</Text>
              )}
            </View>
          )}

            {showCover && song.coverUrl && (
              <Image
                recyclingKey={song.id}
                source={{ uri: song.coverUrl }}
                style={styles.cover}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="normal"
              />
            )}

            <View style={styles.info}>
              <Text style={[styles.title, isActive && styles.activeText]} numberOfLines={1}>
                {song.title || "Unknown Title"}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {song.artist || "Unknown Artist"}
              </Text>
            </View>

            {/* Like button */}
            <Pressable onPress={handleLike} hitSlop={10} style={styles.likeBtn}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={20}
                color={liked ? Colors.primary : Colors.subtext}
              />
            </Pressable>

            {/* Download button — hidden when a remove action is present */}
            {showDownload && !onRemove && (
              <DownloadButton song={song} size={20} style={styles.downloadBtn} />
            )}

            {/* Remove / duration */}
            {onRemove ? (
              <Pressable onPress={handleRemove} hitSlop={10} style={styles.removeBtn}>
                <Ionicons name="trash" size={18} color={Colors.subtext} />
              </Pressable>
            ) : (
              <Text style={styles.duration}>{formatDuration(song.duration)}</Text>
            )}
        </Pressable>
      </Swipeable>

    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.song.id === nextProps.song.id &&
    prevProps.index === nextProps.index &&
    prevProps.showCover === nextProps.showCover &&
    prevProps.showDownload === nextProps.showDownload &&
    Boolean(prevProps.onRemove) === Boolean(nextProps.onRemove) &&
    prevProps.queue?.length === nextProps.queue?.length
  );
});

export default SongRow;

const styles = StyleSheet.create({
  swipeWrap: {
    position: "relative",
    width: "100%",
    backgroundColor: Colors.background,
  },
  rowLayer: {
    width: "100%",
  },
  swipeableContainer: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  queueAction: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  queueActionBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#565656",
  },
  queueActionCommit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1DB954",
  },
  queueActionContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  queueActionGlyph: {
    width: 58,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  queueActionPlusBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.64)",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: "100%",
    backgroundColor: Colors.background,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  indexWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  index: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 8,
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
  likeBtn: {
    padding: 6,
  },
  downloadBtn: {
    padding: 6,
    marginLeft: 2,
  },
  removeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  duration: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginLeft: 4,
    width: 36,
    textAlign: "right",
  },
});
