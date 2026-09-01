import React, { useEffect, useRef } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { StyleSheet, View } from "react-native";

const SKELETON_KEYS = [
  "skel_1", "skel_2", "skel_3", "skel_4", "skel_5",
  "skel_6", "skel_7", "skel_8", "skel_9", "skel_10",
  "skel_11", "skel_12", "skel_13", "skel_14", "skel_15",
  "skel_16", "skel_17", "skel_18", "skel_19", "skel_20",
];

function SkeletonRow({ shimmer }: { shimmer: Animated.Value }) {
  const glowOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.36],
  });
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
      </View>
      <View style={styles.text}>
        <View style={styles.title}>
          <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
        </View>
        <View style={styles.sub}>
          <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
        </View>
      </View>
    </View>
  );
}

export default function SongRowSkeleton({ count = 8 }: { count?: number }) {
  const shimmerRef = useRef<Animated.Value | null>(null);
  if (shimmerRef.current === null) shimmerRef.current = new Animated.Value(0);
  const shimmer = shimmerRef.current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const keys = SKELETON_KEYS.slice(0, Math.max(1, Math.min(count, SKELETON_KEYS.length)));

  return (
    <View>
      {keys.map((keyId) => (
        <SkeletonRow key={keyId} shimmer={shimmer} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#1e2228",
  },
  text: {
    flex: 1,
    gap: 6,
  },
  title: {
    height: 13,
    borderRadius: 6,
    width: "65%",
    overflow: "hidden",
    backgroundColor: "#1e2228",
  },
  sub: {
    height: 11,
    borderRadius: 6,
    width: "40%",
    overflow: "hidden",
    backgroundColor: "#1e2228",
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#C8D4E6",
  },
});
