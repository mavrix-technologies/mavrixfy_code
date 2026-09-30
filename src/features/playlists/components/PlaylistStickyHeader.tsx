import Colors from "@/constants/colors";
import * as Animated from "@/lib/nativeAnimated";
import { safeGoBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
  const { loading, hasSongs, isPlayingFromThisPlaylist, isPlaying } = playState;

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
        {/* Back Button — consistent circular style */}
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backBtnPressed]}
          onPress={safeGoBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>

        {/* Header Title */}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {playlistName}
        </Text>

        {/* Right: Sticky Play Button */}
        <View style={styles.rightSlot}>
          <Pressable
            style={({ pressed }) => [styles.stickyPlay, pressed && styles.stickyPlayPressed]}
            onPress={onPlayAll}
            disabled={loading || !hasSongs}
            accessibilityRole="button"
            accessibilityLabel={
              isPlayingFromThisPlaylist && isPlaying ? "Pause playlist" : "Play playlist"
            }
          >
            <Ionicons
              name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
              size={16}
              color="#000000"
              style={!isPlayingFromThisPlaylist || !isPlaying ? { marginLeft: 2 } : undefined}
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
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
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
