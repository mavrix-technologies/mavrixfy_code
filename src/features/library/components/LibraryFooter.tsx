import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface LibraryFooterProps {
  totalTrackCount: number;
  playlistCount: number;
  onNavigateDownloads: () => void;
}

export const LibraryFooter = memo(function LibraryFooter({
  totalTrackCount,
  playlistCount,
}: LibraryFooterProps) {
  return (
    <View style={styles.footerSection}>
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalTrackCount.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total Songs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{playlistCount}</Text>
          <Text style={styles.statLabel}>Playlists</Text>
        </View>
      </View>

      <View style={styles.brandFooter}>
        <Text style={styles.brandText}>Mavrixfy</Text>
        <Text style={styles.brandSubtext}>Your Music, Your Way</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  footerSection: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    color: Colors.primary,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  statLabel: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  brandFooter: {
    marginTop: 24,
    alignItems: "center",
    opacity: 0.6,
  },
  brandText: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  brandSubtext: {
    color: Colors.subtext,
    fontSize: 11,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
});
