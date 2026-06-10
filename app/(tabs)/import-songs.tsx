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
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";

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
    const extension = fileName.toLowerCase().split('.').pop();
    
    if (extension !== 'txt' && extension !== 'csv') {
      Alert.alert("Error", "Please select a TXT or CSV file");
      return;
    }

    router.push({
      pathname: "/import-songs-file",
      params: { 
        fileUri: file.uri,
        fileName: fileName,
      },
    });
  } catch (error: any) {
    Alert.alert("Error", `Failed to pick file: ${error.message || "Unknown error"}`);
  }
}

export default function ImportSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { isHeaderElevated, handleHeaderScroll } = useAppTopHeaderScrollElevation();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.background, "#1a1a1a"]}
        style={StyleSheet.absoluteFill}
      />

      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Import Songs"
        left={<AppTopHeaderProfileButton />}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Icon */}
          <View style={styles.iconWrapper}>
            <Ionicons name="cloud-upload-outline" size={64} color={Colors.primary} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Import Your Songs</Text>
          <Text style={styles.subtitle}>
            Upload a file containing your song list
          </Text>

          {/* Upload Button */}
          <Pressable
            style={({ pressed }) => [
              styles.uploadButton,
              pressed && styles.uploadButtonPressed,
            ]}
            onPress={handleFileImport}
          >
            <LinearGradient
              colors={[Colors.primary, "#667eea"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.uploadButtonGradient}
            >
              <Ionicons name="document-text-outline" size={24} color={Colors.text} />
              <Text style={styles.uploadButtonText}>Choose File</Text>
            </LinearGradient>
          </Pressable>

          {/* Supported Formats */}
          <View style={styles.formatsContainer}>
            <Text style={styles.formatsLabel}>Supported formats:</Text>
            <View style={styles.formatBadges}>
              <View style={styles.formatBadge}>
                <Text style={styles.formatBadgeText}>TXT</Text>
              </View>
              <View style={styles.formatBadge}>
                <Text style={styles.formatBadgeText}>CSV</Text>
              </View>
            </View>
          </View>

          {/* Info Cards */}
          <View style={styles.infoCards}>
            <View style={styles.infoCard}>
              <Ionicons name="list-outline" size={24} color={Colors.primary} />
              <Text style={styles.infoCardTitle}>File Format</Text>
              <Text style={styles.infoCardText}>
                One song per line with artist and title
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="search-outline" size={24} color={Colors.primary} />
              <Text style={styles.infoCardTitle}>Smart Matching</Text>
              <Text style={styles.infoCardText}>
                Automatically finds high-quality versions
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="musical-notes-outline" size={24} color={Colors.primary} />
              <Text style={styles.infoCardTitle}>Auto Import</Text>
              <Text style={styles.infoCardText}>
                Songs added directly to your library
              </Text>
            </View>
          </View>

          {/* Example */}
          <View style={styles.exampleCard}>
            <View style={styles.exampleHeader}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.exampleTitle}>Example Format</Text>
            </View>
            <View style={styles.exampleContent}>
              <Text style={styles.exampleText}>Artist - Song Title</Text>
              <Text style={styles.exampleText}>Ed Sheeran - Shape of You</Text>
              <Text style={styles.exampleText}>The Weeknd - Blinding Lights</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  mainContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  iconWrapper: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 24,
  },
  uploadButton: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
    boxShadow: "none",
  },
  uploadButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  uploadButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 32,
    gap: 12,
  },
  uploadButtonText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  formatsContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  formatsLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
    marginBottom: 8,
  },
  formatBadges: {
    flexDirection: "row",
    gap: 12,
  },
  formatBadge: {
    backgroundColor: "rgba(102, 126, 234, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(102, 126, 234, 0.3)",
  },
  formatBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  infoCards: {
    width: "100%",
    gap: 16,
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  infoCardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  infoCardText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
    lineHeight: 20,
  },
  exampleCard: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  exampleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  exampleTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  exampleContent: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  exampleText: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Colors.subtext,
  },
});
