import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { ResultFilter } from "@/lib/searchRepository";
import { RESULT_FILTERS } from "../types";

export const SearchFilterBar = memo(function SearchFilterBar({ activeKey, onSelect }: {
  activeKey: ResultFilter;
  onSelect: (filter: ResultFilter) => void;
}) {
  return (
    <View style={styles.bar}>
      {RESULT_FILTERS.map(option => {
        const selected = option.key === activeKey;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.key)}
            style={({ pressed, hovered }) => [styles.tab, selected && styles.selected,
              !selected && (pressed || hovered) && styles.highlighted]}
          >
            <Text numberOfLines={1} style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: "row", height: 52, padding: 4, gap: 4, borderRadius: 26, backgroundColor: Colors.surface },
  tab: { flex: 1, minWidth: 0, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: "#26e19a" },
  highlighted: { backgroundColor: "rgba(38,225,154,0.18)" },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.subtext },
  selectedLabel: { fontFamily: "Inter_700Bold", color: "#080B11" },
});
