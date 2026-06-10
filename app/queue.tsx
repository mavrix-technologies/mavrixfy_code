import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { globalQueueSheetRef } from "@/lib/queueRef";

export default function QueueScreen() {
  const router = useRouter();

  useEffect(() => {
    // Open the global queue sheet directly
    globalQueueSheetRef.current?.expand();
    // Redirect to /player screen underneath the sheet
    router.replace({ pathname: "/player", params: { fromQueue: "true" } });
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
});
