/**
 * OfflineScreen — Modern, sleek offline screen with clean typography and Downloads action.
 */

import Colors from "@/constants/colors";
import { useNetwork } from "@/contexts/NetworkContext";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator,Pressable,StyleSheet,Text,View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  /** Override the default message */
  message?: string;
  /** Hide the "Go to Downloads" button */
  hideDownloadsButton?: boolean;
}

export default function OfflineScreen({
  message = "Connect to the internet to stream music and discover new releases.",
  hideDownloadsButton = false,
}: Props) {
  const { recheck, isChecking } = useNetwork();
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.container,
      {
        paddingTop: Math.max(insets.top, 24) + 16,
        paddingBottom: Math.max(insets.bottom, 24) + 16,
      }
    ]}>
      <View style={styles.contentCard}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.primary} style={styles.heroIcon} />

        <Text style={styles.title}>{"You're Offline"}</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.actions}>
          {!hideDownloadsButton && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => router.push("/downloaded-songs")}
            >
              <Ionicons name="arrow-down-circle-outline" size={20} color="#10141A" />
              <Text style={styles.primaryBtnText}>Listen to Downloads</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              isChecking && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}
            onPress={recheck}
            disabled={isChecking}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
            )}
            <Text style={[styles.secondaryBtnText, isChecking && styles.textChecking]}>
              {isChecking ? "Checking Connection…" : "Try Again"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  contentCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  heroIcon: {
    marginBottom: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#26E19A",
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: "#10141A",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  secondaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  textChecking: {
    color: "#26E19A",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});
