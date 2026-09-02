import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import {
  getSettings,
  saveSettings,
  setMiniPlayerSecondaryControlPreference,
  hasSeenNewFeatures,
  markNewFeaturesSeen,
  isHighQualityEntitled,
  type AppSettings,
} from "@/lib/storage";
import { safeGoBack } from "@/utils/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearJioSaavnPlaylistCache } from "@/data/providers/JioSaavnProvider";
import { clearCachedHomePublicPlaylists, notifyHomeCacheInvalidated } from "@/lib/homeCache";
import { clearDailyNewReleaseSongCache } from "@/data/providers/NewReleaseProvider";
import { requestHighQualityUnlockWithRewardedAd } from "@/services/ads/highQualityEntitlementService";
import { checkAppVersion, getInstalledAppVersion, getInstalledBuildNumber } from "@/services/notificationService";
import { SimpleRow } from "../components/SettingsUIComponents";
import { ProfileAccountHeader } from "../components/ProfileAccountHeader";
import { ProfilePlaybackSection } from "../components/ProfilePlaybackSection";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { push: routerPush, replace: routerReplace } = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { changeStreamingQuality } = usePlayerActions();

  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  const [isLoadingAd, setIsLoadingAd] = useState(false);
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
    void Promise.all([getSettings(), hasSeenNewFeatures()]).then(([s, seen]) => {
      if (!mounted) return;
      queueMicrotask(() => {
        setSettings(s);
        setHapticsPreference(Boolean(s.hapticsEnabled));
        if (!seen) void markNewFeaturesSeen();
      });
    });
    return () => {
      mounted = false;
    };
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

  const handleQualityChange = useCallback(
    async (value: AppSettings["streamingQuality"]) => {
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

      setSettings((prev) => ({ ...prev, streamingQuality: value }));
      await Promise.all([
        saveSettings({ streamingQuality: value }),
        changeStreamingQuality(value),
      ]);
    },
    [settings, changeStreamingQuality]
  );

  const handleLogout = useCallback(() => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          routerReplace("/login");
        },
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
      Alert.alert("Latest Version", "You are using the latest version of Mavrixfy.");
    } catch {
      Alert.alert("Error", "Could not check for updates. Please check your connection.");
    } finally {
      setCheckingStoreUpdate(false);
    }
  }, [checkingStoreUpdate, routerPush]);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      "Clear Cache",
      "This will clear temporary song cache and search history. Your saved songs and playlists will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
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
              Alert.alert("Done", "Cache cleared successfully.");
            } catch {
              Alert.alert("Notice", "Some cached items could not be cleared.");
            }
          },
        },
      ]
    );
  }, []);

  const appVersion = getInstalledAppVersion();
  const buildNumber = getInstalledBuildNumber();

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backButton} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        {isAuthenticated ? (
          <Pressable onPress={handleLogout} style={styles.headerActionBtn} hitSlop={12}>
            <Text style={styles.logoutHeaderBtnText}>Log Out</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => routerReplace("/login")} style={styles.headerActionBtn} hitSlop={12}>
            <Text style={styles.signInHeaderBtnText}>Sign In</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollBody,
          { paddingBottom: Math.max(bottomInset, 16) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile User Info Card */}
        <ProfileAccountHeader
          user={user}
          isAuthenticated={isAuthenticated}
          onSignInPress={() => routerReplace("/login")}
        />

        {/* Audio & Playback Section */}
        <ProfilePlaybackSection
          settings={settings}
          updateSettings={updateSettings}
          onQualityChange={handleQualityChange}
        />

        {/* Library & Data */}
        <Text style={styles.sectionLabel}>LIBRARY & DATA</Text>
        <View style={styles.sectionGroup}>
          <SimpleRow
            icon="cloud-upload-outline"
            title="Import Local Audio"
            onPress={() => routerPush("/import-songs" as any)}
          />
          <SimpleRow
            icon="trash-bin-outline"
            title="Clear Cache & History"
            onPress={handleClearCache}
            isLast
          />
        </View>

        {/* Account & Security */}
        {isAuthenticated && (
          <>
            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            <View style={styles.sectionGroup}>
              <SimpleRow
                icon="mail-outline"
                title="Email"
                value={user?.email || "—"}
              />
              <SimpleRow
                icon="log-out-outline"
                title="Sign Out"
                onPress={handleLogout}
                danger
              />
              <SimpleRow
                icon="trash-outline"
                title="Delete Account"
                onPress={() => routerPush("/delete-account")}
                danger
                isLast
              />
            </View>
          </>
        )}

        {/* About Section */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.sectionGroup}>
          <SimpleRow
            icon="information-circle-outline"
            title="Version"
            value={`v${appVersion} (${buildNumber})`}
          />
          <SimpleRow
            icon="arrow-up-circle-outline"
            title="Check for Updates"
            onPress={() => void handleCheckStoreUpdate()}
            trailing={
              checkingStoreUpdate ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : undefined
            }
          />
          <SimpleRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => void openPrivacyPolicy()}
          />
          <SimpleRow
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => void openTermsOfService()}
            isLast
          />
        </View>
      </ScrollView>

      {/* Ad Loading Modal */}
      <Modal transparent visible={isLoadingAd} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.modalText}>Unlocking High Quality...</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0D1117",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  logoutHeaderBtnText: {
    color: "#FF5252",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  signInHeaderBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  scrollView: {
    flex: 1,
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sectionLabel: {
    color: "rgba(255, 255, 255, 0.38)",
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    marginTop: 26,
    marginBottom: 10,
    marginLeft: 6,
  },
  sectionGroup: {
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "#161B22",
    paddingHorizontal: 26,
    paddingVertical: 20,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  modalText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

export default ProfileScreen;
