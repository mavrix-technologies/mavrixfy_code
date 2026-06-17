import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { openPrivacyPolicy, openTermsOfService } from "@/lib/legal";
import { setHapticsPreference } from "@/lib/haptics";
import { getSettings, saveSettings, type AppSettings } from "@/lib/storage";
import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import { safeGoBack } from "@/utils/navigation";

const QUALITY_OPTIONS: { label: string; value: "low" | "medium" | "high" }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
const CROSSFADE_STEPS = Array.from({ length: 13 }, (_, value) => ({
  key: `crossfade-${value}`,
  value,
}));

type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
  first?: boolean;
};

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  danger = false,
  first = false,
}: SettingsRowProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        first ? null : styles.settingsRowBorder,
        pressed && onPress ? styles.settingsRowPressed : null,
      ]}
    >
      <View style={styles.rowLeading}>
        <Ionicons name={icon} size={20} color={danger ? "#FF8B8B" : Colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={danger ? "#FF8B8B" : Colors.subtext} />
        ) : null)}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { push: routerPush, replace: routerReplace } = useRouter();
  const { user, isAuthenticated, isGuest, logout } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomScrollPadding = Platform.OS === "web" ? 120 : Math.max(128, insets.bottom + 120);
  const [lowEndDevice, setLowEndDevice] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    streamingQuality: "high",
    downloadQuality: "high",
    equalizer: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 },
    equalizerEnabled: false,
    hapticsEnabled: false,
    crossfade: 0,
    gapless: true,
    normalizeVolume: false,
    ambientBackdropEnabled: true,
  });

  useEffect(() => {
    let mounted = true;
    void Promise.all([getSettings(), getDevicePerformanceProfile()]).then(([s, profile]) => {
      if (!mounted) return;
      setSettings(s);
      setLowEndDevice(profile.isLowEndDevice);
      setHapticsPreference(Boolean(s.hapticsEnabled));
    });
    return () => { mounted = false; };
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((current) => {
      const updated = { ...current, ...partial };
      if (typeof partial.hapticsEnabled === "boolean") setHapticsPreference(partial.hapticsEnabled);
      void saveSettings(partial);
      return updated;
    });
  }, []);

  const ambientBackdropSwitchValue = lowEndDevice ? false : settings.ambientBackdropEnabled;

  const handleLogout = useCallback(() => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => { await logout(); routerReplace("/login"); },
      },
    ]);
  }, [logout, routerReplace]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomScrollPadding },
        ]}
        contentInset={{ bottom: bottomScrollPadding }}
        scrollIndicatorInsets={{ bottom: bottomScrollPadding }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile hero */}
        <View style={styles.heroSection}>
          <View style={styles.avatarShell}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={32} color={Colors.text} />
              </View>
            )}
          </View>
          <Text style={styles.heroName}>
            {user?.name || (isGuest ? "Guest" : "Mavrixfy User")}
          </Text>
          {user?.email ? (
            <Text style={styles.heroEmail}>{user.email}</Text>
          ) : null}
        </View>

        {/* Playback */}
        <Text style={styles.sectionTitle}>Playback</Text>
        <View style={styles.rowsSurface}>
          {/* Streaming quality */}
          <View style={styles.controlBlock}>
            <View style={styles.controlHeader}>
              <View style={styles.rowLeading}>
                <Ionicons name="speedometer-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.rowTitle}>Streaming quality</Text>
            </View>
            <View style={styles.segmentRow}>
              {QUALITY_OPTIONS.map((opt) => {
                const active = settings.streamingQuality === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    onPress={() => updateSettings({ streamingQuality: opt.value })}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Crossfade */}
          <View style={[styles.controlBlock, styles.controlBlockBorder]}>
            <View style={styles.controlHeader}>
              <View style={styles.rowLeading}>
                <Ionicons name="git-compare-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.rowTitle}>Crossfade</Text>
              <Text style={styles.valuePill}>{settings.crossfade}s</Text>
            </View>
            <View style={styles.crossfadeRow}>
              {CROSSFADE_STEPS.map((step) => (
                <Pressable
                  key={step.key}
                  onPress={() => updateSettings({ crossfade: step.value })}
                  style={[styles.crossfadeBar, step.value <= settings.crossfade && styles.crossfadeBarActive]}
                />
              ))}
            </View>
          </View>

          <SettingsRow
            icon="swap-horizontal-outline"
            title="Gapless playback"
            trailing={
              <Switch
                value={settings.gapless}
                onValueChange={(v) => updateSettings({ gapless: v })}
                trackColor={{ false: Colors.inactive, true: Colors.primary }}
                thumbColor={Colors.text}
              />
            }
          />
          <SettingsRow
            icon="pulse-outline"
            title="Normalize volume"
            trailing={
              <Switch
                value={settings.normalizeVolume}
                onValueChange={(v) => updateSettings({ normalizeVolume: v })}
                trackColor={{ false: Colors.inactive, true: Colors.primary }}
                thumbColor={Colors.text}
              />
            }
          />
          <SettingsRow
            icon="phone-portrait-outline"
            title="Ambient video backdrop"
            subtitle={
              lowEndDevice
                ? "Disabled automatically on low-RAM Android devices for smoother playback"
                : "Show dynamic video loops behind the player"
            }
            trailing={
              <Switch
                value={ambientBackdropSwitchValue}
                disabled={lowEndDevice}
                onValueChange={(v) => updateSettings({ ambientBackdropEnabled: v })}
                trackColor={{ false: Colors.inactive, true: Colors.primary }}
                thumbColor={lowEndDevice ? Colors.subtext : Colors.text}
              />
            }
          />
          <SettingsRow
            icon="phone-portrait-outline"
            title="Haptic touch"
            trailing={
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={(v) => updateSettings({ hapticsEnabled: v })}
                trackColor={{ false: Colors.inactive, true: Colors.primary }}
                thumbColor={Colors.text}
              />
            }
          />
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.rowsSurface}>
          {isAuthenticated ? (
            <>
              <SettingsRow
                icon="mail-outline"
                title="Email"
                subtitle={user?.email || "—"}
                first
              />
              <SettingsRow
                icon="person-outline"
                title="Display name"
                subtitle={user?.name || "—"}
              />
            </>
          ) : (
            <SettingsRow
              icon="log-in-outline"
              title="Sign In"
              onPress={() => routerReplace("/login")}
              first
            />
          )}
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => void openPrivacyPolicy()}
          />
          <SettingsRow
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => void openTermsOfService()}
          />
          {isAuthenticated ? (
            <SettingsRow
              icon="trash-outline"
              title="Delete Account"
              onPress={() => routerPush("/delete-account")}
              danger
            />
          ) : null}
        </View>

        {/* Import */}
        <Text style={styles.sectionTitle}>Library</Text>
        <View style={styles.rowsSurface}>
          <SettingsRow
            icon="cloud-upload-outline"
            title="Import Songs"
            onPress={() => routerPush("/import-songs")}
            first
          />
        </View>

        {/* Session */}
        {isAuthenticated ? (
          <>
            <Text style={styles.sectionTitle}>Session</Text>
            <View style={styles.rowsSurface}>
              <SettingsRow
                icon="log-out-outline"
                title="Log Out"
                onPress={handleLogout}
                danger
                first
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    color: Colors.text, fontSize: 18, fontFamily: "Inter_700Bold",
  },

  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 128 },

  // Hero
  heroSection: {
    alignItems: "center", paddingTop: 20, paddingBottom: 28,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  avatarShell: {
    width: 88, height: 88, borderRadius: 44, overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 14,
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  heroName: {
    color: Colors.text, fontSize: 22, fontFamily: "Inter_700Bold",
  },
  heroEmail: {
    color: Colors.subtext, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular",
  },

  // Section
  sectionTitle: {
    color: Colors.subtext, fontSize: 12, fontFamily: "Inter_700Bold",
    letterSpacing: 0.8, textTransform: "uppercase",
    marginHorizontal: 20, marginTop: 28, marginBottom: 8,
  },
  rowsSurface: {
    marginHorizontal: 16, borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    overflow: "hidden",
  },

  // Control blocks (quality, crossfade)
  controlBlock: { paddingHorizontal: 16, paddingVertical: 14 },
  controlBlockBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)",
  },
  controlHeader: { flexDirection: "row", alignItems: "center" },

  segmentRow: {
    flexDirection: "row", marginTop: 12, borderRadius: 10, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentBtnActive: { backgroundColor: Colors.primary },
  segmentText: { color: Colors.subtext, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  segmentTextActive: { color: Colors.black },

  crossfadeRow: { flexDirection: "row", marginTop: 12 },
  crossfadeBar: {
    flex: 1, height: 6, borderRadius: 999, marginRight: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  crossfadeBarActive: { backgroundColor: Colors.primary },

  valuePill: {
    color: Colors.text, fontSize: 13, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden", fontFamily: "Inter_600SemiBold", marginLeft: "auto",
  },

  // Rows
  settingsRow: {
    minHeight: 56, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  settingsRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)",
  },
  settingsRowPressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  rowLeading: { width: 28, alignItems: "center", justifyContent: "center", marginRight: 12 },
  rowBody: { flex: 1, marginRight: 8 },
  rowTitle: { color: Colors.text, fontSize: 15, fontFamily: "Inter_500Medium" },
  rowTitleDanger: { color: "#FF8B8B" },
  rowSubtitle: {
    color: Colors.subtext, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular",
  },
});
