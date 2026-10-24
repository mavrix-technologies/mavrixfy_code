import { MusicArtwork } from "@/components/MusicArtwork";
import { AppNavBar } from "@/features/navigation/AppNavBar";
import type { Song } from "@/lib/musicData";
import type { MiniPlayerOrigin } from "@/lib/playerUIState";
import { artworkCandidates, artworkPixelSize } from "@/services/youtube/YouTubeArtwork";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, StyleSheet, View, type LayoutRectangle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { getPlayerArtworkSize } from "../hooks/usePlayerLayoutMetrics";

const easing = Easing.bezier(0.22, 1, 0.36, 1);
const fadeEasing = Easing.bezier(0.25, 0.1, 0.25, 1);
const LAYOUT_WAIT_MS = 400;
const COMPLETION_GRACE_MS = 300;

type Props = {
  origin: MiniPlayerOrigin | null;
  song: Song | null;
  viewport: { width: number; height: number };
  routeOffset: { x: number; y: number } | null;
  artwork: LayoutRectangle | null;
  moving: boolean;
  closing: boolean;
  artworkVisibility: SharedValue<number>;
  destinationArtworkReady: boolean;
  onOpenComplete: () => void;
  onCloseComplete: () => void;
  children: React.ReactNode;
};

/** Animate measured bounds only. Both endpoints keep their existing UI and layout. */
export function PlayerContainerTransition({ origin, song, viewport, routeOffset, artwork, moving,
  closing, artworkVisibility, destinationArtworkReady, onOpenComplete, onCloseComplete, children }: Props) {
  const reducedMotion = useReducedMotion();
  const [entered, setEntered] = useState(!origin || reducedMotion);
  const [skipMorph, setSkipMorph] = useState(!origin || reducedMotion);
  const morph = Boolean(origin) && !skipMorph;
  const progress = useSharedValue(entered ? 1 : 0);
  const fullOpacity = useSharedValue(entered ? 1 : 0);
  const miniOpacity = useSharedValue(entered ? 0 : 1);
  const miniTranslate = useSharedValue(entered ? -10 : 0);
  const overlayOpacity = useSharedValue(morph ? 1 : 0);
  const duration = reducedMotion ? 0 : morph ? 520 : 180;
  const { width, height } = viewport;
  const source = morph && origin ? origin.sheet : { x: 0, y: 0, width, height };
  const sourceArt = origin?.artwork;
  // Keep the native image's layout and request fixed throughout the morph.
  const imageSize = getPlayerArtworkSize(width, height);
  const miniCover = useMemo(() => artworkCandidates(song?.coverUrl, artworkPixelSize(44, PixelRatio.get()))[0], [song?.coverUrl]);

  // Freeze the destination artwork rect the moment the animation starts.
  // After `entered` becomes true, mid-flight re-measurements from JS must NOT
  // reach the worklet — otherwise the overlay image jumps/fluctuates visibly.
  const frozenTo = useSharedValue<LayoutRectangle | null>(artwork);
  const callbacks = useRef({ onOpenComplete, onCloseComplete });
  useEffect(() => {
    callbacks.current = { onOpenComplete, onCloseComplete };
  }, [onCloseComplete, onOpenComplete]);

  useEffect(() => {
    // Pre-load the correct destination while waiting to enter so the first
    // animation frame immediately has the right target position.
    if (artwork && !entered) {
      frozenTo.set({ x: artwork.x, y: artwork.y, width: artwork.width, height: artwork.height });
    }
  }, [artwork, entered, frozenTo]);

  useEffect(() => {
    if (entered || !routeOffset || !artwork || closing) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [artwork, closing, entered, routeOffset]);

  useEffect(() => {
    if (entered || closing) return;
    let active = true;
    // FlatList may never supply a usable card (empty queue, slow native mount,
    // backgrounding). Fade in the real surface instead of trapping the route.
    const timeout = setTimeout(() => {
      if (!active) return;
      setSkipMorph(true);
      setEntered(true);
    }, LAYOUT_WAIT_MS);
    return () => { active = false; clearTimeout(timeout); };
  }, [closing, entered]);

  useEffect(() => {
    if (!entered && !closing) return;
    let active = true;
    let completed = false;
    let timeout: ReturnType<typeof setTimeout>;
    // A finished UI callback may already be queued when React cleans up.
    const complete = () => {
      if (!active || completed) return;
      completed = true;
      clearTimeout(timeout);
      if (closing) callbacks.current.onCloseComplete();
      else callbacks.current.onOpenComplete();
    };
    const settle = () => {
      "worklet";
      cancelAnimation(progress); cancelAnimation(fullOpacity);
      cancelAnimation(miniOpacity); cancelAnimation(miniTranslate); cancelAnimation(overlayOpacity);
      progress.set(closing ? 0 : 1);
      fullOpacity.set(closing ? 0 : 1);
      miniOpacity.set(closing ? 1 : 0);
      miniTranslate.set(closing ? 0 : -10);
      if (!morph) { artworkVisibility.set(1); overlayOpacity.set(0); }
    };
    timeout = setTimeout(() => {
      if (!active || completed) return;
      // Recover from a cancelled/missing native completion, including resume.
      scheduleOnUI(settle);
      complete();
    }, duration + COMPLETION_GRACE_MS);
    scheduleOnUI(() => {
      "worklet";
      if (!morph) {
        overlayOpacity.set(0);
        artworkVisibility.set(1);
      } else if (closing) {
        cancelAnimation(overlayOpacity);
        overlayOpacity.set(1);
        artworkVisibility.set(0);
      }
      const delay = !closing && morph ? 80 : 0;
      fullOpacity.set(withDelay(delay, withTiming(closing ? 0 : 1, { duration: Math.min(duration, 320), easing: fadeEasing })));
      miniOpacity.set(withTiming(closing ? 1 : 0, { duration: duration ? 200 : 0, easing: fadeEasing }));
      miniTranslate.set(withTiming(closing ? 0 : -10, { duration: duration ? 280 : 0, easing: fadeEasing }));
      progress.set(withTiming(closing ? 0 : 1, { duration, easing },
        finished => { if (finished) scheduleOnRN(complete); }));
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      scheduleOnUI(() => {
        "worklet";
        cancelAnimation(progress); cancelAnimation(fullOpacity);
        cancelAnimation(miniOpacity); cancelAnimation(miniTranslate); cancelAnimation(overlayOpacity);
      });
    };
  }, [artworkVisibility, closing, duration, entered, fullOpacity, miniOpacity, miniTranslate,
    morph, overlayOpacity, progress]);

  useEffect(() => {
    if (!morph || moving || !destinationArtworkReady) return;
    scheduleOnUI(() => {
      "worklet";
      // Reveal the decoded destination first; the overlay covers its first frame.
      artworkVisibility.set(1);
      overlayOpacity.set(withTiming(0, { duration: reducedMotion ? 0 : 80 }));
    });
  }, [artworkVisibility, destinationArtworkReady, morph, moving, overlayOpacity, reducedMotion]);

  const sourceLeft = morph ? source.x - (routeOffset?.x ?? 0) : 0;
  const sourceBottom = morph ? height - (source.y - (routeOffset?.y ?? 0) + source.height) : 0;
  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: morph ? 1 : p,
      left: sourceLeft * (1 - p), bottom: sourceBottom * (1 - p),
      width: source.width + (width - source.width) * p,
      height: source.height + (height - source.height) * p,
      borderTopLeftRadius: 16 + 8 * p, borderTopRightRadius: 16 + 8 * p,
    };
  });
  const artworkStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const from = sourceArt ?? { x: 0, y: 0, width: 44, height: 44 };
    // Read from the frozen shared value — never from the live artwork prop —
    // so that mid-animation re-measurements cannot teleport the overlay image.
    const toFrozen = frozenTo.get();
    const to = toFrozen ?? from;
    const scaleX = (from.width + (to.width - from.width) * p) / imageSize;
    const scaleY = (from.height + (to.height - from.height) * p) / imageSize;
    return {
      opacity: morph ? overlayOpacity.get() : 0,
      borderRadius: (9 + 23 * p) / scaleX,
      transformOrigin: "top left",
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        { translateY: from.y + (to.y - from.y) * p },
        { scaleX },
        { scaleY },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => ({ opacity: fullOpacity.get() }));
  const miniStyle = useAnimatedStyle(() => ({ opacity: miniOpacity.get(), transform: [{ translateY: miniTranslate.get() }] }));

  return <View style={styles.root}>
    <Animated.View style={[styles.sheet, sheetStyle, {
      backgroundColor: origin?.backgroundColor ?? "#000000",
    }]}>
      <Animated.View pointerEvents={closing ? "none" : "auto"}
        style={[styles.content, { width, height }, contentStyle]}>{children}</Animated.View>
      {morph && <Animated.View pointerEvents="none" accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,
          { zIndex: 1, justifyContent: "center" }, miniStyle]}>
        <AppNavBar transitionPreview />
      </Animated.View>}
      {morph && sourceArt && <Animated.View pointerEvents="none"
        style={[styles.artwork, { width: imageSize, height: imageSize }, artworkStyle]}>
        <MusicArtwork uri={song?.coverUrl} size={imageSize} allowDownscaling={false}
          style={styles.image} contentFit="cover" contentPosition="center" transition={0} priority="high"
          placeholder={miniCover ? { uri: miniCover } : undefined} placeholderContentFit="cover" />
      </Animated.View>}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: { position: "absolute", overflow: "hidden" },
  content: { position: "absolute", left: 0, top: 0, zIndex: 0 },
  artwork: { position: "absolute", left: 0, top: 0, transformOrigin: "top left", overflow: "hidden", zIndex: 2 },
  image: { width: "100%", height: "100%" },
});
