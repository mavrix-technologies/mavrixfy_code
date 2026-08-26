import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { openPrivacyPolicy, openTermsOfService } from "@/lib/legal";
import { setHapticsPreference } from "@/lib/haptics";
import { setMiniPlayerSecondaryControlPreference } from "@/lib/miniPlayerControls";
import { getSettings, saveSettings, hasSeenNewFeatures, markNewFeaturesSeen, isHighQualityEntitled, type AppSettings } from "@/lib/storage";
import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import { safeGoBack } from "@/utils/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearJioSaavnPlaylistCache } from "@/data/providers/JioSaavnProvider";
import { clearCachedHomePublicPlaylists, notifyHomeCacheInvalidated } from "@/lib/homeCache";
import { clearDailyNewReleaseSongCache } from "@/data/providers/NewReleaseProvider";
import { requestHighQualityUnlockWithRewardedAd } from "@/services/ads/highQualityEntitlementService";
import { checkAppVersion, getInstalledAppVersion, getInstalledBuildNumber } from "@/services/notificationService";

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

const MINI_PLAYER_SECONDARY_OPTIONS: { label: string; value: AppSettings["miniPlayerSecondaryControl"]; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Queue", value: "queue", icon: "list" },
  { label: "Next", value: "next", icon: "play-skip-forward" },
  { label: "Prev", value: "prev", icon: "play-skip-back" },
  { label: "More", value: "more", icon: "ellipsis-horizontal" },
];

