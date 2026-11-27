import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { MUSIC_LANGUAGE_OPTIONS, normalizeMusicLanguages } from "@/lib/musicLanguages";

interface MusicLanguagePickerProps {
  selected: readonly string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
  title?: string;
  subtitle?: string;
}

export const MusicLanguagePicker = memo(function MusicLanguagePicker({
  selected,
  onChange,
  compact = false,
  title = "Music Languages (India)",
  subtitle = "Used for Search results, suggestions, and Home recommendations",
}: MusicLanguagePickerProps) {
  const normalizedSelected = normalizeMusicLanguages(selected);

  const handleToggle = useCallback(
    (id: string) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      const exists = normalizedSelected.includes(id as (typeof normalizedSelected)[number]);
      if (exists) {
        if (normalizedSelected.length <= 1) return;
        onChange(normalizedSelected.filter((item) => item !== id));
      } else {
        onChange([...normalizedSelected, id]);
      }
    },
    [normalizedSelected, onChange]
  );

  return (
    <View style={styles.wrapper} accessibilityLabel={title}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <View style={styles.indiaBadge}>
          <Text style={styles.indiaBadgeText}>IN</Text>
        </View>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.chipGrid}>
        {MUSIC_LANGUAGE_OPTIONS.map((option) => {
          const checked = normalizedSelected.includes(option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => handleToggle(option.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${option.label} language`}
              accessibilityHint={
                checked
                  ? "Selected. Double tap to remove unless it is your only language."
                  : "Double tap to include in results and recommendations."
              }
              style={({ pressed }) => [
                styles.chip,
                checked && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              {checked ? (
                <Ionicons name="checkmark" size={14} color="#080B11" />
              ) : null}
              <Text
                style={[styles.chipLabel, checked && styles.chipLabelSelected]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  titleCompact: {
    fontSize: 14,
  },
  indiaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(38, 225, 154, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(38, 225, 154, 0.35)",
  },
  indiaBadgeText: {
    color: "#26E19A",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipSelected: {
    backgroundColor: "#26E19A",
    borderColor: "#26E19A",
  },
  chipPressed: {
    opacity: 0.78,
  },
  chipLabel: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  chipLabelSelected: {
    color: "#080B11",
    fontFamily: "Inter_700Bold",
  },
});
