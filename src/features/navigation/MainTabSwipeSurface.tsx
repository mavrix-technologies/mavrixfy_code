import { triggerImpact } from "@/lib/haptics";
import * as Haptics from "expo-haptics";
import { useMemo, type PropsWithChildren } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useOptionalNavSwipe, type NavSwipeContextValue } from "./navSwipeContext";
import { resolveNavTabSwipeDirection } from "./navSwipeUtils";
import type { VisibleRoute } from "./navTabConstants";

const SWIPE_ACTIVATION_DX = 26;
const MAX_VERTICAL_DRIFT_DY = 14;

export interface MainTabSwipeSurfaceProps extends PropsWithChildren {
  route: VisibleRoute;
  disabled?: boolean;
  /** Y threshold (in view coordinates) above which horizontal swipes always switch nav tabs. */
  headerSwipeMaxY?: number;
  style?: StyleProp<ViewStyle>;
}

function createTabSwipePanGesture(
  route: VisibleRoute,
  disabled: boolean,
  headerSwipeMaxY: number | undefined,
  navSwipe: NavSwipeContextValue | null
) {
  const touchState: {
    startX: number;
    startY: number;
    decision: 0 | 1 | -1;
    inHeaderBand: boolean;
  } = {
    startX: 0,
    startY: 0,
    decision: 0,
    inHeaderBand: false,
  };

  return Gesture.Pan()
    .enabled(!disabled && Platform.OS !== "web" && Boolean(navSwipe))
    .manualActivation(true)
    .runOnJS(true)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (!touch || !navSwipe || disabled) {
        touchState.decision = -1;
        return;
      }
      touchState.startX = touch.x;
      touchState.startY = touch.y;
      touchState.inHeaderBand = typeof headerSwipeMaxY === "number" && touch.y <= headerSwipeMaxY;
      touchState.decision = !touchState.inHeaderBand && navSwipe.isInnerHorizontalLocked() ? -1 : 0;
    })
    .onTouchesMove((event, stateManager) => {
      if (touchState.decision !== 0) {
        if (touchState.decision === -1) stateManager.fail();
        return;
      }
      const touch = event.allTouches[0];
      if (!touch || !navSwipe) return;

      const dx = touch.x - touchState.startX;
      const dy = touch.y - touchState.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDy > MAX_VERTICAL_DRIFT_DY && absDy > absDx * 0.9) {
        touchState.decision = -1;
        stateManager.fail();
        return;
      }

      if (absDx < SWIPE_ACTIVATION_DX || absDy > absDx * 0.72) {
        return;
      }

      const direction = dx > 0 ? "prev" : "next";
      const allowed = touchState.inHeaderBand
        ? route !== (direction === "prev" ? "index" : "import-songs")
        : navSwipe.canSwipeInDirection(direction);

      if (allowed) {
        touchState.decision = 1;
        stateManager.activate();
      } else {
        touchState.decision = -1;
        stateManager.fail();
      }
    })
    .onEnd((event) => {
      if (touchState.decision !== 1 || !navSwipe) return;
      const direction = resolveNavTabSwipeDirection({
        translationX: event.translationX,
        translationY: event.translationY,
        velocityX: event.velocityX,
      });
      if (!direction) return;
      const moved = touchState.inHeaderBand
        ? navSwipe.swipeToDirection(direction)
        : navSwipe.canSwipeInDirection(direction) && navSwipe.swipeToDirection(direction);
      if (moved && Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onFinalize(() => {
      touchState.decision = 0;
      touchState.inHeaderBand = false;
    });
}

/**
 * Lightweight horizontal swipe detector for main tab screens.
 * Uses manual gesture activation so vertical feeds, horizontal carousels,
 * and nested category pagers only hand off at true navigation boundaries.
 */
export function MainTabSwipeSurface({
  route,
  disabled = false,
  headerSwipeMaxY,
  style,
  children,
}: MainTabSwipeSurfaceProps) {
  const navSwipe = useOptionalNavSwipe();

  const panGesture = useMemo(
    () => createTabSwipePanGesture(route, disabled, headerSwipeMaxY, navSwipe),
    [disabled, headerSwipeMaxY, navSwipe, route]
  );

  if (!navSwipe || Platform.OS === "web") {
    return <View style={[styles.root, style]}>{children}</View>;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.root, style]}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
