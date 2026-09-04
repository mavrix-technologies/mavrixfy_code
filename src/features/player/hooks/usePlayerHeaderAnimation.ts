import { useState } from "react";
import * as Animated from "@/lib/nativeAnimated";

export function usePlayerHeaderAnimation() {
  const [headerScrollY] = useState(() => new Animated.Value(0));

  const headerBgOpacity = headerScrollY.interpolate({
    inputRange: [0, 45, 95],
    outputRange: [0, 0.75, 1],
    extrapolate: "clamp",
  });

  const topTitleOpacity = headerScrollY.interpolate({
    inputRange: [0, 40, 80],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });

  const topTitleTranslateY = headerScrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -8],
    extrapolate: "clamp",
  });

  const scrolledTitleOpacity = headerScrollY.interpolate({
    inputRange: [40, 85, 125],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp",
  });

  const scrolledTitleTranslateY = headerScrollY.interpolate({
    inputRange: [40, 125],
    outputRange: [8, 0],
    extrapolate: "clamp",
  });

  return {
    headerScrollY,
    headerBgOpacity,
    topTitleOpacity,
    topTitleTranslateY,
    scrolledTitleOpacity,
    scrolledTitleTranslateY,
  };
}
