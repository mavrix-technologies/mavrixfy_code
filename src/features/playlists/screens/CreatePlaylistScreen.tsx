import React, { useCallback } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";

type CreateAction = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  href: "/import-songs" | "/library" | "/search";
};

const CREATE_ACTIONS: CreateAction[] = [
  {
    icon: "cloud-upload-outline",
    title: "Import songs",
    subtitle: "Upload a TXT or CSV list and match tracks automatically.",
    href: "/import-songs",
  },
  {
    icon: "albums-outline",
    title: "New playlist",
    subtitle: "Open your library and start a new collection.",
    href: "/library",
  },
  {
    icon: "search-outline",
    title: "Search & add",
    subtitle: "Find tracks and build a playlist directly from search results.",
    href: "/search",
  },
];

function CreateActionRow({ action }: { action: CreateAction }) {
  const handlePress = () => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push(action.href as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={action.icon} size={23} color="#FFFFFF" />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
    </Pressable>
  );
}

export function CreatePlaylistScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + (Platform.OS === "android" ? 18 : 12);
  const bottomPadding = insets.bottom + 96;

  const renderItem = useCallback(
    ({ item }: { item: CreateAction }) => <CreateActionRow action={item} />,
    []
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        data={CREATE_ACTIONS}
        keyExtractor={(action) => action.title}
        ListHeaderComponent={
          <>
            <View style={styles.heroIcon}>
              <Ionicons name="add" size={42} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Create</Text>
            <Text style={styles.subtitle}>
              Start from an import, a playlist, or a fresh search.
            </Text>
            <View style={{ height: 16 }} />
          </>
        }
        renderItem={renderItem}
      />
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
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(255,255,255,0.08)",
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

export default CreatePlaylistScreen;
