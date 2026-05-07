import React, { memo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert, Animated, PanResponder, ToastAndroid } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import Colors from "@/constants/colors";
import { Song, formatDuration } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { usePlayerRow } from "@/contexts/PlayerContext";
import EqualizerBars from "@/components/EqualizerBars";
import DownloadButton from "@/components/DownloadButton";

interface Props {
  song: Song;
  index?: number;
  queue?: Song[];
  showCover?: boolean;
  /** Show the download button. Defaults to true. */
  showDownload?: boolean;
  onRemove?: () => void;
}

const SWIPE_ACTION_WIDTH = 92;
const SWIPE_TRIGGER = 56;

const SongRow = memo(function SongRow({
  song,
  index,
  queue,
  showCover = true,
  showDownload = true,
  onRemove,
}: Props) {
  const { playSong, currentSongId, isPlaying, toggleLike, isLiked, addToQueue, playNext } = usePlayerRow();
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeInFlightRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy);
        const hasMovedEnough = Math.abs(gesture.dx) > 10;
        return isHorizontal && hasMovedEnough;
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const nextX = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, gesture.dx));
        translateX.setValue(nextX);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -SWIPE_TRIGGER) {
          if (swipeInFlightRef.current) return;
          swipeInFlightRef.current = true;

          void triggerImpact(ImpactFeedbackStyle.Medium);
          addToQueue(song);
          if (Platform.OS === "android") {
            ToastAndroid.show("Added to queue", ToastAndroid.SHORT);
          } else if (Platform.OS === "ios") {
            Alert.alert("Mavrixfy", "Added to queue");
          }

          Animated.sequence([
            Animated.timing(translateX, { toValue: -SWIPE_ACTION_WIDTH, duration: 90, useNativeDriver: true }),
            Animated.timing(translateX, { toValue: 0, duration: 170, useNativeDriver: true }),
          ]).start(() => { swipeInFlightRef.current = false; });
          return;
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
          mass: 0.8,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
          mass: 0.8,
        }).start();
      },
    })
  ).current;

  const queueActionOpacity = translateX.interpolate({
    inputRange: [-SWIPE_ACTION_WIDTH, -8, 0],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp",
  });

  if (!song || !song.id || !song.title) return null;

  const isActive = currentSongId === song.id;
  const liked = isLiked(song.id);

  const showActionFeedback = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else if (Platform.OS === "ios") {
      Alert.alert("Mavrixfy", message);
    }
  };

  const handlePlayNext = () => {
    playNext(song);
    showActionFeedback("Will play next");
  };

  const handleAddToQueue = () => {
    addToQueue(song);
    showActionFeedback("Added to queue");
  };

  const handlePress = () => {
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
      <Animated.View style={[styles.queueAction, { opacity: queueActionOpacity }]}>
        <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
        <Text style={styles.queueActionText}>Queue</Text>
      </Animated.View>

      <Animated.View style={[styles.rowLayer, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
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
      </Animated.View>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.song.id === nextProps.song.id &&
    prevProps.index === nextProps.index &&
    prevProps.showCover === nextProps.showCover &&
    prevProps.showDownload === nextProps.showDownload &&
    prevProps.queue?.length === nextProps.queue?.length
  );
});

export default SongRow;

const styles = StyleSheet.create({
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    backgroundColor: Colors.background,
  },
  rowLayer: {
    width: "100%",
  },
  queueAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(37, 201, 231, 0.08)",
    borderLeftWidth: 1,
    borderLeftColor: Colors.cardBorder,
  },
  queueActionText: {
    color: Colors.primary,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
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
