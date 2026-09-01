import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";

type SearchResultFilterOption<T extends string = string> = {
  key: T;
  label: string;
};

type SearchResultFilterChipProps<T extends string> = {
  filter: SearchResultFilterOption<T>;
  activeFilter: T;
  onSelect: (filter: T) => void;
};

export default function SearchResultFilterChip<T extends string>({
  filter,
  activeFilter,
  onSelect,
}: SearchResultFilterChipProps<T>) {
  const active = activeFilter === filter.key;
  const handlePress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    onSelect(filter.key);
  }, [filter.key, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${filter.label}`}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipInactive,
        pressed && styles.chipPressed,
      ]}
      onPress={handlePress}
    >
      <Text style={[styles.text, active ? styles.textActive : styles.textInactive]}>
        {filter.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  chipInactive: {
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  chipActive: {
    backgroundColor: "#26e19a",
    borderWidth: 1,
    borderColor: "#26e19a",
  },
  chipPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  text: {
    fontSize: 13.5,
  },
  textInactive: {
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: "Inter_500Medium",
  },
  textActive: {
    color: "#080B11",
    fontFamily: "Inter_700Bold",
  },
});
