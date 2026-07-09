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
import { setMiniPlayerSecondaryControlPreference } from "@/lib/miniPlayerControls";
import { getSettings, saveSettings, type AppSettings } from "@/lib/storage";
import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import { safeGoBack } from "@/utils/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearJioSaavnPlaylistCache } from "@/lib/jioSaavnService";

const QUALITY_OPTIONS: { label: string; value: "low" | "medium" | "high" }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
const VIDEO_BACKGROUND_QUALITY_OPTIONS: { label: string; value: AppSettings["videoBackgroundQuality"] }[] = [
  { label: "Auto", value: "auto" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
const SMART_AUTOPLAY_MODE_OPTIONS: { label: string; value: AppSettings["smartAutoplayMode"] }[] = [
  { label: "Mix", value: "similar-trending" },
  { label: "Similar", value: "similar-only" },
  { label: "Artist", value: "artist-radio" },
  { label: "Mood", value: "mood-radio" },
];
const MINI_PLAYER_SECONDARY_OPTIONS: { label: string; value: AppSettings["miniPlayerSecondaryControl"] }[] = [
  { label: "Queue", value: "queue" },
  { label: "Next", value: "next" },
  { label: "Prev", value: "prev" },
  { label: "More", value: "more" },
];

function SegmentGroup<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text
              style={[
                styles.segmentText,
                compact && styles.segmentTextCompact,
                active && styles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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

type ProfileUser = ReturnType<typeof useAuth>["user"];
type RouterPush = ReturnType<typeof useRouter>["push"];
type RouterReplace = ReturnType<typeof useRouter>["replace"];
type UpdateSettings = (partial: Partial<AppSettings>) => void;

function ProfileHero({
  user,
  isGuest,
}: {
  user: ProfileUser;
  isGuest: boolean;
}) {
  return (
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
  );
}

function PlaybackSettingsSection({
  settings,
  lowEndDevice,
  updateSettings,
}: {
  settings: AppSettings;
  lowEndDevice: boolean;
  updateSettings: UpdateSettings;
}) {
  const ambientBackdropSwitchValue = settings.ambientBackdropEnabled;

  return (
    <>
      <Text style={styles.sectionTitle}>Playback</Text>
      <View style={styles.rowsSurface}>
        <View style={styles.settingCard}>
          <Text style={styles.settingLabel}>Streaming quality</Text>
          <Text style={styles.settingHint}>Audio quality for online playback</Text>
          <SegmentGroup
            options={QUALITY_OPTIONS}
            value={settings.streamingQuality}
            onChange={(value) => updateSettings({ streamingQuality: value })}
          />
        </View>

        <View style={[styles.settingCard, styles.settingCardBorder]}>
          <View style={styles.settingRowInline}>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingLabel}>Smart autoplay</Text>
              <Text style={styles.settingHint}>Add similar songs when the queue ends</Text>
            </View>
            <Switch
              value={settings.smartAutoplayEnabled}
              onValueChange={(v) => updateSettings({ smartAutoplayEnabled: v })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
          {settings.smartAutoplayEnabled ? (
            <SegmentGroup
              options={SMART_AUTOPLAY_MODE_OPTIONS}
              value={settings.smartAutoplayMode}
              onChange={(value) => updateSettings({ smartAutoplayMode: value })}
              compact
            />
          ) : null}
        </View>

        <View style={[styles.settingCard, styles.settingCardBorder]}>
          <Text style={styles.settingLabel}>Mini player button</Text>
          <Text style={styles.settingHint}>Right-side control next to play</Text>
          <SegmentGroup
            options={MINI_PLAYER_SECONDARY_OPTIONS}
            value={settings.miniPlayerSecondaryControl}
            onChange={(value) => updateSettings({ miniPlayerSecondaryControl: value })}
            compact
          />
        </View>

        <View style={[styles.settingCard, styles.settingCardBorder]}>
          <View style={styles.settingRowInline}>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingLabel}>Haptic feedback</Text>
              <Text style={styles.settingHint}>Vibration on taps and actions</Text>
            </View>
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={(v) => updateSettings({ hapticsEnabled: v })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        <View style={[styles.settingCard, styles.settingCardBorder]}>
          <View style={styles.settingRowInline}>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingLabel}>Video backdrop</Text>
              <Text style={styles.settingHint}>
                Loop videos behind the player
              </Text>
            </View>
            <Switch
              value={ambientBackdropSwitchValue}
              disabled={false}
              onValueChange={(v) => updateSettings({ ambientBackdropEnabled: v })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
          {ambientBackdropSwitchValue ? (
            <SegmentGroup
              options={VIDEO_BACKGROUND_QUALITY_OPTIONS}
              value={settings.videoBackgroundQuality}
              onChange={(value) => updateSettings({ videoBackgroundQuality: value })}
              compact
            />
          ) : null}
        </View>
      </View>
    </>
  );
}

function AccountSettingsSection({
  isAuthenticated,
  user,
  routerPush,
  routerReplace,
}: {
  isAuthenticated: boolean;
  user: ProfileUser;
  routerPush: RouterPush;
  routerReplace: RouterReplace;
}) {
  return (
    <>
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
    </>
  );
}

function LibrarySettingsSection({ routerPush }: { routerPush: RouterPush }) {
  return (
    <>
      <Text style={styles.sectionTitle}>Library</Text>
      <View style={styles.rowsSurface}>
        <SettingsRow
          icon="cloud-upload-outline"
          title="Import Songs"
          onPress={() => routerPush("/import-songs")}
          first
        />
      </View>
    </>
  );
}

function CacheSettingsSection({
  onClearCache,
  onClearSearchHistory,
  onClearRecentlyPlayed,
}: {
  onClearCache: () => void;
  onClearSearchHistory: () => void;
  onClearRecentlyPlayed: () => void;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>Cache & Storage</Text>
      <View style={styles.rowsSurface}>
        <SettingsRow
          icon="trash-bin-outline"
          title="Clear App Cache"
          subtitle="Clear cached images and API responses"
          onPress={onClearCache}
          first
        />
        <SettingsRow
          icon="time-outline"
          title="Clear Search History"
          subtitle="Clear all past search terms"
          onPress={onClearSearchHistory}
        />
        <SettingsRow
          icon="play-back-outline"
          title="Clear Recently Played"
          subtitle="Clear 'Jump Back In' list on home screen"
          onPress={onClearRecentlyPlayed}
        />
      </View>
    </>
  );
}


export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { push: routerPush, replace: routerReplace } = useRouter();
  const { user, isAuthenticated, isGuest, logout } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomContentInset = Platform.OS === "web" ? 0 : insets.bottom;
  const [lowEndDevice, setLowEndDevice] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    streamingQuality: "high",
    videoBackgroundQuality: "auto",
    smartAutoplayEnabled: true,
    smartAutoplayMode: "similar-trending",
    downloadQuality: "high",
    equalizer: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 },
    equalizerEnabled: false,
    hapticsEnabled: false,
    miniPlayerSecondaryControl: "queue",
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
    setSettings((current) => ({ ...current, ...partial }));
    if (typeof partial.hapticsEnabled === "boolean") {
      setHapticsPreference(partial.hapticsEnabled);
    }
    if (partial.miniPlayerSecondaryControl) {
      setMiniPlayerSecondaryControlPreference(partial.miniPlayerSecondaryControl);
    }
    void saveSettings(partial);
  }, []);

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

  const handleClearCache = useCallback(() => {
    Alert.alert(
      "Clear App Cache",
      "Are you sure you want to clear cached images and API response data? This will not delete your downloads or liked songs.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearJioSaavnPlaylistCache().catch(() => {});
              await AsyncStorage.multiRemove([
                "@mavrixfy_home_public_playlists_v1",
                "@mavrixfy_home_public_playlists_time_v1",
              ]).catch(() => {});
              await Image.clearDiskCache().catch(() => {});
              Image.clearMemoryCache();
              Alert.alert("Success", "Cache cleared successfully.");
            } catch (err) {
              Alert.alert("Error", "Failed to clear cache.");
            }
          },
        },
      ]
    );
  }, []);

  const handleClearSearchHistory = useCallback(() => {
    Alert.alert(
      "Clear Search History",
      "Are you sure you want to delete all search history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.setItem("@mavrixfy_search_history", JSON.stringify([]));
              Alert.alert("Success", "Search history cleared successfully.");
            } catch (err) {
              Alert.alert("Error", "Failed to clear search history.");
            }
          },
        },
      ]
    );
  }, []);

  const handleClearRecentlyPlayed = useCallback(() => {
    Alert.alert(
      "Clear Recently Played",
      "Are you sure you want to clear your 'Jump Back In' recently played history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.setItem("@mavrixfy_recently_played", JSON.stringify([]));
              Alert.alert("Success", "Recently played history cleared.");
            } catch (err) {
              Alert.alert("Error", "Failed to clear recently played history.");
            }
          },
        },
      ]
    );
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
        {isAuthenticated ? (
          <Pressable onPress={handleLogout} hitSlop={8} style={{ padding: 8 }}>
            <Text style={{ color: "#FF8B8B", fontSize: 14, fontFamily: "Inter_700Bold" }}>Log Out</Text>
          </Pressable>
        ) : (
          <View style={{ width: 52 }} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        contentInset={{ bottom: bottomContentInset }}
        scrollIndicatorInsets={{ bottom: bottomContentInset }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ProfileHero user={user} isGuest={isGuest} />

        <PlaybackSettingsSection
          settings={settings}
          lowEndDevice={lowEndDevice}
          updateSettings={updateSettings}
        />

        <AccountSettingsSection
          isAuthenticated={isAuthenticated}
          user={user}
          routerPush={routerPush}
          routerReplace={routerReplace}
        />
        <LibrarySettingsSection routerPush={routerPush} />
        <CacheSettingsSection
          onClearCache={handleClearCache}
          onClearSearchHistory={handleClearSearchHistory}
          onClearRecentlyPlayed={handleClearRecentlyPlayed}
        />
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

  settingCard: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  settingCardBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)",
  },
  settingRowInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingTextBlock: { flex: 1, minWidth: 0 },
  settingLabel: {
    color: Colors.text, fontSize: 15, fontFamily: "Inter_600SemiBold",
  },
  settingHint: {
    color: Colors.subtext, fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },

  segmentRow: {
    flexDirection: "row", borderRadius: 10, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentBtnActive: { backgroundColor: Colors.primary },
  segmentText: { color: Colors.subtext, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  segmentTextCompact: { fontSize: 12 },
  segmentTextActive: { color: Colors.black },

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
