import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_HOME_HERO_CONFIG,
  getHomeHeroConfig,
  HomeHeroConfig,
  saveHomeHeroConfig,
} from "@/lib/homeHeroConfig";
import { safeGoBack } from "@/utils/navigation";

type HomeVideoEditorMode = "video" | "ad";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function EditorModeTabs({
  editorMode,
  onChange,
}: {
  editorMode: HomeVideoEditorMode;
  onChange: (mode: HomeVideoEditorMode) => void;
}) {
  return (
    <View style={styles.modeTabs}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: editorMode === "video" }}
        style={[styles.modeTab, editorMode === "video" && styles.modeTabActive]}
        onPress={() => onChange("video")}
      >
        <Ionicons
          name="film-outline"
          size={16}
          color={editorMode === "video" ? Colors.black : Colors.subtext}
        />
        <Text style={[styles.modeTabText, editorMode === "video" && styles.modeTabTextActive]}>
          Home video
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: editorMode === "ad" }}
        style={[styles.modeTab, editorMode === "ad" && styles.modeTabActive]}
        onPress={() => onChange("ad")}
      >
        <Ionicons
          name="megaphone-outline"
          size={16}
          color={editorMode === "ad" ? Colors.black : Colors.subtext}
        />
        <Text style={[styles.modeTabText, editorMode === "ad" && styles.modeTabTextActive]}>
          Native ad
        </Text>
      </Pressable>
    </View>
  );
}

function HomeVideoFieldsSection({
  config,
  onUpdate,
}: {
  config: HomeHeroConfig;
  onUpdate: (partial: Partial<HomeHeroConfig>) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.switchRow}>
        <View>
          <Text style={styles.fieldLabel}>Active</Text>
          <Text style={styles.fieldHint}>Show this video at the top of Home.</Text>
        </View>
        <Switch
          value={config.enabled}
          onValueChange={(enabled) => onUpdate({ enabled })}
          trackColor={{ false: Colors.inactive, true: Colors.primary }}
          thumbColor={Colors.text}
        />
      </View>

      <Text style={styles.fieldLabel}>Small title</Text>
      <TextInput
        value={config.title}
        onChangeText={(title) => onUpdate({ title })}
        style={styles.input}
        placeholder="COCKTAIL 2"
        placeholderTextColor={Colors.inactive}
        autoCapitalize="words"
      />

      <Text style={styles.fieldLabel}>MP4 video URL</Text>
      <TextInput
        value={config.videoUrl}
        onChangeText={(videoUrl) => onUpdate({ videoUrl })}
        style={[styles.input, styles.multilineInput]}
        placeholder="https://..."
        placeholderTextColor={Colors.inactive}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />

      <Text style={styles.fieldLabel}>Poster image URL</Text>
      <TextInput
        value={config.posterUrl}
        onChangeText={(posterUrl) => onUpdate({ posterUrl })}
        style={[styles.input, styles.multilineInput]}
        placeholder="https://..."
        placeholderTextColor={Colors.inactive}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
    </View>
  );
}

function NativeAdFieldsSection({
  adSlotEnabled,
  adUnitId,
  onUpdate,
}: {
  adSlotEnabled: boolean;
  adUnitId: string;
  onUpdate: (partial: Partial<HomeHeroConfig>) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Native video ad slot</Text>
          <Text style={styles.fieldHint}>Adds one sponsored card to the home video carousel.</Text>
        </View>
        <Switch
          value={adSlotEnabled}
          onValueChange={(nextAdSlotEnabled) => onUpdate({ adSlotEnabled: nextAdSlotEnabled })}
          trackColor={{ false: Colors.inactive, true: Colors.primary }}
          thumbColor={Colors.text}
        />
      </View>

      {adSlotEnabled ? (
        <>
          <Text style={styles.fieldLabel}>Native video ad unit ID</Text>
          <TextInput
            value={adUnitId}
            onChangeText={(nextAdUnitId) => onUpdate({ adUnitId: nextAdUnitId })}
            style={styles.input}
            placeholder="ca-app-pub-3940256099942544/1044960115"
            placeholderTextColor={Colors.inactive}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldHint}>Use an AdMob Native Video placement. Do not paste the regular Native unit here.</Text>
        </>
      ) : (
        <View style={styles.adSlotOffHint}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.subtext} />
          <Text style={styles.fieldHint}>Turn this on to add or edit the native video ad unit.</Text>
        </View>
      )}
    </View>
  );
}

