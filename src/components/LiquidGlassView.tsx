import { BlurView,type BlurTint } from "expo-blur";
import { GlassView,isLiquidGlassAvailable,type GlassStyle } from "expo-glass-effect";
import React,{ memo } from "react";
import {
Platform,
StyleSheet,
View,
type StyleProp,
type ViewProps,
type ViewStyle,
} from "react-native";

export interface LiquidGlassViewProps extends ViewProps {
  intensity?: number;
  tint?: BlurTint;
  glassStyle?: GlassStyle;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const LiquidGlassView = memo(function LiquidGlassView({
  intensity = 55,
  tint = "systemMaterialDark",
  glassStyle = "regular",
  borderRadius = 14,
  style,
  children,
  ...props
}: LiquidGlassViewProps) {
  const hasLiquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

  return (
    <View
      style={[
        styles.container,
        { borderRadius },
        styles.glassBorder,
        style,
      ]}
      {...props}
    >
      {hasLiquidGlass ? (
        <GlassView
          pointerEvents="none"
          glassEffectStyle={glassStyle}
          colorScheme="dark"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : (
        <BlurView
          pointerEvents="none"
          intensity={intensity}
          tint={tint}
          blurMethod={Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.glassTintOverlay,
          { borderRadius },
        ]}
      />
      {children}
    </View>
  );
});

export default LiquidGlassView;

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    position: "relative",
  },
  glassBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  glassTintOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
});
