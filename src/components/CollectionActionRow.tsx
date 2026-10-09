import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface CollectionActionRowProps {
  onShuffle: () => void;
  onPlay: () => void;
  onLike: () => void;
  isPlaying: boolean;
  isLiked: boolean;
  disabled?: boolean;
  playLabel?: string;
  likedLabel?: string;
}

export const CollectionActionRow = memo(function CollectionActionRow({
  onShuffle,
  onPlay,
  onLike,
  isPlaying,
  isLiked,
  disabled = false,
  playLabel = "Play",
  likedLabel = "collection",
}: CollectionActionRowProps) {
  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.circle, pressed && styles.pressed, disabled && styles.disabled]}
        hitSlop={3}
        onPress={onShuffle}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Shuffle ${likedLabel}`}
      >
        <Ionicons name="shuffle" size={19} color="#FFFFFF" />
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.play, pressed && styles.pressed, disabled && styles.disabled]}
        hitSlop={3}
        onPress={onPlay}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${isPlaying ? "Pause" : "Play"} ${likedLabel}`}
      >
        <Ionicons name={isPlaying ? "pause" : "play"} size={18} color="#090B0E" />
        <Text style={styles.playText}>{isPlaying ? "Pause" : playLabel}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.circle, isLiked && styles.liked, pressed && styles.pressed]}
        hitSlop={3}
        onPress={onLike}
        accessibilityRole="button"
        accessibilityLabel={`${isLiked ? "Remove from" : "Add to"} library`}
        accessibilityState={{ selected: isLiked }}
      >
        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={19} color={isLiked ? Colors.primary : "#FFFFFF"} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 4 },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  liked: { backgroundColor: "rgba(255,255,255,0.22)" },
  play: {
    minWidth: 92,
    height: 40,
    paddingHorizontal: 17,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  playText: { color: "#090B0E", fontSize: 14, fontFamily: "Inter_700Bold" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.45 },
});
