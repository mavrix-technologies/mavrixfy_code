import React from "react";
import { Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";

export interface ActionPlayButtonProps {
  isPlaying: boolean;
  onPress: () => void;
  size?: number;
  color?: string;
  iconColor?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const ActionPlayButton: React.FC<ActionPlayButtonProps> = ({
  isPlaying,
  onPress,
  size = 52,
  color = "#26E19A",
  iconColor = "#06241A",
  disabled = false,
  accessibilityLabel,
  style,
}) => {
  const iconSize = Math.round(size * 0.46);
  const handlePress = () => {
    if (disabled) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (isPlaying ? "Pause" : "Play")}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Ionicons
        name={isPlaying ? "pause" : "play"}
        size={iconSize}
        color={iconColor}
        style={!isPlaying ? { marginLeft: Math.max(1, Math.round(size * 0.04)) } : undefined}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#26E19A",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
  },
  buttonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});

export default ActionPlayButton;
