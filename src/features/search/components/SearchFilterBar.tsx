import { memo, useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import type { ResultFilter } from "@/lib/searchRepository";
import { RESULT_FILTERS } from "../types";
import { getSearchTabIndex } from "./searchTabPagerUtils";

const BAR_PADDING = 4;
const TAB_GAP = 4;

export const SearchFilterBar = memo(function SearchFilterBar({
  activeKey,
  onSelect,
  scrollProgress,
}: {
  activeKey: ResultFilter;
  onSelect: (filter: ResultFilter) => void;
  scrollProgress?: SharedValue<number>;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = getSearchTabIndex(activeKey);
  const fallbackProgress = useSharedValue(activeIndex);

  useEffect(() => {
    if (!scrollProgress) {
      fallbackProgress.value = withTiming(activeIndex, {
        duration: 210,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [activeIndex, fallbackProgress, scrollProgress]);

  const progress = scrollProgress ?? fallbackProgress;
  const tabCount = RESULT_FILTERS.length;
  const innerWidth = Math.max(0, barWidth - BAR_PADDING * 2);
  const tabWidth = innerWidth > 0 ? (innerWidth - TAB_GAP * (tabCount - 1)) / tabCount : 0;

  const indicatorStyle = useAnimatedStyle(() => {
    if (tabWidth <= 0) {
      return { opacity: 0, width: 0 };
    }
    const clamped = Math.max(0, Math.min(tabCount - 1, progress.value));
    return {
      opacity: 1,
      width: tabWidth,
      transform: [{ translateX: clamped * (tabWidth + TAB_GAP) }],
    };
  }, [progress, tabCount, tabWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (Math.abs(nextWidth - barWidth) > 0.5) {
      setBarWidth(nextWidth);
    }
  };

  return (
    <View
      style={styles.bar}
      onLayout={handleLayout}
      accessibilityRole="tablist"
      accessibilityLabel="Search result categories"
    >
      <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
      {RESULT_FILTERS.map((option) => {
        const selected = option.key === activeKey;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}`}
            accessibilityHint={`Show ${option.label.toLowerCase()} results. Swipe left or right on results to switch tabs.`}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            onPress={() => onSelect(option.key)}
            style={(state) => {
              const hovered = "hovered" in state && Boolean((state as { hovered?: boolean }).hovered);
              return [
                styles.tab,
                tabWidth <= 0 && selected && styles.selectedFallback,
                !selected && (state.pressed || hovered) && styles.highlighted,
              ];
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.35}
              style={[styles.label, selected && styles.selectedLabel]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: "relative",
    flexDirection: "row",
    height: 52,
    padding: BAR_PADDING,
    gap: TAB_GAP,
    borderRadius: 26,
    backgroundColor: Colors.surface,
  },
  indicator: {
    position: "absolute",
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    left: BAR_PADDING,
    borderRadius: 22,
    backgroundColor: "#26e19a",
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedFallback: { backgroundColor: "#26e19a" },
  highlighted: { backgroundColor: "rgba(38,225,154,0.16)" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.subtext },
  selectedLabel: { fontFamily: "Inter_700Bold", color: "#080B11" },
});
