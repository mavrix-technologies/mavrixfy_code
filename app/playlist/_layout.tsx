import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function PlaylistLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "none",
        // Root stack handles swipe-back; nested gestures caused a double pop animation.
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[id]"
        options={{ gestureEnabled: false }}
        dangerouslySingular={() => "playlist-details"}
      />
    </Stack>
  );
}
