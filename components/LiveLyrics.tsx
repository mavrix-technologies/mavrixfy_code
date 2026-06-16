import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated as RNAnimated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";
import {
  fetchLyrics,
  getCurrentLyricsLine,
  LyricsData,
  LyricsLine,
} from "@/lib/lyricsService";
import { logger } from "@/lib/logger";

type LiveLyricsProps = {
  songId: string;
  videoId?: string | null;
  positionMs: number;
  isPlaying: boolean;
  onClose: () => void;
  primaryColor?: string;
  source?: "jiosaavn" | "youtube" | "local";
};

const LINE_HEIGHT = 56;
const ACTIVE_LINE_SCALE = 1.12;

export default function LiveLyrics({
  songId,
  videoId,
  positionMs,
  isPlaying,
  onClose,
  primaryColor = Colors.primary,
  source,
}: LiveLyricsProps) {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const lineAnimations = useRef<Map<number, RNAnimated.Value>>(new Map());
  const lastScrolledIndex = useRef(-1);

  // Fetch lyrics when component mounts or songId changes
  useEffect(() => {
    let cancelled = false;

    async function loadLyrics() {
      setIsLoading(true);
      setError(null);
      setLyrics(null);

      try {
        // Only fetch if we have a videoId (YouTube Music songs)
        if (!videoId) {
          setError("Lyrics not available for this song");
          setIsLoading(false);
          return;
        }

        logger.debug("[LiveLyrics] Fetching lyrics", { songId, videoId });
        const lyricsData = await fetchLyrics(videoId);

        if (cancelled) return;

        if (!lyricsData || lyricsData.lines.length === 0) {
          setError("No lyrics available");
          setIsLoading(false);
          return;
        }

        setLyrics(lyricsData);
        setIsLoading(false);
        
        logger.info("[LiveLyrics] Lyrics loaded successfully", {
          songId,
          linesCount: lyricsData.lines.length,
          isTimeSynced: lyricsData.isTimeSynced,
        });
      } catch (err) {
        if (!cancelled) {
          logger.error("[LiveLyrics] Error loading lyrics", { error: err, songId });
          setError("Failed to load lyrics");
          setIsLoading(false);
        }
      }
    }

    void loadLyrics();

    return () => {
      cancelled = true;
    };
  }, [songId, videoId]);

  // Get current line based on position
  const currentLineIndex = useMemo(() => {
    if (!lyrics) return -1;
    return getCurrentLyricsLine(lyrics.lines, positionMs);
  }, [lyrics, positionMs]);

  // Initialize animations for all lines
  useEffect(() => {
    if (!lyrics) return;

    lyrics.lines.forEach((_, index) => {
      if (!lineAnimations.current.has(index)) {
        lineAnimations.current.set(index, new RNAnimated.Value(0));
      }
    });
  }, [lyrics]);

  // Animate current line
  useEffect(() => {
    if (!lyrics || currentLineIndex === -1) return;

    // Animate current line
    const currentAnim = lineAnimations.current.get(currentLineIndex);
    if (currentAnim) {
      RNAnimated.spring(currentAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }

    // Reset other lines
    lineAnimations.current.forEach((anim, index) => {
      if (index !== currentLineIndex) {
        RNAnimated.timing(anim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [currentLineIndex, lyrics]);

  // Auto-scroll to current line
  useEffect(() => {
    if (
      !lyrics ||
      !scrollViewRef.current ||
      currentLineIndex === -1 ||
      currentLineIndex === lastScrolledIndex.current
    ) {
      return;
    }

    const scrollToPosition = currentLineIndex * LINE_HEIGHT - 100; // Center the line

    scrollViewRef.current.scrollTo({
      y: Math.max(0, scrollToPosition),
      animated: true,
    });

    lastScrolledIndex.current = currentLineIndex;
  }, [currentLineIndex, lyrics]);

  const renderLine = useCallback((line: LyricsLine, index: number) => {
    const isCurrent = index === currentLineIndex;
    const isPast = index < currentLineIndex;
    const anim = lineAnimations.current.get(index) || new RNAnimated.Value(0);

    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, ACTIVE_LINE_SCALE],
    });

    const opacity = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [isPast ? 0.4 : 0.6, 1],
    });

    return (
      <RNAnimated.View
        key={index}
        style={[
          styles.lyricsLine,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      >
        <Text
          style={[
            styles.lyricsText,
            isCurrent && styles.lyricsTextActive,
            isCurrent && { color: primaryColor },
            isPast && styles.lyricsTextPast,
          ]}
          numberOfLines={3}
        >
          {line.text}
        </Text>
      </RNAnimated.View>
    );
  }, [currentLineIndex, primaryColor]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFillObject} />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Loading Lyrics...</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#F7FAFF" />
          </Pressable>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      </View>
    );
  }

  if (error || !lyrics) {
    return (
      <View style={styles.container}>
        <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFillObject} />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Lyrics</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#F7FAFF" />
          </Pressable>
        </View>

        <View style={styles.errorContainer}>
          <Ionicons name="musical-notes-outline" size={64} color="rgba(247,250,255,0.3)" />
          <Text style={styles.errorText}>{error || "No lyrics available"}</Text>
          <Text style={styles.errorSubtext}>
            {source === "youtube" 
              ? "Try another song from YouTube Music"
              : "Lyrics are only available for YouTube Music songs"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFillObject} />
      
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Lyrics</Text>
          {lyrics.isTimeSynced && (
            <View style={styles.syncBadge}>
              <Ionicons name="sync" size={12} color={primaryColor} />
              <Text style={[styles.syncBadgeText, { color: primaryColor }]}>
                Synced
              </Text>
            </View>
          )}
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color="#F7FAFF" />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        {/* Top spacing */}
        <View style={{ height: 100 }} />

        {lyrics.lines.map((line, index) => renderLine(line, index))}

        {/* Bottom spacing */}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Source attribution */}
      {lyrics.source && (
        <View style={styles.footer}>
          <Text style={styles.sourceText}>
            Source: {lyrics.source}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(7,10,16,0.95)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,250,255,0.08)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F7FAFF",
    letterSpacing: 0.3,
  },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(247,250,255,0.1)",
  },
  syncBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(247,250,255,0.9)",
    marginTop: 20,
    textAlign: "center",
  },
  errorSubtext: {
    fontSize: 14,
    color: "rgba(247,250,255,0.5)",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  lyricsLine: {
    height: LINE_HEIGHT,
    justifyContent: "center",
    marginBottom: 8,
  },
  lyricsText: {
    fontSize: 24,
    fontWeight: "600",
    color: "rgba(247,250,255,0.6)",
    lineHeight: 32,
    letterSpacing: 0.2,
  },
  lyricsTextActive: {
    fontWeight: "700",
    color: "#F7FAFF",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lyricsTextPast: {
    color: "rgba(247,250,255,0.4)",
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(247,250,255,0.06)",
  },
  sourceText: {
    fontSize: 12,
    color: "rgba(247,250,255,0.4)",
    textAlign: "center",
    fontWeight: "500",
  },
});
