import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";

const EXPORTIFY_URL = "https://exportify.net/";

const exportSteps = [
  {
    icon: "open-outline",
    title: "Open Exportify",
    text: "Tap Get Started, sign in with Spotify, and approve playlist access.",
  },
  {
    icon: "heart-outline",
    title: "Export Liked Songs",
    text: "Use the Liked Songs row and tap Export to download a CSV file.",
  },
  {
    icon: "list-outline",
    title: "Export a playlist",
    text: "Find the Spotify playlist you want and tap Export on that row.",
  },
  {
    icon: "download-outline",
    title: "Import here",
    text: "Return to Mavrixfy and choose the downloaded CSV or TXT file.",
  },
] as const;

async function handleOpenExportify() {
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);

  try {
    if (Platform.OS === "web") {
      await Linking.openURL(EXPORTIFY_URL);
      return;
    }

    await WebBrowser.openBrowserAsync(EXPORTIFY_URL);
  } catch {
    Alert.alert("Unable to open Exportify", "Open https://exportify.net/ in your browser and export a CSV file.");
  }
}

async function handleFileImport() {
  void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/plain", "text/csv", "application/csv", "text/comma-separated-values"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const file = result.assets[0];

    if (!file.uri) {
      Alert.alert("Error", "Invalid file selected");
      return;
    }

    const fileName = file.name || "file.txt";
    const extension = fileName.toLowerCase().split(".").pop();

    if (extension !== "txt" && extension !== "csv") {
      Alert.alert("Error", "Please select a TXT or CSV file");
      return;
    }

    router.push({
      pathname: "/import-songs-file",
      params: {
        fileUri: file.uri,
        fileName,
      },
    });
  } catch (error: any) {
    Alert.alert("Error", `Failed to pick file: ${error.message || "Unknown error"}`);
  }
}

export default function ImportSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 24 : insets.bottom;
  const bottomScrollPadding = Math.max(128, bottomInset + 112);
  const { isHeaderElevated, handleHeaderScroll } = useAppTopHeaderScrollElevation();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.background, "#10141A", "#111820"]}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />

      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Import"
        left={<AppTopHeaderProfileButton />}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 12,
            paddingBottom: bottomScrollPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bounces={Platform.OS === "ios"}
        alwaysBounceVertical={Platform.OS === "ios"}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.mainContent}>
          <View style={styles.heroIcon}>
            <Ionicons name="cloud-upload-outline" size={28} color={Colors.primary} />
          </View>

          <Text style={styles.title}>Import from Spotify</Text>
          <Text style={styles.subtitle}>
            Export your Spotify playlists or Liked Songs as a CSV, then import it here.
          </Text>

          <View style={styles.actionStack}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open Exportify"
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.actionPressed,
              ]}
              onPress={handleOpenExportify}
            >
              <Ionicons name="open-outline" size={20} color={Colors.text} />
              <View style={styles.actionTextWrap}>
                <Text style={styles.secondaryActionText}>Open Exportify</Text>
                <Text style={styles.secondaryActionSubtext} numberOfLines={1}>
                  exportify.net
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.inactive} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose CSV or TXT file"
              style={({ pressed }) => [
                styles.uploadButton,
                pressed && styles.actionPressed,
              ]}
              onPress={handleFileImport}
            >
              <LinearGradient
                colors={[Colors.primary, "#18B983"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.uploadButtonGradient}
              >
                <Ionicons name="document-text-outline" size={20} color="#06241A" />
                <Text style={styles.uploadButtonText}>Choose CSV / TXT</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <View style={styles.stepsPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Export steps</Text>
              <View style={styles.filePill}>
                <Text style={styles.filePillText}>CSV recommended</Text>
              </View>
            </View>

            <View style={styles.stepList}>
              {exportSteps.map((step, index) => (
                <View key={step.title} style={styles.stepRow}>
                  <View style={styles.stepIndex}>
                    <Text style={styles.stepIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stepIcon}>
                    <Ionicons name={step.icon} size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepText}>{step.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.inactive} />
              <Text style={styles.noteText}>
                Export All downloads a ZIP. Unzip it first, then import one CSV file.
              </Text>
            </View>
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,225,154,0.12)",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.22)",
    marginBottom: 18,
  },
  title: {
    color: Colors.text,
    fontSize: 25,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    maxWidth: 330,
    color: "rgba(223,226,235,0.7)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  actionStack: {
    width: "100%",
    gap: 10,
    marginBottom: 18,
  },
  secondaryAction: {
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(223,226,235,0.06)",
    borderWidth: 1,
    borderColor: "rgba(223,226,235,0.1)",
  },
  actionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  secondaryActionText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  secondaryActionSubtext: {
    marginTop: 2,
    color: Colors.inactive,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  uploadButton: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "none",
  },
  actionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  uploadButtonGradient: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  uploadButtonText: {
    color: "#06241A",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  stepsPanel: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(223,226,235,0.055)",
    borderWidth: 1,
    borderColor: "rgba(223,226,235,0.09)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  panelTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  filePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(38,225,154,0.1)",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.2)",
  },
  filePillText: {
    color: Colors.primary,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  stepList: {
    gap: 14,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(223,226,235,0.08)",
    marginTop: 1,
  },
  stepIndexText: {
    color: Colors.text,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  stepIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,225,154,0.1)",
  },
  stepTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  stepText: {
    marginTop: 3,
    color: "rgba(223,226,235,0.66)",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
  },
  noteRow: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(223,226,235,0.08)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  noteText: {
    flex: 1,
    color: Colors.inactive,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
  },
});
