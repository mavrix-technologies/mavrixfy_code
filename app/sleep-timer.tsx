import React, { useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import type { SleepTimerSelection } from "@/contexts/PlayerContext";

const SHEET_BACKGROUND = "#1E1E1E";
const HANDLE_COLOR = "#6D6D6D";

const TIMER_OPTIONS: { label: string; value: SleepTimerSelection }[] = [
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "End of stack", value: "end-of-stack" },
];

export default function SleepTimerScreen() {
  const insets = useSafeAreaInsets();
  const { sleepTimer, setSleepTimer, clearSleepTimer } = usePlayerActions();

  const haptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(style);
    }
  }, []);

  const handleSelect = useCallback((value: SleepTimerSelection) => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setSleepTimer(value);
    router.back();
  }, [haptic, setSleepTimer]);

  const handleClear = useCallback(() => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    clearSleepTimer();
    router.back();
  }, [clearSleepTimer, haptic]);

  return (
    <View style={styles.root}>
      <View style={styles.sheet}>
        <View style={styles.headerContent}>
          <View style={styles.grabber} />
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>Sleep Timer</Text>
              <Text style={styles.subtitle}>Stop playback automatically</Text>
            </View>
            {sleepTimer ? (
              <Pressable hitSlop={10} onPress={handleClear} style={styles.clearButton}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.options, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {TIMER_OPTIONS.map((option) => {
            const selected =
              sleepTimer?.mode === "end-of-stack"
                ? option.value === "end-of-stack"
                : sleepTimer?.label === option.label;
            return (
              <Pressable
                key={String(option.value)}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
                onPress={() => handleSelect(option.value)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {selected ? <Ionicons name="checkmark" size={21} color={Colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#000000",
  },
  sheet: {
    flex: 1,
    marginTop: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    backgroundColor: SHEET_BACKGROUND,
  },
  headerContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 8,
    marginBottom: 14,
    backgroundColor: HANDLE_COLOR,
  },
  titleRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 19,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: "#D4D4D4",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
  clearButton: {
    minHeight: 34,
    justifyContent: "center",
  },
  clearText: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  options: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  option: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.09)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionPressed: {
    opacity: 0.72,
  },
  optionSelected: {
    borderBottomColor: "rgba(37,201,231,0.32)",
  },
  optionText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
    fontFamily: "Inter_500Medium",
  },
  optionTextSelected: {
    color: Colors.primary,
    fontFamily: "Inter_700Bold",
  },
});
