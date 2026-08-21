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
        <Ionicons name="arrow-back" size={20} color={Colors.text} />
      </Pressable>
      <Text style={styles.stickyName} numberOfLines={1}>
        {playlistName}
      </Text>
      <Pressable
        style={styles.stickyPlay}
        onPress={onPlayAll}
        disabled={loading || !hasSongs}
      >
        <Ionicons
          name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
          size={14}
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
    backgroundColor: "rgba(16,20,26,0.97)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 10,
    zIndex: 20,
  },
  stickyBack: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyName: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  stickyPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
