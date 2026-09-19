import React, { memo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolateColor,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { type Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { usePlayerRowActions } from "@/contexts/PlayerContext";
import { usePlaybackRowState } from "@/services/audio/PlaybackEngine";
import EqualizerBars from "@/components/EqualizerBars";
import DownloadButton from "@/components/DownloadButton";
import { logger } from "@/lib/logger";

const AnimatedText = Animated.createAnimatedComponent(Text);

interface Props {
  song: Song;
  index?: number;
  queue?: Song[];
  queueKey?: string;
  showCover?: boolean;
  showDownload?: boolean;
  showDivider?: boolean;
  optionContext?: "playlist";
  playlistId?: string;
  playlistSource?: "local" | "firestore";
  playlistName?: string;
  onRemove?: () => void;
  onSongPress?: (song: Song) => void;
  horizontalPadding?: number;
  showSearchSourceMeta?: boolean;
}

const ROW_ARTWORK_SIZE = 96;

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

const SongRow = memo(function SongRow({
  song,
  index: _index,
  queue,
  queueKey: _queueKey,
  showCover = true,
  showDownload = true,
  showDivider = true,
  optionContext,
  playlistId,
  playlistSource,
  playlistName,
  onRemove,
  onSongPress,
  horizontalPadding,
  showSearchSourceMeta = false,
}: Props) {
  const { playSong } = usePlayerRowActions();
  const { isActive, isPlaying } = usePlaybackRowState(song?.id);

  // Smooth cross-fade when active song changes — runs 100% on UI thread
  const activeAnim = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    activeAnim.value = withTiming(isActive ? 1 : 0, {
      duration: 150,
      easing: Easing.inOut(Easing.quad),
    });
  }, [isActive, activeAnim]);

  const titleAnimStyle = useAnimatedStyle(() => ({
    color: interpolateColor(activeAnim.value, [0, 1], ["#FFFFFF", Colors.primary]),
  }));

  const openSongOptions = useCallback(() => {
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
    // Immediate native-feeling haptic feedback.
    void triggerImpact(ImpactFeedbackStyle.Light);

    // One simple playback action.
    // PlaybackEngine remains the single source of truth.
    if (onSongPress) {
      onSongPress(song);
      return;
    }

    void playSong(song, queue ?? [song]);
  }, [onSongPress, playSong, queue, song]);

  const handleRemove = useCallback(() => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    onRemove?.();
  }, [onRemove]);

  if (!song || !song.id || !song.title) return null;

  const showYouTubeSearchMeta = showSearchSourceMeta && song.source === "youtube";
  const rowCoverUrl = getSongRowCoverUrl(song.coverUrl);

  return (
    <Pressable
      android_disableSound
      style={({ pressed }) => [
        styles.container,
        horizontalPadding !== undefined && { paddingHorizontal: horizontalPadding },
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      onLongPress={openSongOptions}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}`}
    >
      {showCover && rowCoverUrl && (
        <View style={styles.coverWrapper}>
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
        </View>
      )}

      <View style={styles.info}>
        <View style={styles.titleRow}>
          {isActive && (
            <EqualizerBars
              color={Colors.primary}
              size={2.5}
              gap={2}
              isPlaying={isPlaying}
            />
          )}
          <AnimatedText
            style={[styles.title, titleAnimStyle]}
            numberOfLines={1}
          >
            {song.title || "Unknown Title"}
          </AnimatedText>
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

      {/* Remove button */}
      {onRemove ? (
        <Pressable
          hitSlop={8}
          android_ripple={{
            color: "rgba(255, 255, 255, 0.12)",
            borderless: true,
            radius: 22,
          }}
          onPress={(event) => {
            event.stopPropagation();
            handleRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${song.title} from playlist`}
          style={({ pressed }) => [
            styles.removeBtn,
            Platform.OS !== "android" && pressed && styles.pressedIconBtn,
          ]}
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

      {/* More options button */}
      <Pressable
        hitSlop={8}
        android_ripple={{
          color: "rgba(255, 255, 255, 0.12)",
          borderless: true,
          radius: 22,
        }}
        onPress={(event) => {
          event.stopPropagation();
          openSongOptions();
        }}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${song.title}`}
        style={({ pressed }) => [
          styles.moreBtn,
          Platform.OS !== "android" && pressed && styles.pressedIconBtn,
        ]}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.subtext} />
      </Pressable>

      {/* Subtle separator divider line */}
      {showDivider && !isActive ? (
        <View
          style={[
            styles.dividerLine,
            {
              left: showCover && rowCoverUrl ? 68 : 12,
              right: 12,
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.song.id === nextProps.song.id &&
    prevProps.song.title === nextProps.song.title &&
    prevProps.song.artist === nextProps.song.artist &&
    prevProps.song.coverUrl === nextProps.song.coverUrl &&
    prevProps.index === nextProps.index &&
    prevProps.showCover === nextProps.showCover &&
    prevProps.showDownload === nextProps.showDownload &&
    prevProps.showDivider === nextProps.showDivider &&
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
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 64,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: "100%",
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.72,
  },
  pressedIconBtn: {
    opacity: 0.6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  coverWrapper: {
    position: "relative",
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    marginRight: 14,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
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
  dividerLine: {
    position: "absolute",
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
});
