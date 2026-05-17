import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

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
  const shimmer = useRef(new Animated.Value(0)).current;

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

  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} shimmer={shimmer} />
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