function SegmentGroup<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: { label: string; value: T; icon?: keyof typeof Ionicons.glyphMap }[];
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
            {opt.icon ? (
              <Ionicons
                name={opt.icon}
                size={compact ? 16 : 18}
                color={active ? Colors.black : Colors.subtext}
              />
            ) : (
              <Text
                style={[
                  styles.segmentText,
                  compact && styles.segmentTextCompact,
                  active && styles.segmentTextActive,
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
type UpdateSettings = (partial: Partial<AppSettings>) => Promise<void>;

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
  onChangeQuality,
  showNewBadges,
}: {
  settings: AppSettings;
  lowEndDevice: boolean;
  updateSettings: UpdateSettings;
  onChangeQuality: (value: AppSettings["streamingQuality"]) => void;
  showNewBadges: boolean;
}) {
  const ambientBackdropSwitchValue = settings.ambientBackdropEnabled;
  const isHighUnlocked = isHighQualityEntitled(settings);
  const remainingHours =
    typeof settings.highQualityExpiresAt === "number" && settings.highQualityExpiresAt > Date.now()
      ? Math.ceil((settings.highQualityExpiresAt - Date.now()) / (1000 * 60 * 60))
      : null;

  return (
    <>
      <Text style={styles.sectionTitle}>Playback</Text>
      <View style={styles.rowsSurface}>
        <View style={styles.settingCard}>
          <View style={styles.settingRowInline}>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingLabel}>Streaming quality</Text>
              <Text style={styles.settingHint}>Audio quality for online playback</Text>
            </View>
            {showNewBadges && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
          </View>
          <View>
            <SegmentGroup
              options={QUALITY_OPTIONS}
              value={settings.streamingQuality}
              onChange={onChangeQuality}
            />
          </View>
          <Text style={styles.settingHint}>
            {isHighUnlocked
              ? remainingHours
                ? `High Quality active (Up to 320 kbps) — ~${remainingHours}h remaining`
                : "High Quality active (Up to 320 kbps)"
              : "Low: 96 kbps • Medium: 160 kbps • High: 320 kbps (Unlock via short ad)"}
          </Text>
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
          <View style={styles.settingRowInline}>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingLabel}>Mini player button</Text>
              <Text style={styles.settingHint}>Right-side control next to play</Text>
            </View>
            {showNewBadges && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
          </View>
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
              <Text style={styles.settingHint}>Loop videos behind the player</Text>
            </View>
            {showNewBadges && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
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

function AboutOfficialInfoSection({
  onCheckStoreUpdate,
  checkingStoreUpdate,
}: {
  onCheckStoreUpdate: () => void;
  checkingStoreUpdate: boolean;
}) {
  const appVersion = getInstalledAppVersion();
  const buildNumber = getInstalledBuildNumber();

  return (
    <>
      <Text style={styles.sectionTitle}>About & Official Info</Text>
      <View style={styles.rowsSurface}>
        <SettingsRow
          icon="information-circle-outline"
          title="App Version"
          subtitle={`Mavrixfy v${appVersion} (Build ${buildNumber})`}
          first
        />
        <SettingsRow
          icon="arrow-up-circle-outline"
          title="Check Store Update"
          subtitle="Check for newer release on store"
          onPress={onCheckStoreUpdate}
          trailing={checkingStoreUpdate ? <ActivityIndicator size="small" color={Colors.primary} /> : undefined}
        />
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
  onClearAll,
}: {
  onClearAll: () => void;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>Cache & Storage</Text>
      <View style={styles.rowsSurface}>
        <SettingsRow
          icon="trash-bin-outline"
          title="Clear Cache & History"
          subtitle="Clear app cache, search history, and recently played"
          onPress={onClearAll}
          first
        />
      </View>
    </>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { push: routerPush, replace: routerReplace } = useRouter();
  const { user, isAuthenticated, isGuest, logout } = useAuth();
  const { changeStreamingQuality } = usePlayerActions();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomContentInset = Platform.OS === "web" ? 0 : insets.bottom;
  const [lowEndDevice, setLowEndDevice] = useState(false);
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const [showNewBadges, setShowNewBadges] = useState(false);
  const [checkingStoreUpdate, setCheckingStoreUpdate] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const [settings, setSettings] = useState<AppSettings>({
    streamingQuality: "medium",
    highQualityUnlocked: false,
    highQualityExpiresAt: null,
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
    ambientBackdropEnabled: false,
  });

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      getSettings(),
      getDevicePerformanceProfile(),
      hasSeenNewFeatures(),
    ]).then(([s, profile, seen]) => {
      if (!mounted) return;
      queueMicrotask(() => {
        setSettings(s);
        setLowEndDevice(profile.isLowEndDevice);
        setHapticsPreference(Boolean(s.hapticsEnabled));
        setShowNewBadges(!seen);
        if (!seen) void markNewFeaturesSeen();
      });
    });
    return () => { mounted = false; };
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    await saveSettings(partial);
    setSettings((current) => ({ ...current, ...partial }));
    
    if (typeof partial.hapticsEnabled === "boolean") {
      setHapticsPreference(partial.hapticsEnabled);
    }
    if (partial.miniPlayerSecondaryControl) {
      setMiniPlayerSecondaryControlPreference(partial.miniPlayerSecondaryControl);
    }
  }, []);

  const handleQualityChange = useCallback(async (value: AppSettings["streamingQuality"]) => {
    if (value === "high") {
      const isEntitled = isHighQualityEntitled(settings);
      if (isEntitled) {
        await saveSettings({ streamingQuality: "high" });
        setSettings((prev) => ({ ...prev, streamingQuality: "high" }));
        await changeStreamingQuality("high");
        return;
      }

      setIsLoadingAd(true);
      try {
        const unlocked = await requestHighQualityUnlockWithRewardedAd();
        if (unlocked) {
          const updated = await getSettings();
          setSettings(updated);
          await changeStreamingQuality("high");
        }
      } finally {
        setIsLoadingAd(false);
      }
      return;
    }

    await saveSettings({ streamingQuality: value });
    setSettings((prev) => ({ ...prev, streamingQuality: value }));
    await changeStreamingQuality(value);
  }, [settings, changeStreamingQuality]);

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

  const handleCheckStoreUpdate = useCallback(async () => {
    if (checkingStoreUpdate) return;
    setCheckingStoreUpdate(true);
    try {
      const versionInfo = await checkAppVersion();
      if (versionInfo?.hasUpdate) {
        routerPush("/force-update" as any);
        return;
      }
      Alert.alert("You're up to date", "You already have the latest version of Mavrixfy.");
    } catch {
      Alert.alert("Unable to check", "Please check your internet connection and try again.");
    } finally {
      setCheckingStoreUpdate(false);
    }
  }, [checkingStoreUpdate, routerPush]);

  const handleClearAllData = useCallback(() => {
    Alert.alert(
      "Clear Cache & History",
      "Are you sure you want to clear the app cache, search history, and recently played list? This will not delete your downloads or liked songs.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              await clearJioSaavnPlaylistCache().catch(() => {});
              await Promise.all([
                clearCachedHomePublicPlaylists(),
                clearDailyNewReleaseSongCache(),
              ]);
              await Image.clearDiskCache().catch(() => {});
              Image.clearMemoryCache();

              await AsyncStorage.setItem("@mavrixfy_search_history", JSON.stringify([])).catch(() => {});
              await AsyncStorage.setItem("@mavrixfy_recently_played", JSON.stringify([])).catch(() => {});

              notifyHomeCacheInvalidated();

              Alert.alert("Success", "All cache and history cleared successfully.");
            } catch {
              Alert.alert("Error", "Failed to clear some cache or history data.");
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
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(bottomContentInset, 16) + 48 }]}
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
          onChangeQuality={handleQualityChange}
          showNewBadges={showNewBadges}
        />

        <AccountSettingsSection
          isAuthenticated={isAuthenticated}
          user={user}
          routerPush={routerPush}
          routerReplace={routerReplace}
        />
        <LibrarySettingsSection routerPush={routerPush} />
        <CacheSettingsSection
          onClearAll={handleClearAllData}
        />
        <AboutOfficialInfoSection
          onCheckStoreUpdate={() => void handleCheckStoreUpdate()}
          checkingStoreUpdate={checkingStoreUpdate}
        />
      </ScrollView>

      {/* Ad Loading Overlay */}
      <Modal transparent visible={isLoadingAd} animationType="fade">
        <View style={styles.adLoaderOverlay}>
          <View style={styles.adLoaderContent}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.adLoaderText}>Preparing Video Ad...</Text>
            <Text style={styles.adLoaderSubtext}>High quality audio will unlock after the ad.</Text>
          </View>
        </View>
      </Modal>
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
  newBadge: {
    backgroundColor: "#E8115B",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
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

  // Ad Loader Modal
  adLoaderOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  adLoaderContent: {
    backgroundColor: "#161920",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    width: "80%",
    maxWidth: 320,
    gap: 12,
  },
  adLoaderText: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  adLoaderSubtext: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
});

export default ProfileScreen;
