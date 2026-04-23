import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

function SkeletonRow({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["#1e2228", "#2a2f38"],
  });
  return (
    <View style={styles.row}>
      <Animated.View style={[styles.thumb, { backgroundColor: bg }]} />
      <View style={styles.text}>
        <Animated.View style={[styles.title, { backgroundColor: bg }]} />
        <Animated.View style={[styles.sub, { backgroundColor: bg }]} />
      </View>
    </View>
  );
}

export default function SongRowSkeleton({ count = 8 }: { count?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: false }),
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
  },
  text: {
    flex: 1,
    gap: 6,
  },
  title: {
    height: 13,
    borderRadius: 6,
    width: "65%",
  },
  sub: {
    height: 11,
    borderRadius: 6,
    width: "40%",
  },
});
