import DownloadButton from "@/components/DownloadButton";
import EqualizerBars from "@/components/EqualizerBars";
import Colors from "@/constants/colors";
import { usePlayerRowActions } from "@/contexts/PlayerContext";
import { triggerImpact } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import { type Song } from "@/lib/musicData";
import { usePlaybackRowState } from "@/services/audio/PlaybackEngine";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { MusicArtwork } from "@/components/MusicArtwork";
import { router } from "expo-router";
import { memo,useCallback,useEffect,useRef } from "react";
import {
Platform,
Pressable,
StyleSheet,
Text,
View,
} from "react-native";
import Animated,{
Easing,
interpolateColor,
useAnimatedStyle,
useSharedValue,
withTiming,
} from "react-native-reanimated";

const AnimatedText = Animated.createAnimatedComponent(Text);
export const SONG_ROW_HEIGHT = 64;

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
  const previousActive = useRef(isActive);
  useEffect(() => {
    // New virtualized rows already have the right color. Starting a 0 → 0
    // animation for each mounting row adds work to the scroll frame budget.
    if (previousActive.current === isActive) return;
    previousActive.current = isActive;
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

  const rowCoverUrl = song.coverUrl;

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
          <MusicArtwork
            recyclingKey={`${song.id}:${rowCoverUrl}`}
            uri={rowCoverUrl}
            size={48}
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
        <View style={styles.artistRow}>
          <Text style={styles.artist} numberOfLines={1}>
            {song.artist || "Unknown Artist"}
          </Text>
        </View>
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
    prevProps.queueKey === nextProps.queueKey &&
    (prevProps.queueKey !== undefined || prevProps.queue === nextProps.queue)
  );
});

export default SongRow;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: SONG_ROW_HEIGHT,
    height: SONG_ROW_HEIGHT,
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
    flex: 1,
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
    flex: 1,
    minWidth: 0,
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    minWidth: 0,
  },
  artist: {
    flex: 1,
    minWidth: 0,
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
