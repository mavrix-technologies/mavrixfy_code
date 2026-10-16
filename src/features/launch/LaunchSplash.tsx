import { memo, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedReaction, useAnimatedStyle,
  useReducedMotion, useSharedValue, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import bars from "../../../assets/branding/mavrixfy-bars.json";
import motion from "../../../assets/branding/launch-motion.json";
import { getLaunchBarFrame, LAUNCH_REVEAL_MS } from "./launchMotion";
import { hideNativeSplash } from "./nativeSplash";

const imageWidth = 224;
const unit = imageWidth / 1024;

const LaunchBar = memo(function LaunchBar({ index, clock }: { index: number; clock: SharedValue<number> }) {
  const bar = bars[index];
  const animatedStyle = useAnimatedStyle(() => {
    const frame = getLaunchBarFrame(clock.get(), index);
    return { opacity: frame.opacity, transform: [{ translateY: frame.translateY }, { scaleY: frame.scaleY }] };
  });
  return (
    <Animated.View testID={`launch-bar-${index}`} renderToHardwareTextureAndroid shouldRasterizeIOS
      style={[{
        position: "absolute", left: bar.x * unit, top: bar.y * unit,
        width: bar.width * unit, height: bar.height * unit,
      }, animatedStyle]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${bar.width} ${bar.height}`} accessible={false}>
        <Defs>
          <LinearGradient id={`launch-fill-${index}`} x1="0%" y1="0%" x2="0%" y2="100%">
            {bar.stops.map((stop, stopIndex) => <Stop key={stopIndex} offset={stop.offset} stopColor={stop.color} />)}
          </LinearGradient>
        </Defs>
        <Rect width={bar.width} height={bar.height} rx={bar.rx} fill={`url(#launch-fill-${index})`} />
      </Svg>
    </Animated.View>
  );
});

/** Reveal runs during loading. Only the final fade waits for the initial screen. */
export function LaunchSplash({ ready, onComplete }: { ready: boolean; onComplete: () => void }) {
  const [laidOut, setLaidOut] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const clock = useSharedValue(0);
  const opacity = useSharedValue(1);
  const canExit = useSharedValue(false);
  const started = useSharedValue(false);
  const exiting = useSharedValue(false);
  const active = useSharedValue(true);
  const reduceMotion = useReducedMotion();
  const complete = useRef(false);
  const mounted = useRef(true);
  const markLaidOut = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) setLaidOut(true);
  }, []);
  const markLogoReady = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) setLogoReady(true);
  }, []);
  const finish = useCallback(() => {
    if (!mounted.current || complete.current) return;
    complete.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => { canExit.set(ready); }, [ready, canExit]);

  useEffect(() => {
    mounted.current = true;
    active.set(true);
    return () => {
      mounted.current = false;
      active.set(false);
      cancelAnimation(clock);
      cancelAnimation(opacity);
    };
  }, [active, clock, opacity]);

  useEffect(() => {
    if (!laidOut || !logoReady) return;
    let cancelled = false;
    void hideNativeSplash("logoReady").then(() => {
      if (cancelled) return;
      // No fonts/auth wait and no asynchronous accessibility query before first motion.
      started.set(true);
      clock.set(reduceMotion ? LAUNCH_REVEAL_MS : withTiming(LAUNCH_REVEAL_MS, {
        duration: LAUNCH_REVEAL_MS, easing: Easing.linear,
      }));
    });
    return () => { cancelled = true; };
  }, [laidOut, logoReady, clock, started, reduceMotion]);

  useAnimatedReaction(
    () => active.get() && started.get() && canExit.get() && clock.get() >= LAUNCH_REVEAL_MS,
    shouldExit => {
      if (!shouldExit || exiting.get()) return;
      exiting.set(true);
      // This handoff stays on the UI thread, even if JS is busy mounting Home.
      opacity.set(withTiming(0, {
        duration: reduceMotion ? motion.reducedFadeMs : motion.fadeMs,
        easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.Never,
      }, finished => {
        if (finished && active.get()) scheduleOnRN(finish);
      }));
    },
  );

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View testID="launch-splash" onLayout={markLaidOut}
      accessible accessibilityRole="progressbar" accessibilityLabel="Mavrixfy is starting"
      style={[styles.overlay, overlayStyle]}>
      <View style={styles.logo} onLayout={markLogoReady} testID="launch-logo" accessible={false}>
        {bars.map((_, index) => <LaunchBar key={index} index={index} clock={clock} />)}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 1001, backgroundColor: "#10141A",
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: imageWidth, height: imageWidth },
});
