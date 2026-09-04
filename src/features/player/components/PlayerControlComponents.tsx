import React, { useCallback, useState, memo } from "react";
import {
  View,
  Text,
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { formatDuration } from "@/lib/musicData";
import { PlayerSlider } from "@/components/PlayerSlider";
import { clampUnit } from "@/lib/sliderUtils";
import { styles } from "../styles/playerScreenStyles";

export type SmoothControlButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: React.ComponentProps<typeof Pressable>["hitSlop"];
  disabled?: boolean;
};

export function SmoothControlButton({
  children,
  onPress,
  onPressIn,
  onPressOut,
  style,
  hitSlop,
  disabled,
}: SmoothControlButtonProps) {
  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      onPressIn?.(event);
    },
    [onPressIn]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      onPressOut?.(event);
    },
    [onPressOut]
  );

  return (
    <Pressable
      android_disableSound
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [style, pressed && styles.quickButtonPressed]}
    >
      {children}
    </Pressable>
  );
}

export function PlayerPlayButton({
  active,
  buttonSize,
  iconSize,
  onAccentColor,
  onPress,
}: {
  active: boolean;
  buttonSize: number;
  iconSize: number;
  onAccentColor: string;
  onPress: () => void;
}) {
  return (
    <SmoothControlButton
      onPress={onPress}
      style={[
        styles.playButton,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.92)",
        },
      ]}
    >
      <Ionicons
        name={active ? "pause" : "play"}
        size={iconSize}
        color={onAccentColor}
        style={!active ? { marginLeft: 2 } : undefined}
      />
    </SmoothControlButton>
  );
}

PlayerPlayButton.displayName = "PlayerPlayButton";

export type PlayerSpotifyProgressProps = {
  progressRatio: number;
  totalLengthMs: number;
  totalSongSec: number;
  isShortScreen: boolean;
  seekTo: (ratio: number) => void;
  onSeekingChange: (isSeeking: boolean) => void;
};

export const PlayerSpotifyProgress = memo(function PlayerSpotifyProgress({
  progressRatio,
  totalLengthMs,
  totalSongSec,
  isShortScreen,
  seekTo,
  onSeekingChange,
}: PlayerSpotifyProgressProps) {
  const [scrubProgress, setScrubProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const currentRatio = isScrubbing ? scrubProgress : progressRatio;
  const safeSongDuration = Number.isFinite(totalSongSec) ? Math.max(0, totalSongSec) : 0;
  const currentPosMs = Math.round(totalLengthMs * currentRatio);
  const currentTimeSec = Math.floor(currentPosMs / 1000);
  const totalDurationSec = Math.floor(totalLengthMs / 1000);
  const effectiveDurationSec = totalDurationSec > 0 ? totalDurationSec : safeSongDuration;
  const canSeek = effectiveDurationSec > 0 || safeSongDuration > 0;
  const displayDuration =
    totalDurationSec > 0 ? formatDuration(totalDurationSec) : formatDuration(safeSongDuration);

  const updateSeeking = useCallback(
    (next: boolean) => onSeekingChange(next),
    [onSeekingChange]
  );

  const SLIDER_MAX = 1000;
  const sliderValue = Math.round(currentRatio * SLIDER_MAX);
  const currentDisplayTime = formatDuration(
    Math.min(effectiveDurationSec, currentTimeSec)
  );

  const handleSlidingStart = useCallback(() => {
    setIsScrubbing(true);
    updateSeeking(true);
  }, [updateSeeking]);

  const handleValueChange = useCallback((value: number) => {
    const normalized = clampUnit(value / SLIDER_MAX);
    setScrubProgress(normalized);
  }, []);

  const handleSlidingComplete = useCallback((value: number) => {
    const normalized = clampUnit(value / SLIDER_MAX);
    setIsScrubbing(false);
    updateSeeking(false);
    setScrubProgress(normalized);
    seekTo(normalized);
  }, [seekTo, updateSeeking]);

  const handleSlidingCancel = useCallback(() => {
    setIsScrubbing(false);
    updateSeeking(false);
    setScrubProgress(progressRatio);
  }, [progressRatio, updateSeeking]);

  return (
    <View
      style={[
        styles.spotifyProgressWrap,
        { marginTop: isShortScreen ? 14 : 18, marginHorizontal: isShortScreen ? 16 : 20 },
      ]}
    >
      <PlayerSlider
        value={sliderValue}
        minimumValue={0}
        maximumValue={SLIDER_MAX}
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        onSlidingCancel={handleSlidingCancel}
        disabled={!canSeek}
        accessible
        accessibilityLabel="Playback position"
        accessibilityRole="adjustable"
        accessibilityValue={{
          text: `${currentDisplayTime} of ${displayDuration}`,
        }}
      />
      <View style={styles.spotifyTimeRow}>
        <Text style={styles.spotifyTimeText}>{currentDisplayTime}</Text>
        <Text style={styles.spotifyTimeText}>{displayDuration}</Text>
      </View>
    </View>
  );
});

PlayerSpotifyProgress.displayName = "PlayerSpotifyProgress";
