import React from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type SearchHeaderFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  autoFocus?: boolean;
};

export default function SearchHeaderField({
  value,
  onChangeText,
  onSubmit,
  onClear,
  autoFocus = false,
}: SearchHeaderFieldProps) {
  return (
    <View style={styles.field}>
      <Ionicons name="search" size={16} color="#8E949B" />
      <TextInput
        style={styles.input}
        placeholder="Search songs, artists, playlists"
        placeholderTextColor="#8E949B"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        inputMode="search"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode={Platform.OS === "ios" ? "while-editing" : "never"}
        keyboardAppearance="dark"
      />
      {Platform.OS !== "ios" && value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={onClear}
          hitSlop={8}
          style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
        >
          <Ionicons name="close-circle" size={18} color="#8E949B" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: "100%",
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(118,118,128,0.22)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(248,251,249,0.12)",
    paddingLeft: 11,
    paddingRight: 8,
    gap: 8,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#F8FBF9",
    fontSize: 15,
    lineHeight: 19,
    fontFamily: "Inter_500Medium",
    padding: 0,
  },
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonPressed: {
    opacity: 0.72,
  },
});
