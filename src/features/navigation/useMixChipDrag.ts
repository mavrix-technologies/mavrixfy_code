import { useRef, useState, useCallback, useMemo } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { Gesture } from "react-native-gesture-handler";
import { clearLastMix } from "@/lib/lastMix";

const MIX_DELETE_THRESHOLD = -72;

export function useMixChipDrag() {
  const [isDragging, setIsDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const dragXRef = useRef<Animated.Value | null>(null);
  if (dragXRef.current === null) dragXRef.current = new Animated.Value(0);
  const dragX = dragXRef.current;
  const trashOpacityRef = useRef<Animated.Value | null>(null);
  if (trashOpacityRef.current === null) trashOpacityRef.current = new Animated.Value(0);
  const trashOpacity = trashOpacityRef.current;
  const chipScaleRef = useRef<Animated.Value | null>(null);
  if (chipScaleRef.current === null) chipScaleRef.current = new Animated.Value(1);
  const chipScale = chipScaleRef.current;
  const chipOpacityRef = useRef<Animated.Value | null>(null);
  if (chipOpacityRef.current === null) chipOpacityRef.current = new Animated.Value(1);
  const chipOpacity = chipOpacityRef.current;

  const resetMixChip = useCallback(() => {
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }),
      Animated.spring(chipScale, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 5 }),
      Animated.timing(chipOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(trashOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setIsDragging(false);
      setOverTrash(false);
    });
  }, [chipOpacity, chipScale, dragX, trashOpacity]);

  const startMixDrag = useCallback(() => {
    if (isDragging) return;
    dragX.setValue(0);
    chipOpacity.setValue(1);
    setOverTrash(false);
    setIsDragging(true);
    Animated.parallel([
      Animated.spring(chipScale, { toValue: 0.96, useNativeDriver: true, speed: 28, bounciness: 0 }),
      Animated.timing(trashOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [chipOpacity, chipScale, dragX, isDragging, trashOpacity]);

  const deleteMixWithAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(dragX, { toValue: -150, duration: 170, useNativeDriver: true }),
      Animated.timing(chipScale, { toValue: 0.8, duration: 170, useNativeDriver: true }),
      Animated.timing(chipOpacity, { toValue: 0, duration: 170, useNativeDriver: true }),
      Animated.timing(trashOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setIsDragging(false);
      setOverTrash(false);
      dragX.setValue(0);
      chipScale.setValue(1);
      chipOpacity.setValue(1);
      clearLastMix();
    });
  }, [chipOpacity, chipScale, dragX, trashOpacity]);

  const mixDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isDragging)
        .runOnJS(true)
        .onUpdate((event) => {
          const nextDx = Math.max(-170, Math.min(12, event.translationX));
          dragX.setValue(nextDx);
          const nextOverTrash = nextDx <= MIX_DELETE_THRESHOLD;
          setOverTrash((prev) => (prev === nextOverTrash ? prev : nextOverTrash));
        })
        .onEnd((event) => {
          if (event.translationX <= MIX_DELETE_THRESHOLD) {
            deleteMixWithAnimation();
            return;
          }
          resetMixChip();
        }),
    [deleteMixWithAnimation, dragX, isDragging, resetMixChip]
  );

  return {
    isDragging,
    overTrash,
    dragX,
    trashOpacity,
    chipScale,
    chipOpacity,
    startMixDrag,
    mixDragGesture,
  };
}
