import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { usePlayer } from "@/contexts/PlayerContext";
import {
  addIOSNativeFullPlayerCloseListener,
  addIOSNativeFullPlayerErrorListener,
  isIOSNativeFullPlayerAvailable,
  presentIOSNativeFullPlayer,
  type IOSNativeFullPlayerCloseEvent,
} from "@/lib/iosNativeFullPlayer";

export default function IOSNativeFullPlayerScreen() {
  const {
    currentSong,
    queue,
    isPlaying,
    positionMillis,
    playSong,
    seekTo,
    togglePlay,
  } = usePlayer();
  const [statusText, setStatusText] = useState("Opening native iOS player...");
  const launchedRef = useRef(false);
  const syncedRef = useRef(false);

  const activeQueue = useMemo(() => {
    if (queue.length > 0) {
      return queue;
    }

    return currentSong ? [currentSong] : [];
  }, [currentSong, queue]);

  useEffect(() => {
    if (!currentSong) {
      router.back();
      return;
    }

    if (!isIOSNativeFullPlayerAvailable()) {
      setStatusText("Native player unavailable. Falling back...");
      router.back();
      return;
    }

    const handleClose = (event: IOSNativeFullPlayerCloseEvent) => {
      if (syncedRef.current || !currentSong) {
        router.back();
        return;
      }

      syncedRef.current = true;

      const durationSeconds = Math.max(event.durationSeconds ?? currentSong.duration ?? 0, 0.001);
      const currentTimeSeconds = Math.max(event.currentTimeSeconds ?? 0, 0);
      const normalizedProgress = Math.max(0, Math.min(1, currentTimeSeconds / durationSeconds));
      const shouldResumePlaying = Boolean(event.wasPlaying);

      playSong(currentSong, activeQueue);

      setTimeout(() => {
        seekTo(normalizedProgress);

        if (!shouldResumePlaying) {
          setTimeout(() => {
            togglePlay();
          }, 180);
        }
      }, 280);

      router.back();
    };

    const handleError = (event: { message?: string }) => {
      setStatusText(event.message || "Could not open the native iOS player.");
      router.back();
    };

    const closeSub = addIOSNativeFullPlayerCloseListener(handleClose);
    const errorSub = addIOSNativeFullPlayerErrorListener(handleError);

    if (!launchedRef.current) {
      launchedRef.current = true;

      const launch = async () => {
        try {
          if (isPlaying) {
            togglePlay();
          }

          await presentIOSNativeFullPlayer({
            url: currentSong.audioUrl,
            startPositionSeconds: Math.max(positionMillis / 1000, 0),
            shouldPlay: isPlaying,
          });
        } catch (error) {
          setStatusText(error instanceof Error ? error.message : "Could not open native iOS player.");
          router.back();
        }
      };

      void launch();
    }

    return () => {
      closeSub.remove();
      errorSub.remove();
    };
  }, [
    activeQueue,
    currentSong,
    isPlaying,
    playSong,
    positionMillis,
    seekTo,
    togglePlay,
  ]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.title}>Native Player</Text>
      <Text style={styles.subtitle}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  title: {
    marginTop: 16,
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 8,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
});
