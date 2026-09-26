import React, { forwardRef, memo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

import LiquidGlassView from "./LiquidGlassView";

export type SearchHeaderFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  onClear: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  theme?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
};

export const SearchHeaderField = memo(
  forwardRef<TextInput, SearchHeaderFieldProps>(function SearchHeaderField(
    {
      value,
      onChangeText,
      onSubmit,
      onClear,
      onFocus,
      onBlur,
      placeholder = "Search songs, albums, artists, playlists",
      autoFocus = false,
      theme = "dark",
      style,
    },
    ref
  ) {
    const isDark = theme === "dark";

    return (
      <LiquidGlassView
        borderRadius={isDark ? 19 : 10}
        style={[styles.field, isDark ? styles.fieldDark : styles.fieldLight, style]}
      >
        <Ionicons
          name="search"
          size={17}
          color={isDark ? "rgba(255, 255, 255, 0.65)" : "#8E949B"}
          style={styles.searchIcon}
        />
        <TextInput
          ref={ref}
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? "rgba(255, 255, 255, 0.45)" : "#8E949B"}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={onFocus}
          onBlur={onBlur}
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
              color={isDark ? "rgba(255, 255, 255, 0.55)" : "#8E949B"}
            />
          </Pressable>
        ) : null}
      </LiquidGlassView>
    );
  })
);

export default SearchHeaderField;

const styles = StyleSheet.create({
  field: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  fieldLight: {
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    gap: 8,
  },
  fieldDark: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: {
    marginLeft: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
  },
  inputLight: {
    color: "#0F172A",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  inputDark: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonPressed: {
    opacity: 0.72,
  },
});
