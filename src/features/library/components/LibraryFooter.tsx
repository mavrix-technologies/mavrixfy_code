import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface LibraryFooterProps {
  totalTrackCount: number;
  playlistCount: number;
  onNavigateDownloads: () => void;
}

export const LibraryFooter = memo(function LibraryFooter({
  totalTrackCount,
  playlistCount,
  onNavigateDownloads,
}: LibraryFooterProps) {
  return (
    <View style={styles.footerSection}>
      <Text style={styles.discoverTitle}>Discover Categories</Text>
      <View style={styles.categoriesGrid}>
        <Pressable
          style={styles.categoryCard}
          android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
        >
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,225,154,0.18)" }]}>
            <Ionicons name="mic-outline" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.categoryLabel}>Podcasts</Text>
        </Pressable>

        <Pressable
          style={styles.categoryCard}
          android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
        >
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,42,49,0.9)" }]}>
            <Ionicons name="albums-outline" size={16} color={Colors.subtext} />
          </View>
          <Text style={styles.categoryLabel}>Albums</Text>
        </Pressable>

        <Pressable
          style={styles.categoryCard}
          android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
        >
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,42,49,0.9)" }]}>
            <Ionicons name="person-outline" size={16} color={Colors.subtext} />
          </View>
          <Text style={styles.categoryLabel}>Artists</Text>
        </Pressable>

        <Pressable
          style={styles.categoryCard}
          android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
          onPress={onNavigateDownloads}
        >
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,225,154,0.18)" }]}>
            <Ionicons name="download-outline" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.categoryLabel}>Downloads</Text>
        </Pressable>
      </View>

      <View style={styles.statsFooter}>
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>Mavrixfy</Text>
          <Text style={styles.brandTag}>OBSIDIAN LIBRARY</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{totalTrackCount.toLocaleString()} TRACKS</Text>
          <Text style={styles.statText}>{playlistCount.toLocaleString()} PLAYLISTS</Text>
          <Text style={styles.statText}>OFFICIAL UI</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  footerSection: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  discoverTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  categoryCard: {
    width: "48.5%",
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  statsFooter: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    opacity: 0.8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  brandName: {
    color: Colors.primary,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.25,
  },
  brandTag: {
    color: Colors.subtext,
    fontSize: 9,
    letterSpacing: 1.1,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statText: {
    color: Colors.subtext,
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
  },
});
