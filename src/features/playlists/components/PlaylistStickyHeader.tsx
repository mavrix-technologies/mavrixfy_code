import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import * as Animated from "@/lib/nativeAnimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";

export interface PlaylistStickyHeaderPlayState {
  isStickyVisible: boolean;
  loading: boolean;
  hasSongs: boolean;
  isPlayingFromThisPlaylist: boolean;
  isPlaying: boolean;
}

interface PlaylistStickyHeaderProps {
  topInset: number;
  stickyOpacity: Animated.Value;
  playlistName: string;
  playState: PlaylistStickyHeaderPlayState;
  onPlayAll: () => void;
}

export const PlaylistStickyHeader: React.FC<PlaylistStickyHeaderProps> = ({
  topInset,
  stickyOpacity,
  playlistName,
  playState,
  onPlayAll,
}) => {
  const {
    isStickyVisible,
    loading,
    hasSongs,
    isPlayingFromThisPlaylist,
    isPlaying,
  } = playState;

  return (
    <Animated.View
      pointerEvents={isStickyVisible ? "auto" : "none"}
      style={[
        styles.sticky,
        {
          paddingTop: topInset,
          opacity: stickyOpacity,
        },
      ]}
    >
      <Pressable style={styles.stickyBack} onPress={safeGoBack} hitSlop={8}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </Pressable>
      <Text style={styles.stickyTitle} numberOfLines={1}>
        {playlistName}
      </Text>
      <Pressable
        style={styles.stickyPlay}
        onPress={onPlayAll}
        disabled={loading || !hasSongs}
      >
        <Ionicons
          name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
          size={16}
          color="#000"
        />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: "rgba(11, 15, 20, 0.94)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    zIndex: 20,
  },
  stickyBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  stickyPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
