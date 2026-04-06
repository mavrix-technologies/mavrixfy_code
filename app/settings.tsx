import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { safeGoBack } from "@/utils/navigation";
import { setHapticsPreference } from "@/lib/haptics";
import {
  getSettings,
  saveSettings,
  AppSettings,
} from "@/lib/storage";

const QUALITY_OPTIONS: { label: string; value: "low" | "medium" | "high" }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomScrollPadding = Platform.OS === "web" ? 110 : Math.max(118, insets.bottom + 112);
  const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "1.3.10";
  const configuredBuild =
    Platform.OS === "android"
      ? Constants.expoConfig?.android?.versionCode
      : Constants.expoConfig?.ios?.buildNumber;
  const buildVersion = String(configuredBuild || Constants.nativeBuildVersion || "10310");
  const { user, isAuthenticated, isGuest, logout } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<AppSettings>({
    streamingQuality: "high",
    downloadQuality: "high",
    equalizer: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 },
    equalizerEnabled: false,
    hapticsEnabled: false,
    crossfade: 0,
    gapless: true,
    normalizeVolume: false,
  });

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setHapticsPreference(Boolean(s.hapticsEnabled));
    });
  }, []);

  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) => {
      const updated = { ...settings, ...partial };
      setSettings(updated);
      if (typeof partial.hapticsEnabled === "boolean") {
        setHapticsPreference(partial.hapticsEnabled);
      }
      saveSettings(partial);
    },
    [settings]
  );

  const clearCache = () => {
    Alert.alert("Clear Cache", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          Alert.alert("Done", "Cache cleared");
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomScrollPadding }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileSection}>
          {user?.picture ? (
            <Image
              source={{ uri: user.picture }}
              style={styles.profileImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.subtext} />
            </View>
          )}
          <Text style={styles.profileName}>
            {user ? user.name || "Mavrixfy User" : isGuest ? "Guest User" : "Mavrixfy User"}
          </Text>
          <Text style={styles.profileSub}>
            {user ? user.email : isGuest ? "Sign in to sync your data" : "Free Plan"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playback</Text>

          <Text style={styles.settingLabel}>Streaming Quality</Text>
          <View style={styles.segmentRow}>
            {QUALITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.segmentBtn,
                  settings.streamingQuality === opt.value && styles.segmentBtnActive,
                ]}
                onPress={() => updateSettings({ streamingQuality: opt.value })}
              >
                <Text
                  style={[
                    styles.segmentText,
                    settings.streamingQuality === opt.value && styles.segmentTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Crossfade</Text>
              <Text style={styles.settingValue}>{settings.crossfade}s</Text>
            </View>
            <View style={styles.sliderContainer}>
              {Array.from({ length: 13 }, (_, i) => (
                <Pressable
                  key={i}
                  style={[
                    styles.sliderDot,
                    i <= settings.crossfade && styles.sliderDotActive,
                  ]}
                  onPress={() => updateSettings({ crossfade: i })}
                />
              ))}
            </View>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>Gapless Playback</Text>
            <Switch
              value={settings.gapless}
              onValueChange={(val) => updateSettings({ gapless: val })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>Normalize Volume</Text>
            <Switch
              value={settings.normalizeVolume}
              onValueChange={(val) => updateSettings({ normalizeVolume: val })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>Haptic Touch</Text>
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={(val) => updateSettings({ hapticsEnabled: val })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <Pressable
            style={styles.actionRow}
            onPress={() => router.push("/import-songs")}
          >
            <View style={styles.actionRowLeft}>
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.primary} />
              <Text style={styles.settingLabel}>Import Songs</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
          </Pressable>

          <View style={styles.aboutRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValue}>
              {appVersion}
            </Text>
          </View>
          
          <View style={styles.aboutRow}>
            <Text style={styles.settingLabel}>Build</Text>
            <Text style={styles.settingValue}>
              {buildVersion}
            </Text>
          </View>

          <Pressable style={styles.dangerBtn} onPress={clearCache}>
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
            <Text style={styles.dangerText}>Clear Cache</Text>
          </Pressable>

          {isAuthenticated ? (
            <Pressable
              style={styles.signOutBtn}
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.signInBtn}
              onPress={() => router.replace("/login")}
            >
              <Ionicons name="log-in-outline" size={20} color={Colors.primary} />
              <Text style={styles.signInText}>Sign In</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  profileName: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  profileSub: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  settingValue: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  settingRow: {
    marginTop: 16,
  },
  settingInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  segmentRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  segmentTextActive: {
    color: Colors.black,
    fontFamily: "Inter_700Bold",
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sliderDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  sliderDotActive: {
    backgroundColor: Colors.primary,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  presetsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  presetBtnActive: {
    backgroundColor: Colors.primary,
  },
  presetText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  presetTextActive: {
    color: Colors.black,
    fontFamily: "Inter_700Bold",
  },
  eqContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    height: 200,
  },
  eqBand: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  eqDbLabel: {
    color: Colors.text,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  eqBarTrack: {
    flex: 1,
    width: 28,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "hidden",
  },
  eqBar: {
    width: "100%",
    borderRadius: 4,
  },
  eqFreqLabel: {
    color: Colors.subtext,
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  actionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  dangerText: {
    color: "#FF6B6B",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  profileImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,75,75,0.15)",
    marginTop: 8,
  },
  signOutText: {
    color: "#FF6B6B",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(29,185,84,0.15)",
    marginTop: 8,
  },
  signInText: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
