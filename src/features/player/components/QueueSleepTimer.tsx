import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import {
  formatSleepTimerDuration,
  isValidSleepTimerDuration,
  MAX_SLEEP_TIMER_MINUTES,
} from "@/services/audio/sleepTimerDuration";
import type { SleepTimerSelection } from "@/types/playbackTypes";

const HOURS = Array.from({ length: 24 }, (_, value) => value);
const MINUTES = Array.from({ length: 60 }, (_, value) => value);
const EMBEDDED_PRESETS = [15, 30, 45, 60, 90];

/** A page inside the queue sheet; it never opens another modal or route. */
export default function QueueSleepTimer({ onBack, embedded = false }: { onBack: () => void; embedded?: boolean }) {
  const { sleepTimer, setSleepTimer, clearSleepTimer } = usePlayerActions();
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState(() => sleepTimer?.endsAt
    ? Math.min(MAX_SLEEP_TIMER_MINUTES, Math.max(1, Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)))
    : 30);
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  const valid = isValidSleepTimerDuration(duration);

  const applyTimer = (selection: SleepTimerSelection) => {
    setSleepTimer(selection);
    onBack();
  };

  return (
    <View style={[styles.page, embedded ? styles.embeddedPage : styles.modalPage]}>
      {!embedded && <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to queue">
          <Ionicons name="chevron-back" size={23} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Sleep timer</Text>
      </View>}
      <ScrollView contentContainerStyle={[styles.content, embedded ? styles.embeddedContent : { paddingBottom: Math.max(insets.bottom, 16) }]}
        showsVerticalScrollIndicator={false}>
        {embedded ? (
          <View style={styles.embeddedTimerSection}>
            <Text style={styles.subtitle}>Pause playback after</Text>
            <View style={styles.stepperCard}>
              <Pressable
                onPress={() => setDuration(previous => Math.max(1, previous <= 5 ? previous - 1 : previous - 5))}
                style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Decrease timer duration"
              >
                <Ionicons name="remove" size={20} color="#FFFFFF" />
              </Pressable>

              <View style={styles.stepperDisplay}>
                <Text style={styles.stepperValue}>{formatSleepTimerDuration(duration)}</Text>
                <Text style={styles.stepperSubtext}>{duration >= 60 ? `${duration} total minutes` : "custom duration"}</Text>
              </View>

              <Pressable
                onPress={() => setDuration(previous => Math.min(MAX_SLEEP_TIMER_MINUTES, previous + 5))}
                style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Increase timer duration"
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.presetRow}>
              {EMBEDDED_PRESETS.map(mins => {
                const active = duration === mins;
                return (
                  <Pressable
                    key={mins}
                    onPress={() => setDuration(mins)}
                    style={({ pressed }) => [
                      styles.presetChip,
                      active && styles.presetChipActive,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${mins} minutes preset`}
                  >
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>
                      {mins < 60 ? `${mins}m` : mins === 60 ? "1h" : `${mins / 60}h`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>Pause playback after</Text>
            <View style={styles.pickers}>
              <View style={styles.column}>
                <Text style={styles.unit}>Hours</Text>
                <Picker selectedValue={hours} onValueChange={(value: number) => setDuration(previous => value * 60 + previous % 60)}
                  style={styles.picker} itemStyle={styles.pickerItem} mode="dropdown"
                  dropdownIconColor="#FFFFFF" accessibilityLabel="Timer hours">
                  {HOURS.map(value => <Picker.Item key={value} label={String(value)} value={value} color="#FFFFFF" style={styles.androidItem} />)}
                </Picker>
              </View>
              <View style={styles.column}>
                <Text style={styles.unit}>Minutes</Text>
                <Picker selectedValue={minutes} onValueChange={(value: number) => setDuration(previous => Math.floor(previous / 60) * 60 + value)}
                  style={styles.picker} itemStyle={styles.pickerItem} mode="dropdown"
                  dropdownIconColor="#FFFFFF" accessibilityLabel="Timer minutes">
                  {MINUTES.map(value => <Picker.Item key={value} label={String(value).padStart(2, "0")} value={value} color="#FFFFFF" style={styles.androidItem} />)}
                </Picker>
              </View>
            </View>
          </>
        )}
        <Pressable onPress={() => applyTimer(duration)} disabled={!valid}
          style={({ pressed }) => [styles.start, embedded && styles.embeddedStart, !valid && styles.disabled, pressed && styles.pressed]}
          accessibilityRole="button" accessibilityState={{ disabled: !valid }}>
          <Text style={styles.startText}>{valid ? `Start · ${formatSleepTimerDuration(duration)}` : "Choose a duration"}</Text>
        </Pressable>
        <Pressable onPress={() => applyTimer("end-of-stack")}
          style={({ pressed }) => [styles.option, embedded && styles.embeddedOption, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="list-outline" size={22} color="#FFFFFF" />
          <Text style={styles.optionText}>End of queue</Text>
          {sleepTimer?.mode === "end-of-stack" && <Ionicons name="checkmark" size={22} color={Colors.primary} />}
        </Pressable>
        {sleepTimer && (
          <View style={styles.activeTimer}>
            <Text style={styles.status}>Active: {sleepTimer.label}</Text>
            <Pressable onPress={() => { clearSleepTimer(); onBack(); }} style={styles.turnOff}
              accessibilityRole="button" accessibilityLabel="Turn off sleep timer">
              <Text style={styles.turnOffText}>Turn off</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  modalPage: { ...StyleSheet.absoluteFillObject, backgroundColor: "#1A1A1A" },
  embeddedPage: { backgroundColor: "transparent", minHeight: 0 },
  embeddedContent: { paddingHorizontal: 0, paddingBottom: 16, gap: 10 },
  embeddedTimerSection: { gap: 8 },
  stepperCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#222222",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDisplay: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  stepperValue: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  stepperSubtext: {
    color: "#A0A0A0",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
  },
  presetChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: "#222222",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  presetChipActive: {
    backgroundColor: "rgba(29, 185, 84, 0.2)",
    borderColor: Colors.primary,
  },
  presetText: {
    color: "#D0D0D0",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  presetTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_700Bold",
  },
  header: { paddingHorizontal: 18, paddingBottom: 24 },
  back: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", minHeight: 44, gap: 4, marginLeft: -6 },
  backText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_500Medium" },
  title: { color: "#FFFFFF", fontSize: 25, lineHeight: 32, fontFamily: "Inter_700Bold", marginTop: 8 },
  content: { paddingHorizontal: 24, gap: 24 },
  subtitle: { color: "#A0A0A0", fontSize: 14, fontFamily: "Inter_400Regular" },
  pickers: { flexDirection: "row", gap: 12, borderRadius: 18, padding: 12, backgroundColor: "#252525" },
  column: { flex: 1, minWidth: 0 },
  unit: { color: "#A0A0A0", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", marginBottom: 4 },
  picker: { width: "100%", height: Platform.OS === "ios" ? 216 : 56, color: "#FFFFFF" },
  pickerItem: { color: "#FFFFFF", fontSize: 24 },
  androidItem: { color: "#FFFFFF", backgroundColor: "#252525", fontSize: 18 },
  start: { minHeight: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, backgroundColor: Colors.primary },
  embeddedStart: { minHeight: 44, borderRadius: 22 },
  startText: { color: "#000000", fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  option: { flexDirection: "row", alignItems: "center", minHeight: 54, gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#393939" },
  embeddedOption: { minHeight: 44, paddingVertical: 8 },
  optionText: { flex: 1, color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_500Medium" },
  activeTimer: { flexDirection: "row", alignItems: "center", gap: 12 },
  status: { flex: 1, color: "#A0A0A0", fontSize: 13, fontFamily: "Inter_400Regular" },
  turnOff: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  turnOffText: { color: Colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
