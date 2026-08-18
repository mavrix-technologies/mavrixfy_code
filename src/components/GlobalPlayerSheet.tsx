import React, {
  useEffect,
  useState,
  memo,
} from "react";
import {
  StyleSheet,
  Platform,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { usePlaybackNowPlaying } from "@/lib/playbackEngine";
import { playerUIStateStore, type PlayerUIState } from "@/lib/playerUIState";
import PlayerScreen from "@/features/player/screens/PlayerScreen";

const SPRING_CONFIG = { damping: 26, mass: 0.9, stiffness: 200 };

export const GlobalPlayerSheet = memo(function GlobalPlayerSheet() {
  const { height: screenHeight } = useWindowDimensions();
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;

  // ── UI State ────────────────────────────────────────────────────────────────
  const [uiState, setUiState] = useState<PlayerUIState>(() => playerUIStateStore.current);

  useEffect(() => playerUIStateStore.subscribe(setUiState), []);

  // Auto-show mini when a song starts
  useEffect(() => {
    if (activeSong && playerUIStateStore.current === "hidden") {
      playerUIStateStore.showMini();
    } else if (!activeSong && playerUIStateStore.current !== "hidden") {
      playerUIStateStore.hidePlayer();
    }
  }, [activeSong]);

  const translateY = useSharedValue(screenHeight);

  useEffect(() => {
    if (uiState === "expanded") {
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else if (uiState === "mini" || uiState === "hidden") {
      translateY.value = withSpring(screenHeight, SPRING_CONFIG);
    }
  }, [uiState, screenHeight, translateY]);

  // ── Android Back Handler ────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (playerUIStateStore.current === "expanded") {
        playerUIStateStore.collapsePlayer();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, translateY.value) }],
  }));

  // If no song is loaded or player is hidden, render nothing
  if (!activeSong || uiState === "hidden") return null;

  const isExpanded = uiState === "expanded";

  return (
    <Reanimated.View
      pointerEvents={isExpanded ? "auto" : "none"}
      style={[
        styles.sheetContainer,
        StyleSheet.absoluteFillObject,
        containerStyle,
      ]}
    >
      <PlayerScreen />
    </Reanimated.View>
  );
});

GlobalPlayerSheet.displayName = "GlobalPlayerSheet";

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    zIndex: 50,
    overflow: "hidden",
  },
});


