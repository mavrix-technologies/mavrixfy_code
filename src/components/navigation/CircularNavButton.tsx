import { triggerImpact } from "@/lib/haptics";
import { safeGoBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import {
  Insets,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

export interface CircularNavButtonProps {
  icon?: keyof typeof Ionicons.glyphMap;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  iconStyle?: StyleProp<TextStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: "button";
  hitSlop?: Insets | number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  triggerHaptics?: boolean;
}

export const CircularNavButton = memo(function CircularNavButton({
  icon = "chevron-back",
  size = 38,
  iconSize = 20,
  iconColor = "#FFFFFF",
  iconStyle,
  onPress,
  accessibilityLabel,
  accessibilityRole = "button",
  hitSlop = 12,
  disabled = false,
  style,
  children,
  triggerHaptics: enableHaptics = true,
}: CircularNavButtonProps) {
  const handlePress = useCallback(() => {
    if (disabled) return;
    if (enableHaptics) {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }, [disabled, enableHaptics, onPress]);

  const radius = size / 2;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.circularBtn,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        style,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      {children ? (
        children
      ) : (
        <Ionicons
          name={icon}
          size={iconSize}
          color={iconColor}
          style={iconStyle}
        />
      )}
    </Pressable>
  );
});

export interface CircularBackButtonProps extends Omit<CircularNavButtonProps, "icon"> {
  icon?: keyof typeof Ionicons.glyphMap;
}

export const CircularBackButton = memo(function CircularBackButton({
  onPress = safeGoBack,
  accessibilityLabel = "Go back",
  icon = "chevron-back",
  iconSize = 20,
  ...rest
}: CircularBackButtonProps) {
  return (
    <CircularNavButton
      icon={icon}
      iconSize={iconSize}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    />
  );
});

export interface CircularShareButtonProps extends Omit<CircularNavButtonProps, "icon"> {
  icon?: keyof typeof Ionicons.glyphMap;
}

export const CircularShareButton = memo(function CircularShareButton({
  onPress,
  accessibilityLabel = "Share",
  icon = "share-outline",
  iconSize = 18,
  ...rest
}: CircularShareButtonProps) {
  return (
    <CircularNavButton
      icon={icon}
      iconSize={iconSize}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    />
  );
});

export interface CapsuleNavGroupProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const CapsuleNavGroup = memo(function CapsuleNavGroup({
  children,
  style,
}: CapsuleNavGroupProps) {
  return <View style={[styles.capsuleGroup, style]}>{children}</View>;
});

export interface CapsuleNavButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  iconColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

export const CapsuleNavButton = memo(function CapsuleNavButton({
  icon,
  iconSize = 18,
  iconColor = "#FFFFFF",
  onPress,
  accessibilityLabel,
  disabled = false,
}: CapsuleNavButtonProps) {
  const handlePress = useCallback(() => {
    if (disabled) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  }, [disabled, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.capsuleBtn,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
});

export const CapsuleDivider = memo(function CapsuleDivider() {
  return <View style={styles.capsuleDivider} />;
});

const styles = StyleSheet.create({
  circularBtn: {
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
  capsuleGroup: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 2,
  },
  capsuleBtn: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  capsuleDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
});
