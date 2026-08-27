import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function SegmentPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentTrack}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.segmentTab, selected && styles.segmentTabSelected]}
            onPress={() => onChange(opt.value)}
          >
            {opt.icon ? (
              <Ionicons
                name={opt.icon}
                size={18}
                color={selected ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)"}
              />
            ) : (
              <Text
                style={[
                  styles.segmentTabText,
                  selected && styles.segmentTabTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export type SimpleRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
  isLast?: boolean;
};

export function SimpleRow({
  icon,
  title,
  value,
  onPress,
  trailing,
  danger = false,
  isLast = false,
}: SimpleRowProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowDivider,
        pressed && onPress && styles.rowActive,
      ]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? "#FF5252" : "rgba(255, 255, 255, 0.7)"}
        style={styles.rowIcon}
      />
      <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>
        {title}
      </Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {trailing ??
          (onPress ? (
            <Ionicons
              name="chevron-forward"
              size={18}
              color="rgba(255, 255, 255, 0.25)"
            />
          ) : null)}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 56,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
  },
  rowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  rowIcon: {
    marginRight: 14,
  },
  rowTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontFamily: "Inter_500Medium",
  },
  rowTitleDanger: {
    color: "#FF5252",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
  },
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderRadius: 10,
    padding: 3.5,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  segmentTabSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  segmentTabText: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
  },
  segmentTabTextSelected: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
});
