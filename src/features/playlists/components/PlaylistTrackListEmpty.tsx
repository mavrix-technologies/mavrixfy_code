import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import SongRowSkeleton from "@/components/SongRowSkeleton";

interface PlaylistTrackListEmptyProps {
  loading: boolean;
  collectionKind: string;
  loadError: string;
}

export const PlaylistTrackListEmpty: React.FC<PlaylistTrackListEmptyProps> = ({
  loading,
  collectionKind,
  loadError,
}) => {
  if (loading) {
    return (
      <View style={styles.skeletonList}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SongRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.inlineWrap}>
      <Text style={styles.inlineText}>
        {loadError || `No tracks available in this ${collectionKind.toLowerCase()}.`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonList: {
    width: "100%",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 8,
  },
  inlineWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  inlineText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
