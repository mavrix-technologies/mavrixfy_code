import AppTopHeader,{
APP_TOP_HEADER_HEIGHT,
AppTopHeaderProfileButton,
useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { NavImportIcon } from "@/components/OfficialNavIcons";
import Colors from "@/constants/colors";
import { IS_IOS,IS_WEB } from "@/constants/platform";
import { triggerImpact } from "@/lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
Alert,
Linking,
Pressable,
ScrollView,
StyleSheet,
Text,
View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EXPORTIFY_URL = "https://exportify.net/";

async function handleOpenExportify() {
  void triggerImpact(ImpactFeedbackStyle.Light);

  try {
    if (IS_WEB) {
      await Linking.openURL(EXPORTIFY_URL);
      return;
    }

    await WebBrowser.openBrowserAsync(EXPORTIFY_URL);
  } catch {
    Alert.alert("Unable to open Exportify", "Open https://exportify.net/ in your browser and export a CSV file.");
  }
}

async function handleFileImport() {
  void triggerImpact(ImpactFeedbackStyle.Medium);

  try {
    const DocumentPicker = await import("expo-document-picker");
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

export function ImportSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = IS_WEB ? 67 : insets.top;
  const bottomInset = IS_WEB ? 24 : insets.bottom;
  const bottomScrollPadding = Math.max(128, bottomInset + 112);
  const { isHeaderElevated, handleHeaderScroll } = useAppTopHeaderScrollElevation();

  return (
    <View style={styles.container}>
      {/* Background base */}
      <LinearGradient
        colors={[Colors.background, Colors.background, Colors.background]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle top ambient glow */}
      <LinearGradient
        colors={[
          "rgba(38, 225, 154, 0.18)",
          "rgba(20, 180, 120, 0.08)",
          "rgba(10, 100, 70, 0.02)",
          "transparent",
        ]}
        locations={[0, 0.45, 0.75, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientGlow}
      />

      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Import"
        left={<AppTopHeaderProfileButton />}
        leftWidth={40}
        rightWidth={40}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 24,
            paddingBottom: bottomScrollPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bounces={IS_IOS}
        alwaysBounceVertical={IS_IOS}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.content}>
          {/* Minimal Icon Card */}
          <View style={styles.heroCard}>
            <NavImportIcon size={46} color={Colors.primary} isFocused />
          </View>

          {/* Clean Title & Subtitle */}
          <Text style={styles.title}>Import Songs</Text>
          <Text style={styles.subtitle}>
            Select a CSV or TXT file to import songs into your library.
          </Text>

          {/* Primary Action Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose CSV or TXT file"
            style={({ pressed }) => [
              styles.chooseButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleFileImport}
          >
            <LinearGradient
              colors={[Colors.primary, "#18B983"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.chooseButtonGradient}
            >
              <Ionicons name="document-text-outline" size={20} color="#06241A" />
              <Text style={styles.chooseButtonText}>Choose File</Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.formatHint}>Supports .csv and .txt</Text>

          {/* Minimal Helper Link for Spotify Exports */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Exportify to export Spotify playlists"
            style={({ pressed }) => [
              styles.exportifyCard,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleOpenExportify}
          >
            <View style={styles.exportifyIcon}>
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.exportifyContent}>
              <Text style={styles.exportifyTitle}>Need to export from Spotify?</Text>
              <Text style={styles.exportifySubtext}>
                Download your playlist CSV at exportify.net
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.inactive} />
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
  ambientGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  heroCard: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "#181C22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    maxWidth: 310,
    color: "rgba(223, 226, 235, 0.65)",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 28,
  },
  chooseButton: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  chooseButtonGradient: {
    minHeight: 54,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  chooseButtonText: {
    color: "#06241A",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  buttonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  formatHint: {
    marginTop: 10,
    marginBottom: 28,
    color: Colors.inactive,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  exportifyCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    gap: 12,
  },
  exportifyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(38, 225, 154, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  exportifyContent: {
    flex: 1,
    minWidth: 0,
  },
  exportifyTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  exportifySubtext: {
    color: Colors.inactive,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});

export default ImportSongsScreen;
