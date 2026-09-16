import React, { memo, useCallback } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";

export interface ArtistLanguageFiltersProps {
  languages: string[];
  selectedLanguage: string;
  onSelectLanguage: (language: string) => void;
}

interface FilterChipProps {
  item: string;
  isSelected: boolean;
  onSelect: (item: string) => void;
}

const FilterChip = memo(function FilterChip({
  item,
  isSelected,
  onSelect,
}: FilterChipProps) {
  const handlePress = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        isSelected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      onPress={handlePress}
    >
      <Text
        style={[
          styles.chipText,
          isSelected && styles.chipTextSelected,
        ]}
      >
        {item}
      </Text>
    </Pressable>
  );
});

export const ArtistLanguageFilters = memo(function ArtistLanguageFilters({
  languages,
  selectedLanguage,
  onSelectLanguage,
}: ArtistLanguageFiltersProps) {
  const handleSelect = useCallback((lang: string) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    onSelectLanguage(lang);
  }, [onSelectLanguage]);

  const renderItem = useCallback(({ item }: { item: string }) => (
    <FilterChip
      item={item}
      isSelected={item === selectedLanguage}
      onSelect={handleSelect}
    />
  ), [handleSelect, selectedLanguage]);

  const keyExtractor = useCallback((item: string) => item, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={languages}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  chipSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  chipTextSelected: {
    color: "#000000",
    fontFamily: "Inter_700Bold",
  },
});
