import React, { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface AllArtistsHeaderProps {
  selectMode: boolean;
  selectedCount: number;
  totalCount: number;
  onBack: () => void;
  onToggleSelect: () => void;
}

export const AllArtistsHeader = memo(function AllArtistsHeader({
  selectMode,
  selectedCount,
  totalCount,
  onBack,
  onToggleSelect,
}: AllArtistsHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={8}
      >
        <Ionicons
          name={selectMode ? "close" : "arrow-back"}
          size={22}
          color="#FFFFFF"
        />
      </Pressable>

      <View style={styles.titleWrap}>
        <Text style={styles.title}>
          {selectMode
            ? selectedCount > 0
              ? `${selectedCount} selected`
              : "Select artists"
            : "Artists"}
        </Text>
        {!selectMode && totalCount > 0 && (
          <Text style={styles.subtitle}>{totalCount} Profiles</Text>
        )}
      </View>

      <Pressable
        style={[styles.selectToggleBtn, selectMode && styles.selectToggleBtnActive]}
        onPress={onToggleSelect}
        hitSlop={8}
      >
        <Text style={[styles.selectToggleText, selectMode && styles.selectToggleTextActive]}>
          {selectMode ? "Done" : "Select"}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  selectToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  selectToggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  selectToggleText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  selectToggleTextActive: {
    color: "#000000",
  },
});
