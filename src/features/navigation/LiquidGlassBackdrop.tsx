import React, { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { IS_IOS, IS_WEB } from "@/constants/platform";

export type LiquidGlassBackdropProps = {
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  intensity?: number;
  children?: React.ReactNode;
  showSpecularBorder?: boolean;
};

/**
 * LiquidGlassBackdrop
 *
 * Renders native platform Liquid Glass on iOS (via Apple's UIGlassEffect / SwiftUI primitives)
 * and hardware-accelerated BlurView on Android and Web, with a translucent dark glass tint
 * and subtle specular rim.
 */
export const LiquidGlassBackdrop = React.memo(function LiquidGlassBackdrop({
  style,
  tintColor = "rgba(14, 18, 24, 0.50)",
  intensity = 70,
  children,
  showSpecularBorder = true,
}: LiquidGlassBackdropProps) {
  const supportsNativeGlass = useMemo(() => {
    if (!IS_IOS) return false;
    try {
      return typeof isGlassEffectAPIAvailable === "function" && isGlassEffectAPIAvailable();
    } catch {
      return false;
    }
  }, []);

  const blurTint = IS_IOS ? "systemChromeMaterialDark" : "dark";

  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      {supportsNativeGlass ? (
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme="dark"
        />
      ) : (
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={intensity}
          tint={blurTint}
        />
      )}

      {/* Luminous frosted glass ambient sheen */}
      <View style={styles.ambientSheen} />

      {/* Translucent glass tint layer to ensure contrast over bright underlying content */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: tintColor },
        ]}
      />

      {/* Subtle specular rim highlight matching iOS Liquid Glass edge refraction */}
      {showSpecularBorder && <View style={styles.specularBorder} />}

      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  ambientSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  specularBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
});
