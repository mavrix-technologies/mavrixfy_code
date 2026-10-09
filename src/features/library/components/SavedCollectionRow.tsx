import Colors from "@/constants/colors";
import { displayArtworkUrl } from "@/lib/artworkDisplay";
import type { SavedCollection } from "@/lib/savedCollections";
import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const SavedCollectionRow = memo(function SavedCollectionRow({
  collection,
  onPress,
}: {
  collection: SavedCollection;
  onPress: (collection: SavedCollection) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255,255,255,0.06)" }}
      onPress={() => onPress(collection)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${collection.title}`}
    >
      <Image
        recyclingKey={collection.id}
        source={{ uri: displayArtworkUrl(collection.image, 56) || undefined }}
        style={styles.artwork}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{collection.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{collection.subtitle}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", padding: 8, marginBottom: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  pressed: { opacity: 0.72 },
  artwork: { width: 56, height: 56, borderRadius: 10, backgroundColor: Colors.surfaceLight },
  info: { flex: 1, marginLeft: 14, gap: 3 },
  title: { color: Colors.text, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  subtitle: { color: Colors.subtext, fontSize: 12, fontFamily: "Inter_400Regular" },
});
