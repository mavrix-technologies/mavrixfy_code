import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Colors from "@/constants/colors";

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
  const handlePress = useCallback(() => onSelect(filter.key), [filter.key, onSelect]);

  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={handlePress}
    >
      <Text style={[styles.text, active && styles.textActive]}>
        {filter.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    borderRadius: 4,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  text: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  textActive: {
    color: Colors.background,
    fontFamily: "Inter_700Bold",
  },
});
