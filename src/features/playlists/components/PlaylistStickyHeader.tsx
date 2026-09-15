import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Animated from "@/lib/nativeAnimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";

export interface PlaylistStickyHeaderPlayState {
  loading: boolean;
  hasSongs: boolean;
  isPlayingFromThisPlaylist: boolean;
  isPlaying: boolean;
  isStickyVisible?: boolean;
}

interface PlaylistStickyHeaderProps {
  topInset: number;
  scrollY?: Animated.Value;
  stickyOpacity?: Animated.Value;
  playlistName: string;
  isPlayVisible?: boolean;
  playState: PlaylistStickyHeaderPlayState;
  onPlayAll: () => void;
}

export const PlaylistStickyHeader: React.FC<PlaylistStickyHeaderProps> = ({
  topInset,
  scrollY,
  stickyOpacity,
  playlistName,
  isPlayVisible = false,
  playState,
  onPlayAll,
}) => {
  const {
    loading,
    hasSongs,
    isPlayingFromThisPlaylist,
    isPlaying,
  } = playState;

  const fallbackScrollY = useRef(new Animated.Value(0)).current;
  const effectiveScrollY = scrollY ?? fallbackScrollY;

  // Header background opacity fades in as hero scrolls up
  const headerBgOpacity = useMemo(() => {
    if (stickyOpacity && !scrollY) return stickyOpacity;
    return effectiveScrollY.interpolate({
      inputRange: [0, 60, 150],
      outputRange: [0, 0.45, 1],
      extrapolate: "clamp",
    });
  }, [effectiveScrollY, stickyOpacity, scrollY]);

  // Title fades in after scrolling past main hero title
  const titleOpacity = useMemo(() => {
    if (stickyOpacity && !scrollY) return stickyOpacity;
    return effectiveScrollY.interpolate({
      inputRange: [130, 200],
      outputRange: [0, 1],
      extrapolate: "clamp",
    });
  }, [effectiveScrollY, stickyOpacity, scrollY]);

  const titleTranslateY = useMemo(() => {
    if (!scrollY) return 0 as unknown as Animated.AnimatedInterpolation<number>;
    return effectiveScrollY.interpolate({
      inputRange: [130, 200],
      outputRange: [8, 0],
      extrapolate: "clamp",
    });
  }, [effectiveScrollY, scrollY]);

  // Sticky play button emerges once hero buttons scroll away
  const playBtnOpacity = useMemo(() => {
    if (stickyOpacity && !scrollY) return stickyOpacity;
    return effectiveScrollY.interpolate({
      inputRange: [220, 265],
      outputRange: [0, 1],
      extrapolate: "clamp",
    });
  }, [effectiveScrollY, stickyOpacity, scrollY]);

  const playBtnScale = useMemo(() => {
    if (!scrollY) return 1 as unknown as Animated.AnimatedInterpolation<number>;
    return effectiveScrollY.interpolate({
      inputRange: [220, 265],
      outputRange: [0.72, 1],
      extrapolate: "clamp",
    });
  }, [effectiveScrollY, scrollY]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.stickyHeader,
        {
          paddingTop: topInset,
          height: topInset + 48,
        },
      ]}
    >
      {/* Background layer with subtle border */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          styles.stickyBg,
          { opacity: headerBgOpacity },
        ]}
      />

      {/* Navigation bar content */}
      <View style={styles.headerBar}>
        {/* Persistent frosted back button */}
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          onPress={safeGoBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={styles.backButtonCircle}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </View>
        </Pressable>

        {/* Animated playlist title */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.titleContainer,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {playlistName}
          </Text>
        </Animated.View>

        {/* Right side slot: Sticky Play / Pause button */}
        <View style={styles.rightSlot}>
          <Animated.View
            pointerEvents={isPlayVisible ? "auto" : "none"}
            style={[
              styles.playButtonWrap,
              {
                opacity: playBtnOpacity,
                transform: [{ scale: playBtnScale }],
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.stickyPlay,
                pressed && styles.stickyPlayPressed,
              ]}
              onPress={onPlayAll}
              disabled={loading || !hasSongs}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                isPlayingFromThisPlaylist && isPlaying
                  ? "Pause playlist"
                  : "Play playlist"
              }
            >
              <Ionicons
                name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
                size={16}
                color="#000000"
                style={
                  !isPlayingFromThisPlaylist || !isPlaying
                    ? { marginLeft: 2 }
                    : undefined
                }
              />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  stickyBg: {
    backgroundColor: "rgba(16, 20, 26, 0.98)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.12)",
  },
  headerBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  backButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  rightSlot: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  stickyPlayPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
});
