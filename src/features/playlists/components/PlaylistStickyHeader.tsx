import React from "react";
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
}

interface PlaylistStickyHeaderProps {
  topInset: number;
  stickyOpacity: Animated.Value;
  playlistName: string;
  isStickyVisible?: boolean;
  playState: PlaylistStickyHeaderPlayState;
  backgroundColor?: string;
  onPlayAll: () => void;
}

export const PlaylistStickyHeader: React.FC<PlaylistStickyHeaderProps> = ({
  topInset,
  stickyOpacity,
  playlistName,
  isStickyVisible = false,
  playState,
  backgroundColor,
  onPlayAll,
}) => {
  const {
    loading,
    hasSongs,
    isPlayingFromThisPlaylist,
    isPlaying,
  } = playState;

  return (
    <Animated.View
      pointerEvents={isStickyVisible ? "auto" : "none"}
      style={[
        styles.stickyHeader,
        {
          paddingTop: topInset,
          opacity: stickyOpacity,
          backgroundColor: backgroundColor || Colors.background,
        },
      ]}
    >
      <View style={styles.headerBar}>
        {/* Native Back Button */}
        <Pressable
          style={styles.backButton}
          onPress={safeGoBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>

        {/* Header Title */}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {playlistName}
        </Text>

        {/* Right side slot: Sticky Play Button */}
        <View style={styles.rightSlot}>
          <Pressable
            style={({ pressed }) => [
              styles.stickyPlay,
              pressed && styles.stickyPlayPressed,
            ]}
            onPress={onPlayAll}
            disabled={loading || !hasSongs}
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
    zIndex: 95,
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
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
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
  stickyPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 3px 8px rgba(0, 0, 0, 0.35)",
  },
  stickyPlayPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
});
