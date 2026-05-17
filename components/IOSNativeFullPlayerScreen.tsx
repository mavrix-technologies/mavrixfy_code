import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { usePlayerActions, usePlayerProgress } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/lib/playbackEngine";
import {
  addIOSNativeFullPlayerCloseListener,
  addIOSNativeFullPlayerErrorListener,
  isIOSNativeFullPlayerAvailable,
  presentIOSNativeFullPlayer,
  type IOSNativeFullPlayerCloseEvent,
} from "@/lib/iosNativeFullPlayer";

export default function IOSNativeFullPlayerScreen() {
  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, seekTo, togglePlay } = usePlayerActions();
  const { positionMillis } = usePlayerProgress();
  const [statusText, setStatusText] = useState("Opening native iOS player...");
  const launchedRef = useRef(false);
  const syncedRef = useRef(false);
  const mountedRef = useRef(true);
  const positionMillisRef = useRef(positionMillis);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    positionMillisRef.current = positionMillis;
  }, [positionMillis]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, []);

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

      const syncTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        seekTo(normalizedProgress);

        if (!shouldResumePlaying) {
          const pauseTimer = setTimeout(() => {
            if (!mountedRef.current) return;
            togglePlay();
            router.back();
          }, 180);
          timeoutRefs.current.push(pauseTimer);
          return;
        }

        router.back();
      }, 280);
      timeoutRefs.current.push(syncTimer);
    };

    const handleError = (event: { message?: string }) => {
      if (!mountedRef.current) return;
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
            startPositionSeconds: Math.max(positionMillisRef.current / 1000, 0),
            shouldPlay: isPlaying,
          });
        } catch (error) {
          if (!mountedRef.current) return;
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
