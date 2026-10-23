import { playerUIStateStore } from "@/lib/playerUIState";
import { useEffect } from "react";
import { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

/** The route can freeze React renders; store notifications still drive UI-thread motion. */
export function usePlayerDockMotion(navHeight: number, preview: boolean) {
  const progress = useSharedValue(0);
  const miniHidden = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (preview) return;
    const update = (state: typeof playerUIStateStore.current) => {
      progress.set(withTiming(state === "expanded" ? 1 : 0, {
        duration: reduceMotion ? 0 : 520, easing: Easing.bezier(0.22, 1, 0.36, 1),
      }));
      // Cover the route's first native commit before hiding its source image.
      if (state === "expanded") miniHidden.set(withTiming(1, { duration: reduceMotion ? 0 : 80 }));
      else miniHidden.set(state === "collapsing" ? 1 : 0);
    };
    update(playerUIStateStore.current);
    const unsubscribe = playerUIStateStore.subscribe(update);
    return () => { unsubscribe(); cancelAnimation(progress); cancelAnimation(miniHidden); };
  }, [miniHidden, preview, progress, reduceMotion]);
  const navStyle = useAnimatedStyle(() => ({ transform: [{ translateY: navHeight * progress.get() }] }));
  const miniStyle = useAnimatedStyle(() => ({ opacity: 1 - miniHidden.get() }));
  return { navStyle, miniStyle };
}
