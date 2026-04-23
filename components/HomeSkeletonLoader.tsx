import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);
  return shimmer;
}

function Block({
  w, h, r = 8, shimmer,
}: { w: number | string; h: number; r?: number; shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["#1c2028", "#272d38"],
  });
  return (
    <Animated.View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: bg, marginBottom: 0 }} />
  );
}

// ── Artist circles row ────────────────────────────────────────────────────────
function ArtistRow({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={styles.artistRow}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.artistItem}>
          <Block w={108} h={108} r={54} shimmer={shimmer} />
          <Block w={72} h={10} r={5} shimmer={shimmer} />
        </View>
      ))}
    </View>
  );
}

// ── Small chips row (recents) ─────────────────────────────────────────────────
function ChipsRow({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={styles.chipsRow}>
      {[0, 1, 2, 3].map((i) => (
        <Block key={i} w={90} h={90} r={8} shimmer={shimmer} />
      ))}
    </View>
  );
}

// ── Playlist card row ─────────────────────────────────────────────────────────
function CardRow({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={styles.cardRow}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.cardItem}>
          <Block w={152} h={152} r={8} shimmer={shimmer} />
          <View style={{ height: 6 }} />
          <Block w={110} h={11} r={5} shimmer={shimmer} />
          <View style={{ height: 4 }} />
          <Block w={70} h={9} r={5} shimmer={shimmer} />
        </View>
      ))}
    </View>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
      <Block w={130} h={14} r={6} shimmer={shimmer} />
    </View>
  );
}

export default function HomeSkeletonLoader() {
  const shimmer = useShimmer();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Block w={150} h={22} r={8} shimmer={shimmer} />
        <Block w={36} h={36} r={18} shimmer={shimmer} />
      </View>

      {/* 1. Featured Artists */}
      <SectionLabel shimmer={shimmer} />
      <ArtistRow shimmer={shimmer} />

      <View style={{ height: 28 }} />

      {/* 2. Jump Back In */}
      <SectionLabel shimmer={shimmer} />
      <ChipsRow shimmer={shimmer} />

      <View style={{ height: 28 }} />

      {/* 3. Category row 1 */}
      <SectionLabel shimmer={shimmer} />
      <CardRow shimmer={shimmer} />

      <View style={{ height: 28 }} />

      {/* 4. Category row 2 */}
      <SectionLabel shimmer={shimmer} />
      <CardRow shimmer={shimmer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  artistRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
  },
  artistItem: {
    alignItems: "center",
    gap: 6,
  },
  chipsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
  },
  cardRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
  },
  cardItem: {
    gap: 0,
  },
});
