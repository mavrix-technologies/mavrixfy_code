import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { AppVersionInfo, checkAppVersion } from "@/services/notificationService";

const DEFAULT_STORE_URL = Platform.select({
  ios: "https://apps.apple.com/app/mavrixfy/id123456789",
  default: "https://play.google.com/store/apps/details?id=com.mavrixfy.app",
});

function releaseNoteItems(releaseNotes: string) {
  const notes = releaseNotes
    .split(/\n|•/)
    .map((note) => note.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return notes.length > 0 ? notes : ["Performance improvements, new features, and stability fixes."];
}

function dismiss() {
  // This screen is opened with replace(), so there may be no back stack.
  router.replace("/(tabs)" as any);
}

export default function ForceUpdateScreen() {
  const { width } = useWindowDimensions();
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingStore, setOpeningStore] = useState(false);

  useEffect(() => {
    let mounted = true;

    void checkAppVersion()
      .then((info) => {
        if (!mounted) return;
        if (!info?.hasUpdate) {
          router.replace("/(tabs)" as any);
          return;
        }
        setVersionInfo(info);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const notes = useMemo(() => releaseNoteItems(versionInfo?.releaseNotes ?? ""), [versionInfo?.releaseNotes]);
  const latestVersion = versionInfo?.latestVersion ?? "";
  const watermarkWidth = width - 54;

  const openStore = async () => {
    if (openingStore) return;
    setOpeningStore(true);
    try {
      await Linking.openURL(versionInfo?.storeUrl || DEFAULT_STORE_URL);
    } finally {
      setOpeningStore(false);
    }
  };

  if (loading || !versionInfo) {
    return (
      <LinearGradient colors={["#115B50", "#123D46", "#10141A"]} locations={[0, 0.48, 0.94]} style={styles.gradient}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingGate}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#115B50", "#123D46", "#10141A"]} locations={[0, 0.48, 0.94]} style={styles.gradient}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.page}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandRow}>
              <Image source={require("@/assets/images/mavrixfy_icone.png")} style={styles.brandIcon} contentFit="cover" />
              <Text style={styles.brandName}>Mavrixfy</Text>
            </View>

            <View style={styles.hero}>
              {latestVersion ? (
                <Text
                  accessibilityElementsHidden
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                  numberOfLines={1}
                  style={[styles.versionWatermark, { width: watermarkWidth }]}
                >
                  {latestVersion}
                </Text>
              ) : null}
              <Text style={styles.heading}>New{"\n"}Update</Text>
              <Text style={styles.headingAccent}>Available</Text>
              {loading ? (
                <ActivityIndicator color={Colors.primary} style={styles.loader} />
              ) : (
                <Text style={styles.description}>
                  A newer version of Mavrixfy{latestVersion ? ` (v${latestVersion})` : ""} is available on the store. Please navigate to the store to install it.
                </Text>
              )}
            </View>

            {!loading && (
              <View style={styles.notesSection}>
                <Text style={styles.notesLabel}>WHAT’S NEW:</Text>
                {notes.map((note) => (
                  <View key={note} style={styles.noteRow}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={styles.noteIcon} />
                    <Text style={styles.noteText}>{note}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Update now"
              hitSlop={10}
              style={({ pressed }) => [styles.updateButton, pressed && styles.pressed]}
              onPress={openStore}
            >
              {openingStore ? <ActivityIndicator color="#101116" /> : <Text style={styles.updateButtonText}>Update Now</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              hitSlop={10}
              style={({ pressed }) => [styles.notNowButton, pressed && styles.pressed]}
              onPress={dismiss}
            >
              <Text style={styles.notNowText}>Not Now</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  loadingGate: { flex: 1, alignItems: "center", justifyContent: "center" },
  page: { flex: 1, paddingHorizontal: 27, paddingTop: 16, paddingBottom: 18 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 28, paddingBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandIcon: { width: 35, height: 35, borderRadius: 9 },
  brandName: { color: "#D8E0E5", fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.3 },
  hero: { marginTop: 28, minHeight: 220, overflow: "visible" },
  versionWatermark: { position: "absolute", top: -52, right: -8, color: "rgba(116, 203, 187, 0.13)", fontFamily: "Inter_800ExtraBold", fontSize: 100, lineHeight: 118, letterSpacing: -6.5, textAlign: "right" },
  heading: { color: "#FFFFFF", fontFamily: "Inter_800ExtraBold", fontSize: 48, lineHeight: 56, letterSpacing: -2.4 },
  headingAccent: { color: Colors.primary, fontFamily: "Inter_800ExtraBold", fontSize: 48, lineHeight: 55, letterSpacing: -2.6 },
  description: { color: "#C8D1D5", fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, marginTop: 16, letterSpacing: -0.15 },
  loader: { alignSelf: "flex-start", marginTop: 21 },
  notesSection: { marginTop: 32 },
  notesLabel: { color: Colors.primary, fontFamily: "Inter_800ExtraBold", fontSize: 13, letterSpacing: 0.3, marginBottom: 14 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 10 },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, color: "#D5DDE1", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, letterSpacing: -0.12 },
  actions: { width: "100%", gap: 4, paddingTop: 12, paddingBottom: 4 },
  updateButton: { width: "100%", minHeight: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)" },
  updateButtonText: { color: "#101116", fontFamily: "Inter_800ExtraBold", fontSize: 18, letterSpacing: -0.25 },
  notNowButton: { width: "100%", minHeight: 44, alignItems: "center", justifyContent: "center" },
  notNowText: { color: "#A5AAB1", fontFamily: "Inter_700Bold", fontSize: 15 },
  pressed: { opacity: 0.76 },
});
