import { safeGoBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import React, { memo } from "react";
import {
  Insets,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { CircularBackButton } from "./CircularNavButton";

export interface StandardTopHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: keyof typeof Ionicons.glyphMap;
  backAccessibilityLabel?: string;
  showBack?: boolean;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  topInset?: number;
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle>;
}

export const StandardTopHeader = memo(function StandardTopHeader({
  title,
  subtitle,
  onBack = safeGoBack,
  backIcon = "chevron-back",
  backAccessibilityLabel = "Go back",
  showBack = true,
  leftElement,
  rightElement,
  topInset = 0,
  style,
}: StandardTopHeaderProps) {
  return (
    <View style={[styles.headerContainer, { paddingTop: topInset }, style]}>
      <View style={styles.headerBar}>
        {/* Left Slot */}
        <View style={styles.leftSlot}>
          {leftElement ? (
            leftElement
          ) : showBack ? (
            <CircularBackButton
              icon={backIcon}
              onPress={onBack}
              accessibilityLabel={backAccessibilityLabel}
            />
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        {/* Center Title Slot */}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Right Slot */}
        <View style={styles.rightSlot}>
          {rightElement || <View style={styles.placeholder} />}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  headerContainer: {
    width: "100%",
    backgroundColor: "transparent",
    zIndex: 50,
  },
  headerBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  leftSlot: {
    width: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
    textAlign: "center",
  },
  rightSlot: {
    width: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  placeholder: {
    width: 38,
    height: 38,
  },
});
