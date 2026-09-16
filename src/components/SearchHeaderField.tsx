import React, { memo } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type SearchHeaderFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  onClear: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  theme?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
};

export const SearchHeaderField = memo(function SearchHeaderField({
  value,
  onChangeText,
  onSubmit,
  onClear,
  placeholder = "Search songs, albums, artists, playlists",
  autoFocus = false,
  theme = "light",
  style,
}: SearchHeaderFieldProps) {
  const isDark = theme === "dark";

  return (
    <View style={[styles.field, isDark ? styles.fieldDark : styles.fieldLight, style]}>
      <Ionicons
        name="search"
        size={16}
        color={isDark ? "rgba(255, 255, 255, 0.45)" : "#8E949B"}
      />
      <TextInput
        style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "rgba(255, 255, 255, 0.35)" : "#8E949B"}
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
        selectionColor={Colors.primary}
      />
      {Platform.OS !== "ios" && value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={onClear}
          hitSlop={8}
          style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
        >
          <Ionicons
            name="close-circle"
            size={18}
            color={isDark ? "rgba(255, 255, 255, 0.45)" : "#8E949B"}
          />
        </Pressable>
      ) : null}
    </View>
  );
});

export default SearchHeaderField;

const styles = StyleSheet.create({
  field: {
    width: "100%",
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 10,
    gap: 10,
    overflow: "hidden",
  },
  fieldLight: {
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingLeft: 12,
    paddingRight: 8,
    gap: 8,
  },
  fieldDark: {
    height: 44,
    borderRadius: 14,
    backgroundColor: "#16181F",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  inputLight: {
    color: "#0F172A",
    fontSize: 15,
    lineHeight: 19,
    fontFamily: "Inter_500Medium",
  },
  inputDark: {
    color: "#FFFFFF",
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
