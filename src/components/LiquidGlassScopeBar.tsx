import React, { memo, useCallback } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import LiquidGlassView from "@/components/LiquidGlassView";

export interface LiquidGlassScopeBarOption<T extends string = string> {
  key: T;
  label: string;
}

export interface LiquidGlassScopeBarProps<T extends string> {
  options: readonly LiquidGlassScopeBarOption<T>[] | LiquidGlassScopeBarOption<T>[];
  activeKey: T;
  onSelect: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function LiquidGlassScopeBar<T extends string>({
  options,
  activeKey,
  onSelect,
  style,
}: LiquidGlassScopeBarProps<T>) {
  const handlePress = useCallback(
    (key: T) => {
      void triggerImpact(ImpactFeedbackStyle.Light);
      onSelect(key);
    },
    [onSelect]
  );

  const renderItem = useCallback(
    ({ item: option }: { item: LiquidGlassScopeBarOption<T> }) => {
      const isActive = option.key === activeKey;
      const isYouTube = option.key === "youtube";
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={`Filter by ${option.label}`}
          onPress={() => handlePress(option.key)}
          style={({ pressed }) => [
            styles.segment,
            isActive && styles.segmentActive,
            pressed && styles.segmentPressed,
          ]}
        >
          {isYouTube && (
            <Ionicons
              name="logo-youtube"
              size={13}
              color={isActive ? "#080B11" : "#FF0033"}
              style={styles.segmentIcon}
            />
          )}
          <Text
            style={[
              styles.segmentText,
              isActive ? styles.segmentTextActive : styles.segmentTextInactive,
            ]}
            numberOfLines={1}
          >
            {option.label}
          </Text>
        </Pressable>
      );
    },
    [activeKey, handlePress]
  );

  return (
    <View style={[styles.outerWrapper, style]}>
      <LiquidGlassView
        intensity={55}
        tint="systemMaterialDark"
        borderRadius={18}
        style={styles.segmentedContainer}
      >
        <FlatList
          data={options as LiquidGlassScopeBarOption<T>[]}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContainer}
        />
      </LiquidGlassView>
    </View>
  );
}

export default memo(LiquidGlassScopeBar) as typeof LiquidGlassScopeBar;

const styles = StyleSheet.create({
  outerWrapper: {
    width: "100%",
  },
  segmentedContainer: {
    width: "100%",
    height: 36,
    borderRadius: 18,
    padding: 3,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  scrollContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: "100%",
  },
  segment: {
    height: "100%",
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  segmentActive: {
    backgroundColor: "#26e19a",
    boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.25)",
  },
  segmentPressed: {
    opacity: 0.8,
  },
  segmentIcon: {
    marginRight: 5,
  },
  segmentText: {
    fontSize: 13,
    letterSpacing: -0.1,
  },
  segmentTextInactive: {
    color: "rgba(255, 255, 255, 0.75)",
    fontFamily: "Inter_500Medium",
  },
  segmentTextActive: {
    color: "#080B11",
    fontFamily: "Inter_700Bold",
  },
});
