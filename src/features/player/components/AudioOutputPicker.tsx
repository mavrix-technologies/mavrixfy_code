import { memo } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { isRunningInExpoGo } from "expo";
import { requireOptionalNativeModule } from "expo-modules-core";
import { VideoAirPlayButton } from "expo-video";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { showGlobalToast } from "@/utils/globalToast";

const native = Platform.OS === "android" && !isRunningInExpoGo()
  ? requireOptionalNativeModule<{ showAudioOutputPicker?: () => Promise<boolean> }>("MavrixfyPlayback") : null;

export const AudioOutputPicker = memo(function AudioOutputPicker({ color = "#FFFFFF", label = false, compact = false, onTouchActivity }: {
  color?: string; label?: boolean; compact?: boolean; onTouchActivity?: () => void;
}) {
  if (Platform.OS === "web") return null;
  const systemPicker = Platform.OS === "ios" || Number(Platform.Version) >= 34 && Boolean(native?.showAudioOutputPicker);
  const title = systemPicker ? "Output" : "Bluetooth";
  const iconStyle = { width: 48, height: compact ? 32 : 48, alignItems: "center" as const, justifyContent: "center" as const };
  return <View style={{ width: 48, alignItems: "center" }} onTouchStart={onTouchActivity}>
    {Platform.OS === "ios" ? <VideoAirPlayButton style={iconStyle} tint={color} activeTint={color}
      prioritizeVideoDevices={false} onBeginPresentingRoutes={onTouchActivity} accessibilityLabel="Select audio output" /> :
      <Pressable style={iconStyle} accessibilityRole="button" accessibilityLabel={systemPicker ? "Select audio output" : "Open Bluetooth devices"}
        onPress={() => {
          void (systemPicker ? native!.showAudioOutputPicker!().then(shown => { if (!shown) showGlobalToast("Audio output picker is unavailable right now."); })
            : Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS"))
            .catch(() => showGlobalToast("Could not open audio output settings."));
        }}><MaterialCommunityIcons name={systemPicker ? "speaker-wireless" : "bluetooth"} size={20} color={color} /></Pressable>}
    {label && <Text numberOfLines={1} style={{ color, fontSize: 11, fontFamily: "Inter_500Medium" }}>{title}</Text>}
  </View>;
});
