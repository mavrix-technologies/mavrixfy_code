import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function PlaylistLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "default",
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[id]"
        dangerouslySingular={() => "playlist-details"}
      />
    </Stack>
  );
}
