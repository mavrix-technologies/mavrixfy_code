/**
 * OfflineScreen — full-screen offline state with a "Go to Downloads" CTA.
 * Use this for screens that are completely unusable without internet.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useNetwork } from "@/contexts/NetworkContext";
import Colors from "@/constants/colors";

interface Props {
  /** Override the default message */
  message?: string;
  /** Hide the "Go to Downloads" button */
  hideDownloadsButton?: boolean;
}

export default function OfflineScreen({
  message = "You're offline. Connect to the internet to browse music.",
  hideDownloadsButton = false,
}: Props) {
  const { recheck, isChecking } = useNetwork();

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={64} color="rgba(255,255,255,0.25)" />
      </View>

      <Text style={styles.title}>No Internet</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.actions}>
        {!hideDownloadsButton && (
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/downloaded-songs")}
          >
            <Ionicons name="download-outline" size={18} color={Colors.background} />
            <Text style={styles.primaryBtnText}>Go to Downloads</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.secondaryBtn, isChecking && styles.btnDisabled]}
          onPress={recheck}
          disabled={isChecking}
        >
          <Ionicons
            name="refresh-outline"
            size={16}
            color={isChecking ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)"}
          />
          <Text style={[styles.secondaryBtnText, isChecking && styles.textDisabled]}>
            {isChecking ? "Checking…" : "Try again"}
          </Text>
        </Pressable>
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
    paddingHorizontal: 32,
    gap: 12,
  },
  iconWrap: {
    marginBottom: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  message: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: Colors.background,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryBtnText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  textDisabled: {
    color: "rgba(255,255,255,0.3)",
  },
});
