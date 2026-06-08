import React, { useEffect, useRef } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { StyleSheet, View } from "react-native";

const ARTIST_SKELETON_KEYS = ["artist-a", "artist-b", "artist-c", "artist-d", "artist-e"];
const CHIP_SKELETON_KEYS = ["chip-a", "chip-b", "chip-c", "chip-d"];
const CARD_SKELETON_KEYS = ["card-a", "card-b", "card-c", "card-d"];

function useShimmer() {
  const shimmerRef = useRef<Animated.Value | null>(null);
  if (shimmerRef.current === null) {
    shimmerRef.current = new Animated.Value(0);
  }
  const shimmer = shimmerRef.current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
          isInteraction: false,
        }),
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
  const glowOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.38],
  });
  return (
    <View style={[styles.block, { width: w as any, height: h, borderRadius: r }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.blockGlow, { opacity: glowOpacity }]} />
    </View>
  );
}

// ── Artist circles row ────────────────────────────────────────────────────────
function ArtistRow({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={styles.artistRow}>
      {ARTIST_SKELETON_KEYS.map((key) => (
        <View key={key} style={styles.artistItem}>
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
      {CHIP_SKELETON_KEYS.map((key) => (
        <Block key={key} w={90} h={90} r={8} shimmer={shimmer} />
      ))}
    </View>
  );
}

// ── Playlist card row ─────────────────────────────────────────────────────────
function CardRow({ shimmer }: { shimmer: Animated.Value }) {
  return (
    <View style={styles.cardRow}>
      {CARD_SKELETON_KEYS.map((key) => (
        <View key={key} style={styles.cardItem}>
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
  block: {
    overflow: "hidden",
    backgroundColor: "#1c2028",
  },
  blockGlow: {
    backgroundColor: "#C8D4E6",
  },
});
