import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable,StyleProp,StyleSheet,View,ViewStyle } from "react-native";

export interface ActionCircleButtonProps {
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  isActive?: boolean;
  activeColor?: string;
  showActiveDot?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export const ActionCircleButton: React.FC<ActionCircleButtonProps> = ({
  iconName,
  onPress,
  size = 44,
  iconSize,
  iconColor = "#FFFFFF",
  isActive = false,
  activeColor = Colors.primary,
  showActiveDot = false,
  disabled = false,
  accessibilityLabel,
  style,
}) => {
  const resolvedIconSize = iconSize || Math.round(size * 0.45);
  const resolvedIconColor = isActive ? activeColor : iconColor;

  const handlePress = () => {
    if (disabled) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Ionicons
        name={iconName}
        size={resolvedIconSize}
        color={resolvedIconColor}
      />
      {isActive && showActiveDot && <View style={[styles.activeDot, { backgroundColor: activeColor }]} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  activeDot: {
    position: "absolute",
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default ActionCircleButton;
