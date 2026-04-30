import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";

type PremiumAction = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  href: "/profile" | "/search" | "/import-songs";
};

const PREMIUM_ACTIONS: PremiumAction[] = [
  {
    icon: "person-circle-outline",
    title: "Account",
    subtitle: "Manage sign-in, display, playback, and legal settings.",
    href: "/profile",
  },
  {
    icon: "sparkles-outline",
    title: "Discover",
    subtitle: "Search the catalog and build your listening queue.",
    href: "/search",
  },
  {
    icon: "cloud-upload-outline",
    title: "Import",
    subtitle: "Bring your song lists into Mavrixfy.",
    href: "/import-songs",
  },
];

function PremiumActionRow({ action }: { action: PremiumAction }) {
  return (
    <Pressable
      onPress={() => {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
        router.push(action.href);
      }}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={action.icon} size={22} color={Colors.primary} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
    </Pressable>
  );
}

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 91 : insets.top + 24;
  const bottomPadding = Platform.OS === "web" ? 154 : Math.max(154, insets.bottom + 146);

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#121212", Colors.background]} style={StyleSheet.absoluteFillObject} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIcon}>
          <FontAwesome name="spotify" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Premium</Text>
        <Text style={styles.subtitle}>
          Account, discovery, and import tools gathered in one tab.
        </Text>

        <View style={styles.actionList}>
          {PREMIUM_ACTIONS.map((action) => (
            <PremiumActionRow key={action.title} action={action} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
  },
  title: {
    marginTop: 22,
    color: "#FFFFFF",
    fontSize: 42,
    lineHeight: 47,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 330,
    color: "#B3B3B3",
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Inter_500Medium",
  },
  actionList: {
    marginTop: 30,
    gap: 10,
  },
  actionRow: {
    minHeight: 76,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  actionRowPressed: {
    backgroundColor: "#232323",
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,185,84,0.12)",
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: "Inter_700Bold",
  },
  actionSubtitle: {
    marginTop: 3,
    color: "#B3B3B3",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
  },
});
