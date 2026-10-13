import { QueueContent } from "@/components/QueueBottomSheet";
import { router, useIsFocused, useNavigation } from "expo-router";
import { useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/** Reuse queue actions/list while the native stack owns presentation. */
export default function QueueScreen() {
  const focused = useIsFocused();
  const navigation = useNavigation();
  const onClose = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/(tabs)");
  }, [navigation]);
  const onOpenPlayer = useCallback(() => router.dismissTo("/player"), []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#1E1E1E" }}>
      <QueueContent nativeScreen interactionReady={focused} onClose={onClose} onOpenPlayer={onOpenPlayer} />
    </GestureHandlerRootView>
  );
}
