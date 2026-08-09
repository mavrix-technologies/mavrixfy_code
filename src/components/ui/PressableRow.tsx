import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Typography, Spacing, Radius } from "./tokens";

export interface PressableRowProps {
  label: string;
  sublabel?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  leftIconColor?: string;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export function PressableRow({
  label,
  sublabel,
  leftIcon,
  leftIconColor = Colors.text,
  rightElement,
  showChevron = true,
  onPress,
  style,
  disabled = false,
}: PressableRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.container,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {leftIcon ? (
        <View style={styles.iconContainer}>
          <Ionicons name={leftIcon} size={20} color={leftIconColor} />
        </View>
      ) : null}

      <View style={styles.textContainer}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.sublabel} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      {rightElement ? (
        <View style={styles.rightSlot}>{rightElement}</View>
      ) : showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginVertical: Spacing.xs,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: Colors.surfaceLight,
  },
  disabled: {
    opacity: 0.5,
  },
  iconContainer: {
    marginRight: Spacing.md,
    width: 24,
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  label: {
    ...Typography.body,
  },
  sublabel: {
    ...Typography.caption,
    marginTop: 2,
  },
  rightSlot: {
    marginLeft: Spacing.sm,
  },
});
