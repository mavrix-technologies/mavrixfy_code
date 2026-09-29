import Colors from "@/constants/colors";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator,StyleSheet,View } from "react-native";

export function QueueScreen() {
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
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default QueueScreen;
