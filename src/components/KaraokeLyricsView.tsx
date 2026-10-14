import { type Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import { getSongLyrics, type LyricsResult } from "@/services/lyricsService";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  PREVIEW_LINE_HEIGHT,
  SpotifyCardPreviewLine,
} from "./KaraokeLyricsSubComponents";
import { getSpotifyLyricsBg } from "./karaokeLyricsUtils";
import { styles } from "./styles/karaokeLyricsStyles";

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
  const [offsetAnim] = useState(() => new Animated.Value(0));

  const songSeed = song?.title || song?.id;
  const targetBgColor = useMemo(
    () => getSpotifyLyricsBg(accentColor, songSeed),
    [accentColor, songSeed]
  );

  // Dual-layer smooth background color crossfade on song change
  const [colorA, setColorA] = useState(targetBgColor);
  const [colorB, setColorB] = useState(targetBgColor);
  const activeColorRef = useRef(targetBgColor);
  const [opacityA] = useState(() => new Animated.Value(1));
  const [opacityB] = useState(() => new Animated.Value(0));
  const activeLayerRef = useRef<0 | 1>(0);

  useEffect(() => {
    if (targetBgColor === activeColorRef.current) return;

    const nextLayer = activeLayerRef.current === 0 ? 1 : 0;
    const fadeOut = nextLayer === 0 ? opacityB : opacityA;
    const fadeIn = nextLayer === 0 ? opacityA : opacityB;

    if (nextLayer === 0) {
      setColorA(targetBgColor);
    } else {
      setColorB(targetBgColor);
    }

    activeLayerRef.current = nextLayer;
    activeColorRef.current = targetBgColor;

    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [targetBgColor, opacityA, opacityB]);

  // Smooth content crossfade on song change
  const [contentFadeAnim] = useState(() => new Animated.Value(1));
  const [contentSlideAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!song?.title) {
      setLyricsData(null);
      return;
    }

    let isCurrent = true;
    setLoading(true);

    // Gently fade out previous song lyrics during transition
    Animated.timing(contentFadeAnim, {
      toValue: 0.2,
      duration: 140,
      useNativeDriver: true,
    }).start();

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
          contentSlideAnim.setValue(6);
          Animated.parallel([
            Animated.timing(contentFadeAnim, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.timing(contentSlideAnim, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }),
          ]).start();
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLyricsData({ synced: false, lines: [], provider: "none" });
          setLoading(false);
          Animated.timing(contentFadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [song?.id, song?.title, song?.artist, song?.duration, contentFadeAnim, contentSlideAnim]);

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
    return foundIndex;
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
        pressed && styles.spotifyCardPressed,
      ]}
    >
      {/* Dual layer smooth background color crossfade */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colorA, opacity: opacityA },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colorB, opacity: opacityB },
        ]}
      />

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

      {/* Body with smooth content transition */}
      <Animated.View
        style={{
          opacity: contentFadeAnim,
          transform: [{ translateY: contentSlideAnim }],
        }}
      >
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
                      isPlaying={Boolean(isPlaying)}
                  />
                );
              })}
            </Animated.View>
          </View>
        )}
      </Animated.View>

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
