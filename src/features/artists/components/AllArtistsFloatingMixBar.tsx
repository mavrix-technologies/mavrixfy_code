import React, { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface AllArtistsFloatingMixBarProps {
  bottom: number;
  count: number;
  onPress: () => void;
}

export const AllArtistsFloatingMixBar = memo(function AllArtistsFloatingMixBar({
  bottom,
  count,
  onPress,
}: AllArtistsFloatingMixBarProps) {
  if (count === 0) return null;

  return (
    <View style={[styles.floatingBar, { bottom }]}>
      <Pressable
        style={({ pressed }) => [
          styles.floatingMixBtn,
          pressed && styles.floatingMixBtnPressed,
        ]}
        onPress={onPress}
      >
        <Ionicons name="musical-notes" size={19} color="#000000" />
        <Text style={styles.floatingMixText}>
          Mix {count} Artist{count > 1 ? "s" : ""}
        </Text>
        <Ionicons name="arrow-forward" size={16} color="#000000" />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  floatingBar: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 50,
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
  },
  floatingMixBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  floatingMixBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  floatingMixText: {
    color: "#000000",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
