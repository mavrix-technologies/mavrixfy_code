import React from "react";
import { View, StyleSheet } from "react-native";

export function HomeQuickPicksSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonTitle} />
      <View style={styles.quickSkeletonGrid}>
        {[0, 1].map((column) => (
          <View key={`quick-skeleton-${column}`} style={styles.quickSkeletonColumn}>
            {[0, 1, 2, 3].map((row) => (
              <View key={`quick-skeleton-${column}-${row}`} style={styles.quickSkeletonRow}>
                <View style={styles.quickSkeletonCover} />
                <View style={styles.quickSkeletonTextBlock}>
                  <View style={styles.quickSkeletonLineWide} />
                  <View style={styles.quickSkeletonLineShort} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeSectionSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[0, 1, 2].map((section) => (
        <View key={`section-skeleton-${section}`} style={styles.skeletonSection}>
          <View style={styles.skeletonTitle} />
          <View style={styles.cardSkeletonRow}>
            {[0, 1, 2].map((card) => (
              <View key={`section-skeleton-${section}-${card}`} style={styles.cardSkeleton}>
                <View style={styles.cardSkeletonImage} />
                <View style={styles.cardSkeletonLineWide} />
                <View style={styles.cardSkeletonLineShort} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function HomeLoadingSkeleton() {
  return (
    <>
      <HomeQuickPicksSkeleton />
      <HomeSectionSkeleton />
    </>
  );
}

const styles = StyleSheet.create({
  skeletonContainer: {
    paddingBottom: 24,
  },
  skeletonSection: {
    marginTop: 20,
  },
  skeletonTitle: {
    width: 152,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#161B22",
    marginLeft: 16,
    marginBottom: 14,
  },
  quickSkeletonGrid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
  },
  quickSkeletonColumn: {
    flex: 1,
    gap: 8,
  },
  quickSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  quickSkeletonCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#161B22",
  },
  quickSkeletonTextBlock: {
    flex: 1,
    gap: 6,
  },
  quickSkeletonLineWide: {
    width: "82%",
    height: 12,
    borderRadius: 4,
    backgroundColor: "#161B22",
  },
  quickSkeletonLineShort: {
    width: "48%",
    height: 10,
    borderRadius: 4,
    backgroundColor: "#12171E",
  },
  cardSkeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
  },
  cardSkeleton: {
    width: 132,
    gap: 8,
  },
  cardSkeletonImage: {
    width: 132,
    height: 132,
    borderRadius: 8,
    backgroundColor: "#161B22",
  },
  cardSkeletonLineWide: {
    width: "88%",
    height: 12,
    borderRadius: 4,
    backgroundColor: "#161B22",
  },
  cardSkeletonLineShort: {
    width: "56%",
    height: 10,
    borderRadius: 4,
    backgroundColor: "#12171E",
  },
});
