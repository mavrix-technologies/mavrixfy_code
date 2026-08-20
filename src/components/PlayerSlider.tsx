import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  PLAYER_SLIDER_MINIMUM_TRACK_COLOR,
  PLAYER_SLIDER_MAXIMUM_TRACK_COLOR,
  PLAYER_SLIDER_THUMB_COLOR,
  PLAYER_SLIDER_TOUCH_HEIGHT,
  PLAYER_SLIDER_THUMB_SIZE,
  clampUnit,
  progressFromGestureX,
} from "@/lib/sliderUtils";

export type PlayerSliderProps = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  disabled?: boolean;
  onSlidingStart?: () => void;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  onSlidingCancel?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: React.ComponentProps<typeof View>["accessibilityRole"];
  accessibilityValue?: React.ComponentProps<typeof View>["accessibilityValue"];
};

export const PlayerSlider = memo(function PlayerSlider({
  value,
  minimumValue,
  maximumValue,
  disabled = false,
  onSlidingStart,
  onValueChange,
  onSlidingComplete,
  onSlidingCancel,
  accessible,
  accessibilityLabel,
  accessibilityRole,
  accessibilityValue,
}: PlayerSliderProps) {
  const trackWidth = useSharedValue(0);
  const visualProgress = useSharedValue(0);
  const isSlidingShared = useSharedValue(0);
  const didCompleteGesture = useSharedValue(0);
  const isSlidingRef = useRef(false);
  const range = maximumValue - minimumValue;
  const normalizedValue = range > 0 ? clampUnit((value - minimumValue) / range) : 0;

  useEffect(() => {
    if (!isSlidingRef.current) {
      visualProgress.value = normalizedValue;
    }
  }, [normalizedValue, visualProgress]);

  useEffect(() => {
    if (!disabled) return;
    isSlidingRef.current = false;
    isSlidingShared.value = 0;
  }, [disabled, isSlidingShared]);

  const emitValue = useCallback(
    (nextProgress: number, shouldComplete: boolean) => {
      const nextValue = minimumValue + clampUnit(nextProgress) * range;
      onValueChange?.(nextValue);
      if (!shouldComplete) return;

      isSlidingRef.current = false;
      onSlidingComplete?.(nextValue);
    },
    [minimumValue, onSlidingComplete, onValueChange, range]
  );

  const beginSliding = useCallback(() => {
    if (isSlidingRef.current) return;
    isSlidingRef.current = true;
    onSlidingStart?.();
  }, [onSlidingStart]);

  const cancelSliding = useCallback(() => {
    if (!isSlidingRef.current) return;
    isSlidingRef.current = false;
    onSlidingCancel?.();
  }, [onSlidingCancel]);

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (disabled || range <= 0) return;
      const step = range / 20;
      const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const nextValue = Math.min(maximumValue, Math.max(minimumValue, value + step * direction));
      onSlidingStart?.();
      onValueChange?.(nextValue);
      onSlidingComplete?.(nextValue);
    },
    [disabled, maximumValue, minimumValue, onSlidingComplete, onSlidingStart, onValueChange, range, value]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .onTouchesDown((event) => {
          const touch = event.allTouches[0] ?? event.changedTouches[0];
          if (!touch) return;

          didCompleteGesture.value = 0;
          isSlidingShared.value = 1;
          const nextProgress = progressFromGestureX(touch.x, trackWidth.value);
          visualProgress.value = nextProgress;
          scheduleOnRN(beginSliding);
          scheduleOnRN(emitValue, nextProgress, false);
        })
        .onBegin((event) => {
          if (isSlidingShared.value > 0) return;

          didCompleteGesture.value = 0;
          isSlidingShared.value = 1;
          const nextProgress = progressFromGestureX(event.x, trackWidth.value);
          visualProgress.value = nextProgress;
          scheduleOnRN(beginSliding);
          scheduleOnRN(emitValue, nextProgress, false);
        })
        .onUpdate((event) => {
          const nextProgress = progressFromGestureX(event.x, trackWidth.value);
          visualProgress.value = nextProgress;
          scheduleOnRN(emitValue, nextProgress, false);
        })
        .onEnd(() => {
          if (didCompleteGesture.value === 1) return;

          didCompleteGesture.value = 1;
          scheduleOnRN(emitValue, visualProgress.value, true);
        })
        .onTouchesUp((event) => {
          if (didCompleteGesture.value === 1) return;

          const touch = event.changedTouches[0] ?? event.allTouches[0];
          if (!touch) return;

          const nextProgress = progressFromGestureX(touch.x, trackWidth.value);
          visualProgress.value = nextProgress;
          didCompleteGesture.value = 1;
          scheduleOnRN(emitValue, nextProgress, true);
        })
        .onFinalize(() => {
          isSlidingShared.value = 0;
          if (didCompleteGesture.value === 0) {
            scheduleOnRN(cancelSliding);
          }
        }),
    [beginSliding, cancelSliding, didCompleteGesture, disabled, emitValue, isSlidingShared, trackWidth, visualProgress]
  );

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    width: Math.max(0, trackWidth.value * visualProgress.value),
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.45 : 1,
    transform: [
      {
        translateX: Math.max(0, trackWidth.value * visualProgress.value) - PLAYER_SLIDER_THUMB_SIZE / 2,
      },
      { scale: isSlidingShared.value ? 1.16 : 1 },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View
        accessible={accessible}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityValue={accessibilityValue}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={(event) => {
          trackWidth.value = Math.max(1, event.nativeEvent.layout.width);
        }}
        style={[styles.playerSlider, disabled && styles.playerSliderDisabled]}
      >
        <View style={styles.playerSliderTrack}>
          <Reanimated.View style={[styles.playerSliderFill, fillAnimatedStyle]} />
        </View>
        <Reanimated.View pointerEvents="none" style={[styles.playerSliderThumb, thumbAnimatedStyle]} />
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  playerSlider: {
    width: "100%",
    height: PLAYER_SLIDER_TOUCH_HEIGHT,
    marginVertical: 0,
    justifyContent: "center",
    position: "relative",
  },
  playerSliderDisabled: {
    opacity: 0.7,
  },
  playerSliderTrack: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    backgroundColor: PLAYER_SLIDER_MAXIMUM_TRACK_COLOR,
    overflow: "hidden",
  },
  playerSliderFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: PLAYER_SLIDER_MINIMUM_TRACK_COLOR,
  },
  playerSliderThumb: {
    position: "absolute",
    left: 0,
    top: (PLAYER_SLIDER_TOUCH_HEIGHT - PLAYER_SLIDER_THUMB_SIZE) / 2,
    width: PLAYER_SLIDER_THUMB_SIZE,
    height: PLAYER_SLIDER_THUMB_SIZE,
    borderRadius: PLAYER_SLIDER_THUMB_SIZE / 2,
    backgroundColor: PLAYER_SLIDER_THUMB_COLOR,
  },
});
