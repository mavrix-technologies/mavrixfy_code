import { Image } from "expo-image";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useAppIsActive } from "./appActivity";
import { usePlayerUIState } from "./playerUIState";

/** Native animated images keep decoding behind opacity/covered screens unless stopped. */
export function useVisibleImageAnimation(source: string | null | undefined,
  scrollY?: number | SharedValue<number>, visibleUntil = Infinity) {
  const imageRef = useRef<Image>(null);
  const focused = useIsFocused();
  const foreground = useAppIsActive();
  const player = usePlayerUIState();
  const [inViewport, setInViewport] = useState(true);
  const animationActive = focused && foreground && inViewport && player !== "expanded";
  useAnimatedReaction(
    () => (typeof scrollY === "number" ? scrollY : scrollY?.value || 0) < visibleUntil,
    (visible, previous) => {
      if (visible !== previous) scheduleOnRN(setInViewport, visible);
    }, [scrollY, visibleUntil]
  );
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    void (animationActive ? image.startAnimating() : image.stopAnimating()).catch(() => {});
    return () => { void image.stopAnimating().catch(() => {}); };
  }, [animationActive, source]);
  return { imageRef, animationActive };
}
