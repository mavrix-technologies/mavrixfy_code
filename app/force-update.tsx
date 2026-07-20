import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.mavrixfy.app";
const APP_STORE_URL = "https://apps.apple.com/app/mavrixfy/id123456789";

export default function ForceUpdateScreen() {
  const openStore = async () => {
    try {
      await Linking.openURL(Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL);
    } catch {
      // The user can retry when a network connection is available.
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download-outline" size={46} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Update required</Text>
        <Text style={styles.message}>
          A newer version of Mavrixfy is ready. Update now to continue listening.
        </Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={openStore}>
          <Text style={styles.buttonText}>Update now</Text>
          <Ionicons name="arrow-forward" size={19} color={Colors.background} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  iconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(29, 185, 84, 0.14)", marginBottom: 28 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "800", textAlign: "center" },
  message: { color: Colors.subtext, fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 12, marginBottom: 30 },
  button: { minWidth: 190, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 24, backgroundColor: Colors.primary },
  buttonText: { color: Colors.background, fontSize: 15, fontWeight: "800" },
});
