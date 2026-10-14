import Ionicons from "@expo/vector-icons/Ionicons";
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

/** A page inside the queue sheet; it never opens another modal or route. */
export default function QueueSleepTimer({ onBack, embedded = false, primaryColor = "#FFFFFF", secondaryColor = "#A0A0A0" }: {
  onBack: () => void;
  embedded?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const { sleepTimer, setSleepTimer, clearSleepTimer } = usePlayerActions();
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState(() => sleepTimer?.endsAt
    ? Math.min(MAX_SLEEP_TIMER_MINUTES, Math.max(1, Math.ceil((sleepTimer.endsAt - Date.now()) / 60000)))
    : 30);
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  const valid = isValidSleepTimerDuration(duration);
  const cancelActiveTimer = embedded && Boolean(sleepTimer);
  const actionDisabled = !cancelActiveTimer && !valid;
  const actionLabel = cancelActiveTimer ? "Cancel timer" : !valid ? "Choose a duration" : embedded ? "Start timer" : `Start · ${formatSleepTimerDuration(duration)}`;

  const applyTimer = (selection: SleepTimerSelection) => {
    setSleepTimer(selection);
    onBack();
  };

  const timerFooter = (
    <View style={embedded && styles.timerFooter}>
          <Pressable onPress={() => applyTimer("end-of-stack")}
            style={({ pressed }) => [styles.option, embedded && styles.embeddedOption, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="list-outline" size={22} color={embedded ? primaryColor : "#FFFFFF"} />
            <Text style={[styles.optionText, embedded && { color: primaryColor }]}>End of queue</Text>
            {sleepTimer?.mode === "end-of-stack" && <Ionicons name="checkmark" size={22} color={embedded ? primaryColor : Colors.primary} />}
          </Pressable>
          <Pressable onPress={() => {
            if (cancelActiveTimer) { clearSleepTimer(); onBack(); }
            else applyTimer(duration);
          }} disabled={actionDisabled}
            style={({ pressed }) => [styles.start, embedded && [styles.embeddedStart, { backgroundColor: primaryColor }], actionDisabled && styles.disabled, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityState={{ disabled: actionDisabled }}
            accessibilityLabel={cancelActiveTimer ? "Turn off sleep timer" : valid ? `Start sleep timer for ${formatSleepTimerDuration(duration)}` : "Choose a duration"}>
            <Text style={styles.startText}>{actionLabel}</Text>
          </Pressable>
        </View>
  );

  return (
    <View style={[styles.page, embedded ? styles.embeddedPage : styles.modalPage]}>
      {!embedded && <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to queue">
          <Ionicons name="chevron-back" size={23} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Sleep timer</Text>
      </View>}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, embedded ? styles.embeddedContent : { paddingBottom: Math.max(insets.bottom, 16) }]}
        contentInsetAdjustmentBehavior={embedded ? "never" : "automatic"}
        bounces={!embedded} showsVerticalScrollIndicator={false}>
        {!embedded && <Text style={styles.subtitle}>Pause playback after</Text>}
        <View style={embedded && styles.pickerArea}>
          <View style={[styles.pickers, embedded && styles.embeddedPickers]}>
            <View style={styles.column}>
              <Text style={[styles.unit, embedded && { color: secondaryColor }]}>Hours</Text>
              <Picker selectedValue={hours} onValueChange={(value: number) => setDuration(previous => value * 60 + previous % 60)}
                style={[styles.picker, embedded && [styles.embeddedPicker, { color: primaryColor }]]} itemStyle={[styles.pickerItem, embedded && [styles.embeddedPickerItem, { color: primaryColor }]]} mode={embedded ? "dialog" : "dropdown"}
                dropdownIconColor={embedded ? primaryColor : "#FFFFFF"} accessibilityLabel="Timer hours">
                {HOURS.map(value => <Picker.Item key={value} label={String(value)} value={value} color={embedded ? primaryColor : "#FFFFFF"} style={embedded ? styles.embeddedAndroidItem : styles.androidItem} />)}
              </Picker>
            </View>
            <View style={styles.column}>
              <Text style={[styles.unit, embedded && { color: secondaryColor }]}>Minutes</Text>
              <Picker selectedValue={minutes} onValueChange={(value: number) => setDuration(previous => Math.floor(previous / 60) * 60 + value)}
                style={[styles.picker, embedded && [styles.embeddedPicker, { color: primaryColor }]]} itemStyle={[styles.pickerItem, embedded && [styles.embeddedPickerItem, { color: primaryColor }]]} mode={embedded ? "dialog" : "dropdown"}
                dropdownIconColor={embedded ? primaryColor : "#FFFFFF"} accessibilityLabel="Timer minutes">
                {MINUTES.map(value => <Picker.Item key={value} label={String(value).padStart(2, "0")} value={value} color={embedded ? primaryColor : "#FFFFFF"} style={embedded ? styles.embeddedAndroidItem : styles.androidItem} />)}
              </Picker>
            </View>
          </View>
        </View>
        {sleepTimer && (
          <View style={styles.activeTimer}>
            <Text style={[styles.status, embedded && { color: secondaryColor }]}>Active: {sleepTimer.label}</Text>
            {!embedded && <Pressable onPress={() => { clearSleepTimer(); onBack(); }} style={styles.turnOff}
              accessibilityRole="button" accessibilityLabel="Turn off sleep timer">
              <Text style={styles.turnOffText}>Turn off</Text>
            </Pressable>}
          </View>
        )}
        {!embedded && timerFooter}
      </ScrollView>
      {embedded && timerFooter}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flex: 1, minHeight: 0 },
  modalPage: { ...StyleSheet.absoluteFillObject, backgroundColor: "#1A1A1A" },
  embeddedPage: { backgroundColor: "transparent", minHeight: 0, paddingBottom: 12 },
  embeddedContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 0, paddingBottom: 12, gap: 12 },
  pickerArea: { justifyContent: "center", paddingVertical: 8 },
  embeddedPickers: { borderRadius: 0, backgroundColor: "transparent", padding: 0 },
  embeddedPicker: { height: Platform.OS === "ios" ? 160 : 56 },
  embeddedPickerItem: { fontSize: 24 },
  embeddedAndroidItem: { backgroundColor: "transparent", fontSize: 18 },
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
  timerFooter: { flexShrink: 0, paddingTop: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  embeddedStart: { minHeight: 44, maxWidth: "100%", flexShrink: 1, borderRadius: 22, paddingHorizontal: 16, marginLeft: "auto" },
  startText: { color: "#000000", fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  option: { flexDirection: "row", alignItems: "center", minHeight: 54, gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#393939" },
  embeddedOption: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0, minHeight: 44, gap: 8, paddingVertical: 8, borderBottomWidth: 0 },
  optionText: { flex: 1, color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_500Medium" },
  activeTimer: { flexDirection: "row", alignItems: "center", gap: 12 },
  status: { flex: 1, color: "#A0A0A0", fontSize: 13, fontFamily: "Inter_400Regular" },
  turnOff: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  turnOffText: { color: Colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
