import React, { useEffect, useMemo, useState, memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { styles } from "./styles/karaokeLyricsStyles";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Animated from "@/lib/nativeAnimated";
import { getSongLyrics, type LyricsResult } from "@/services/lyricsService";
import { type Song } from "@/lib/musicData";
import { useArtworkPalette } from "@/lib/colorExtractor";
import { getSpotifyLyricsBg } from "./karaokeLyricsUtils";
import {
  PREVIEW_LINE_HEIGHT,
  SpotifyCardPreviewLine,
} from "./KaraokeLyricsSubComponents";

export { FullscreenKaraokeModal } from "./FullscreenKaraokeModal";
export { getSpotifyLyricsBg } from "./karaokeLyricsUtils";

interface KaraokeLyricsViewProps {
  song: Song | null;
  currentPositionSeconds: number;
  durationSeconds?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeek: (seconds: number) => void;
  accentColor?: string;
  onToggleFullScreen?: () => void;
}

/**
 * 1. Inline Spotify Preview Card on Player Screen
 */
export const KaraokeLyricsView = memo(function KaraokeLyricsView({
  song,
  currentPositionSeconds,
  isPlaying,
  accentColor,
  onToggleFullScreen,
}: KaraokeLyricsViewProps) {
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const artworkPalette = useArtworkPalette(song?.coverUrl);
  const [offsetAnim] = useState(() => new Animated.Value(0));

  const songSeed = useMemo(() => `${song?.id || ""}_${song?.title || ""}_${song?.artist || ""}`, [song?.id, song?.title, song?.artist]);

  const effectiveAccent = accentColor || (artworkPalette.accent !== "#0E1016" ? artworkPalette.accent : undefined) || (artworkPalette.primary !== "#0E1016" ? artworkPalette.primary : undefined);

  const cardBgColor = useMemo(
    () => getSpotifyLyricsBg(effectiveAccent, songSeed),
    [effectiveAccent, songSeed]
  );

  useEffect(() => {
    if (!song?.title) {
      setLyricsData(null);
      return;
    }

    let isCurrent = true;
    setLoading(true);

    getSongLyrics({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
    })
      .then((res) => {
        if (isCurrent) {
          setLyricsData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLyricsData({ synced: false, lines: [], provider: "none" });
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [song?.id, song?.title, song?.artist, song?.duration]);

  const livePosition = currentPositionSeconds;

  // Active line index calculation
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.synced || lyricsData.lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.lines;
    let foundIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= livePosition + 0.05) {
        foundIndex = i;
      } else {
        break;
      }
    }
    return foundIndex >= 0 ? foundIndex : 0;
  }, [lyricsData, livePosition]);

  // Smooth continuous gliding translation to active line
  useEffect(() => {
    const targetOffset = activeIndex > 0 ? -Math.max(0, activeIndex - 1) * PREVIEW_LINE_HEIGHT : 0;
    Animated.spring(offsetAnim, {
      toValue: targetOffset,
      damping: 22,
      stiffness: 130,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, offsetAnim]);

  if (!song) return null;

  const hasLyrics = Boolean(lyricsData && lyricsData.lines.length > 0);

  return (
    <Pressable
      android_disableSound
      onPress={onToggleFullScreen}
      style={({ pressed }) => [
        styles.spotifyCardContainer,
        { backgroundColor: cardBgColor },
        pressed && styles.spotifyCardPressed,
      ]}
    >
      {/* Header with Title on Left & Lyrics Icon on Top Right */}
      <View style={styles.spotifyCardHeader}>
        <Text style={styles.spotifyCardHeaderTitle}>Lyrics</Text>
        <Pressable
          android_disableSound
          onPress={onToggleFullScreen}
          hitSlop={10}
          style={styles.spotifyCardHeaderIconBtn}
        >
          <MaterialIcons name="lyrics" size={22} color="rgba(255, 255, 255, 0.9)" />
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.spotifyCardLoading}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.spotifyCardSubtext}>Loading lyrics...</Text>
        </View>
      ) : !hasLyrics || !lyricsData ? (
        <View style={styles.spotifyCardLoading}>
          <Ionicons name="musical-notes-outline" size={22} color="rgba(255,255,255,0.4)" />
          <Text style={styles.spotifyCardSubtext}>No lyrics available for this song</Text>
        </View>
      ) : (
        <View style={styles.spotifyCardViewport} pointerEvents="none">
          <Animated.View style={{ transform: [{ translateY: offsetAnim }] }}>
            {lyricsData.lines.map((line, index) => {
              const isActive = index === activeIndex;
              const isPassed = index < activeIndex;
              return (
                <SpotifyCardPreviewLine
                  key={line.id || `card_line_${line.time}_${line.text}`}
                  item={line}
                  isActive={isActive}
                  isPassed={isPassed}
                  isSynced={Boolean(lyricsData.synced)}
                />
              );
            })}
          </Animated.View>
        </View>
      )}

      {/* Bottom Button Pill */}
      <View style={styles.spotifyCardFooter}>
        <Pressable
          android_disableSound
          onPress={onToggleFullScreen}
          style={({ pressed }) => [
            styles.spotifyShowLyricsPill,
            pressed && styles.spotifyShowLyricsPillPressed,
          ]}
        >
          <Text style={styles.spotifyShowLyricsText}>Show lyrics</Text>
        </Pressable>
      </View>
    </Pressable>
  );
});
