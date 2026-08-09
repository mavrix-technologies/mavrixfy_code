import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { Typography, Spacing } from "./tokens";

export interface LoadingScreenProps {
  message?: string;
  overlay?: boolean;
}

export function LoadingScreen({ message, overlay = false }: LoadingScreenProps) {
  return (
    <View style={[styles.container, overlay && styles.overlay]}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.background,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 999,
  },
  message: {
    ...Typography.body,
    color: Colors.subtext,
    marginTop: Spacing.md,
    textAlign: "center",
  },
});
