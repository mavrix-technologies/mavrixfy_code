import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { getSettings, saveSettings } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { setNativeEqualizer, setNativeOriginalSound } from "./NativePlaybackPlayer";
import { EQUALIZER_BANDS, normalizeEqualizer } from "./equalizerConfig";

export type EqualizerSettings = { equalizer: Record<string, number>; equalizerEnabled: boolean; normalizeVolume?: boolean; originalSoundEnabled?: boolean };
let settingsRevision = 0;
export function equalizerSupported(): boolean {
  return !isRunningInExpoGo() && Platform.OS === "android";
}
export function previewEqualizer(settings: EqualizerSettings): void {
  settingsRevision++;
  if (!equalizerSupported()) return;
  const bands = normalizeEqualizer(settings.equalizer);
  setNativeEqualizer(EQUALIZER_BANDS.map(key => bands[key]), settings.equalizerEnabled, settings.normalizeVolume, settings.originalSoundEnabled);
}
export async function saveEqualizer(settings: EqualizerSettings): Promise<void> {
  const safe = { equalizerEnabled: Boolean(settings.equalizerEnabled), equalizer: normalizeEqualizer(settings.equalizer),
    ...(typeof settings.originalSoundEnabled === "boolean" ? { originalSoundEnabled: settings.originalSoundEnabled } : {}),
    ...(typeof settings.normalizeVolume === "boolean" ? { normalizeVolume: settings.normalizeVolume } : {}) };
  previewEqualizer(safe);
  await saveSettings(safe);
}
export async function syncEqualizerWithNative(): Promise<void> {
  const revision = settingsRevision;
  if (!equalizerSupported()) {
    if (Platform.OS === "ios" && !isRunningInExpoGo()) {
      try {
        const settings = await getSettings();
        if (revision === settingsRevision) await setNativeOriginalSound(Boolean(settings.originalSoundEnabled));
      } catch (error) { logger.warn("[Audio] Could not restore Original sound", error); }
    }
    return;
  }
  try {
    const settings = await getSettings();
    if (revision === settingsRevision) previewEqualizer(settings);
  }
  catch (error) { logger.warn("[Equalizer] Could not restore settings", error); }
}
export async function previewOriginalSound(enabled: boolean): Promise<void> {
  // Retire any startup read that began before the explicit user choice.
  settingsRevision++;
  await setNativeOriginalSound(enabled);
}