function AdminHomeVideoActions({
  editorMode,
  loading,
  saving,
  onReset,
  onSave,
}: {
  editorMode: HomeVideoEditorMode;
  loading: boolean;
  saving: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Pressable style={styles.secondaryBtn} onPress={onReset} disabled={saving || loading}>
        <Text style={styles.secondaryBtnText}>Reset default</Text>
      </Pressable>
      <Pressable style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={onSave} disabled={saving || loading}>
        {saving ? (
          <ActivityIndicator color={Colors.black} />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color={Colors.black} />
            <Text style={styles.primaryBtnText}>{editorMode === "ad" ? "Save ad" : "Save video"}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export default function AdminHomeVideoScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomScrollPadding = Platform.OS === "web" ? 110 : Math.max(118, insets.bottom + 112);

  const [config, setConfig] = useState<HomeHeroConfig>(DEFAULT_HOME_HERO_CONFIG);
  const [editorMode, setEditorMode] = useState<HomeVideoEditorMode>("video");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getHomeHeroConfig()
      .then((nextConfig) => {
        if (mounted) setConfig(nextConfig);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateConfig = useCallback((partial: Partial<HomeHeroConfig>) => {
    setConfig((current) => ({ ...current, ...partial }));
  }, []);

  const handleSave = useCallback(async () => {
    const isEditingAd = editorMode === "ad";
    const title = config.title.trim();
    const videoUrl = config.videoUrl.trim();
    const posterUrl = config.posterUrl.trim();
    const adUnitId = (config.adUnitId || "").trim();
    const adSlotEnabled = config.adSlotEnabled ?? Boolean(adUnitId);

    if (!isEditingAd) {
      if (!title) {
        Alert.alert("Title required", "Add a short title for the home video.");
        return;
      }

      if (!isHttpUrl(videoUrl)) {
        Alert.alert("Video URL required", "Add a valid HTTP or HTTPS MP4 video URL.");
        return;
      }

      if (!isHttpUrl(posterUrl)) {
        Alert.alert("Poster URL required", "Add a valid HTTP or HTTPS poster image URL.");
        return;
      }
    }

    if (adSlotEnabled && !adUnitId) {
      Alert.alert("Ad unit required", "Add a native video ad unit ID or turn off the ad slot.");
      return;
    }

    setSaving(true);
    try {
      const firstItem = config.items.find((item) => item.kind !== "ad") || DEFAULT_HOME_HERO_CONFIG.items[0];
      const preservedVideoItems = config.items.filter((item) => item.id !== firstItem.id && item.kind !== "ad");
      const existingAdItem = config.items.find((item) => item.kind === "ad" || (!item.videoUrl && item.adUnitId));
      const nextTitle = isEditingAd ? firstItem.title || title || DEFAULT_HOME_HERO_CONFIG.title : title;
      const nextVideoUrl = isEditingAd ? firstItem.videoUrl || videoUrl || DEFAULT_HOME_HERO_CONFIG.videoUrl : videoUrl;
      const nextPosterUrl = isEditingAd ? firstItem.posterUrl || posterUrl || DEFAULT_HOME_HERO_CONFIG.posterUrl : posterUrl;
      const nextItems = [
        {
          ...firstItem,
          kind: "video" as const,
          enabled: isEditingAd ? firstItem.enabled : true,
          title: nextTitle,
          videoUrl: nextVideoUrl,
          posterUrl: nextPosterUrl,
          adUnitId: "",
        },
        ...preservedVideoItems,
      ];

      if (adSlotEnabled && adUnitId) {
        nextItems.push({
          ...(existingAdItem || DEFAULT_HOME_HERO_CONFIG.items[0]),
          id: existingAdItem?.id || "home-native-video-ad",
          kind: "ad" as const,
          enabled: true,
          title: "Sponsored",
          videoUrl: "",
          posterUrl: "",
          adUnitId,
          linkUrl: "",
          songId: "",
          song: null,
          linkType: "song" as const,
          album: null,
          playlist: null,
        });
      }

      const nextConfig = {
        enabled: config.enabled,
        title: nextTitle,
        videoUrl: nextVideoUrl,
        posterUrl: nextPosterUrl,
        adUnitId,
        adSlotEnabled,
        items: nextItems,
      };

      await saveHomeHeroConfig(
        nextConfig,
        user?.id
      );
      setConfig(nextConfig);
      Alert.alert("Saved", isEditingAd ? "Native video ad slot updated." : "Home video updated.");
    } catch (error: any) {
      Alert.alert("Could not save", error?.message || "Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [config, editorMode, user?.id]);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_HOME_HERO_CONFIG);
    setEditorMode("video");
  }, []);

  if (!user?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <Pressable onPress={safeGoBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Home Video</Text>
          <View style={{ width: 42 }} />
        </View>
        <View style={styles.lockedCard}>
          <Ionicons name="lock-closed-outline" size={28} color={Colors.primary} />
          <Text style={styles.lockedTitle}>Admin access required</Text>
          <Text style={styles.lockedText}>Your user profile needs admin permission to edit the home video.</Text>
        </View>
      </View>
    );
  }

  const adSlotEnabled = config.adSlotEnabled ?? Boolean(config.adUnitId);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Home Video</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentInset={{ bottom: bottomScrollPadding }}
        scrollIndicatorInsets={{ bottom: bottomScrollPadding }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>{config.title.trim() || DEFAULT_HOME_HERO_CONFIG.title}</Text>
          <Text style={styles.previewMeta}>
            {config.enabled ? "Visible on Home" : "Hidden on Home"}
            {adSlotEnabled ? " · Native video ad slot on" : " · Ad slot off"}
          </Text>
        </View>

        <EditorModeTabs editorMode={editorMode} onChange={setEditorMode} />

        {editorMode === "video" ? (
          <HomeVideoFieldsSection config={config} onUpdate={updateConfig} />
        ) : null}

        {editorMode === "ad" ? (
          <NativeAdFieldsSection
            adSlotEnabled={adSlotEnabled}
            adUnitId={config.adUnitId || ""}
            onUpdate={updateConfig}
          />
        ) : null}

        <AdminHomeVideoActions
          editorMode={editorMode}
          loading={loading}
          saving={saving}
          onReset={handleReset}
          onSave={handleSave}
        />
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
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  scrollView: {
    flex: 1,
  },
  previewCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 18,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  previewTitle: {
    color: Colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  previewMeta: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
    marginTop: 4,
  },
  modeTabs: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 5,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    gap: 6,
  },
  modeTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  modeTabActive: {
    backgroundColor: Colors.primary,
  },
  modeTabText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  modeTabTextActive: {
    color: Colors.black,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    gap: 12,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  fieldLabel: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  fieldHint: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
    marginTop: 2,
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: "rgba(248,251,249,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
  },
  multilineInput: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  adSlotOffHint: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: "rgba(248,251,249,0.08)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actions: {
    marginHorizontal: 16,
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.64,
  },
  primaryBtnText: {
    color: Colors.black,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  lockedCard: {
    margin: 16,
    padding: 20,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: "center",
    gap: 8,
  },
  lockedTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  lockedText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
