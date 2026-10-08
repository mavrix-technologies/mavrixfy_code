import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { getSettings, saveSettings } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { setStandardEqualizer } from "./StandardAudioPlayer";
import { EQUALIZER_BANDS, normalizeEqualizer } from "./equalizerConfig";

export type EqualizerSettings = { equalizer: Record<string, number>; equalizerEnabled: boolean };
let settingsRevision = 0;
export function equalizerSupported(): boolean {
  return !isRunningInExpoGo() && (Platform.OS === "android" || Platform.OS === "ios");
}
export function previewEqualizer(settings: EqualizerSettings): void {
  settingsRevision++;
  if (!equalizerSupported()) return;
  const bands = normalizeEqualizer(settings.equalizer);
  setStandardEqualizer(EQUALIZER_BANDS.map(key => bands[key]), settings.equalizerEnabled);
}
export async function saveEqualizer(settings: EqualizerSettings): Promise<void> {
  const safe = { equalizerEnabled: Boolean(settings.equalizerEnabled), equalizer: normalizeEqualizer(settings.equalizer) };
  previewEqualizer(safe);
  await saveSettings(safe);
}
export async function syncEqualizerWithNative(): Promise<void> {
  if (!equalizerSupported() || settingsRevision > 0) return;
  const revision = settingsRevision;
  try {
    const settings = await getSettings();
    if (revision === settingsRevision) previewEqualizer(settings);
  }
  catch (error) { logger.warn("[Equalizer] Could not restore settings", error); }
}
