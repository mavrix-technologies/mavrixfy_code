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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function AdminHomeVideoScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomScrollPadding = Platform.OS === "web" ? 110 : Math.max(118, insets.bottom + 112);

  const [config, setConfig] = useState<HomeHeroConfig>(DEFAULT_HOME_HERO_CONFIG);
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
    const title = config.title.trim();
    const videoUrl = config.videoUrl.trim();
    const posterUrl = config.posterUrl.trim();
    const adUnitId = (config.adUnitId || "").trim();

    if (!title) {
      Alert.alert("Title required", "Add a short title for the home video.");
      return;
    }

    if (!adUnitId) {
      if (!isHttpUrl(videoUrl)) {
        Alert.alert("Video URL required", "Add a valid HTTP or HTTPS MP4 video URL or Ad Unit ID.");
        return;
      }

      if (!isHttpUrl(posterUrl)) {
        Alert.alert("Poster URL required", "Add a valid HTTP or HTTPS poster image URL or Ad Unit ID.");
        return;
      }
    }

    setSaving(true);
    try {
      const firstItem = config.items[0] || DEFAULT_HOME_HERO_CONFIG.items[0];
      const nextItems = [
        {
          ...firstItem,
          enabled: true,
          title,
          videoUrl,
          posterUrl,
          adUnitId,
        },
        ...config.items.slice(1),
      ];
      await saveHomeHeroConfig(
        {
          enabled: config.enabled,
          title,
          videoUrl,
          posterUrl,
          adUnitId,
          items: nextItems,
        },
        user?.id
      );
      setConfig({ enabled: config.enabled, title, videoUrl, posterUrl, adUnitId, items: nextItems });
      Alert.alert("Saved", "Home video updated.");
    } catch (error: any) {
      Alert.alert("Could not save", error?.message || "Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [config, user?.id]);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_HOME_HERO_CONFIG);
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
          <Text style={styles.previewMeta}>{config.enabled ? "Visible on Home" : "Hidden on Home"}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.fieldLabel}>Active</Text>
              <Text style={styles.fieldHint}>Show this video at the top of Home.</Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={(enabled) => updateConfig({ enabled })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <Text style={styles.fieldLabel}>Small title</Text>
          <TextInput
            value={config.title}
            onChangeText={(title) => updateConfig({ title })}
            style={styles.input}
            placeholder="COCKTAIL 2"
            placeholderTextColor={Colors.inactive}
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>MP4 video URL</Text>
          <TextInput
            value={config.videoUrl}
            onChangeText={(videoUrl) => updateConfig({ videoUrl })}
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
            onChangeText={(posterUrl) => updateConfig({ posterUrl })}
            style={[styles.input, styles.multilineInput]}
            placeholder="https://..."
            placeholderTextColor={Colors.inactive}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />

          <Text style={styles.fieldLabel}>Native Video Ad Unit ID (Optional)</Text>
          <TextInput
            value={config.adUnitId || ""}
            onChangeText={(adUnitId) => updateConfig({ adUnitId })}
            style={styles.input}
            placeholder="ca-app-pub-3940256099942544/1044960115"
            placeholderTextColor={Colors.inactive}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.secondaryBtn} onPress={handleReset} disabled={saving || loading}>
            <Text style={styles.secondaryBtnText}>Reset default</Text>
          </Pressable>
          <Pressable style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={handleSave} disabled={saving || loading}>
            {saving ? (
              <ActivityIndicator color={Colors.black} />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color={Colors.black} />
                <Text style={styles.primaryBtnText}>Save</Text>
              </>
            )}
          </Pressable>
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
