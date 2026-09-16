import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SearchHeaderField } from "@/components/SearchHeaderField";

export interface AllArtistsSearchProps {
  query: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

export const AllArtistsSearch = memo(function AllArtistsSearch({
  query,
  onChangeText,
  onClear,
}: AllArtistsSearchProps) {
  return (
    <View style={styles.container}>
      <SearchHeaderField
        theme="dark"
        placeholder="Search artists by name or genre…"
        value={query}
        onChangeText={onChangeText}
        onClear={onClear}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
});
