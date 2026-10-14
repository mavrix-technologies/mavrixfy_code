import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { STANDBY_CONTROL_SIZE } from "./standByLayout";

export type StandByPanel = "queue" | "lyrics" | "timer";

export interface StandByActionsProps {
  primaryColor: string;
  secondaryColor: string;
  compact?: boolean;
  timerLabel?: string;
  onSelectPanel: (panel: StandByPanel) => void;
  onTouchActivity: () => void;
}

/** All styles share the same actions and geometry. Queue and lyrics stay inline. */
export const StandByActions = memo(function StandByActions(props: StandByActionsProps) {
  const run = (action: () => void) => { props.onTouchActivity(); action(); };
  return (
    <View style={styles.actions}>
      <Pressable onPress={() => run(() => props.onSelectPanel("queue"))} style={styles.button} accessibilityRole="button" accessibilityLabel="Show playback queue">
        <View style={[styles.iconSlot, props.compact && styles.compactIconSlot]}><MaterialIcons name="queue-music" size={20} color={props.primaryColor} /></View>
        <Text numberOfLines={1} style={[styles.label, { color: props.secondaryColor }]}>Queue</Text>
      </Pressable>
      <Pressable onPress={() => run(() => props.onSelectPanel("timer"))} style={styles.button} accessibilityRole="button" accessibilityLabel={props.timerLabel ? `Sleep timer: ${props.timerLabel}` : "Sleep timer"}>
        <View style={[styles.iconSlot, props.compact && styles.compactIconSlot]}><MaterialIcons name="timer" size={20} color={props.primaryColor} /></View>
        <Text numberOfLines={1} style={[styles.label, { color: props.secondaryColor }]}>{props.timerLabel ?? "Timer"}</Text>
      </Pressable>
      <Pressable onPress={() => run(() => props.onSelectPanel("lyrics"))} style={styles.button} accessibilityRole="button" accessibilityLabel="Show lyrics">
        <View style={[styles.iconSlot, props.compact && styles.compactIconSlot]}><MaterialIcons name="lyrics" size={20} color={props.primaryColor} /></View>
        <Text numberOfLines={1} style={[styles.label, { color: props.secondaryColor }]}>Lyrics</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  button: { width: STANDBY_CONTROL_SIZE, minHeight: STANDBY_CONTROL_SIZE, alignItems: "center" },
  iconSlot: { width: STANDBY_CONTROL_SIZE, height: STANDBY_CONTROL_SIZE, alignItems: "center", justifyContent: "center" },
  compactIconSlot: { height: 32 },
  label: { textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium" },
});
