import { Linking, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { logger } from "@/lib/logger";
import { getStandardAudioEffects, setStandardAudioBands, setStandardEqualizerEnabled } from "./StandardAudioPlayer";

export interface AudioEffectsState {
  sessionId: number;
  equalizerAvailable: boolean;
  equalizerControl?: boolean;
  equalizerEnabled?: boolean;
  minLevel?: number;
  maxLevel?: number;
  bands?: { id: number; frequency: number; level: number }[];
}

function assertAudioEffectsAvailable(): void {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("Audio effects require an Android or iOS device.");
  }
  if (isRunningInExpoGo()) {
    throw new Error("Equalizer needs an installed Mavrixfy development or release build. Expo Go does not include its native audio engine.");
  }
}

export function getAudioEffects(): Promise<AudioEffectsState> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return Promise.resolve({
      sessionId: 0,
      equalizerAvailable: false,
      equalizerControl: false,
      equalizerEnabled: false,
      bands: [],
    });
  }
  if (isRunningInExpoGo()) {
    return Promise.resolve({
      sessionId: 0,
      equalizerAvailable: false,
      equalizerControl: false,
      equalizerEnabled: false,
      bands: [],
    });
  }
  return Promise.resolve(getStandardAudioEffects());
}

const FREQ_MAP: { key: string; targetHz: number }[] = [
  { key: "60Hz", targetHz: 60 },
  { key: "150Hz", targetHz: 150 },
  { key: "400Hz", targetHz: 400 },
  { key: "1KHz", targetHz: 1000 },
  { key: "2.4KHz", targetHz: 2400 },
  { key: "15KHz", targetHz: 15000 },
];

function findClosestDb(bands: Record<string, number>, targetFreqHz: number): number {
  let closest = FREQ_MAP[0];
  let minDiff = Infinity;
  for (const item of FREQ_MAP) {
    const diff = Math.abs(Math.log10(item.targetHz) - Math.log10(Math.max(1, targetFreqHz)));
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  }
  return bands[closest.key] ?? 0;
}

function levelsForBands(bands: Record<string, number>, state: AudioEffectsState): number[] {
  const minLvl = typeof state.minLevel === "number" ? state.minLevel : -1200;
  const maxLvl = typeof state.maxLevel === "number" ? state.maxLevel : 1200;
  return [...(state.bands ?? [])].sort((left, right) => left.id - right.id).map((band) => {
    const db = findClosestDb(bands, band.frequency);
    return Math.max(minLvl, Math.min(maxLvl, Math.round(db * 100))) / 100;
  });
}

export async function applyEqualizerEnabled(enabled: boolean): Promise<void> {
  assertAudioEffectsAvailable();
  const state = await getAudioEffects();
  if (!state.equalizerAvailable || state.equalizerControl === false) {
    throw new Error("Play a song before changing the equalizer.");
  }
  setStandardEqualizerEnabled(enabled);
}

export async function applyEqualizerBands(bands: Record<string, number>): Promise<void> {
  assertAudioEffectsAvailable();
  const state = await getAudioEffects();
  if (!state.equalizerAvailable || state.equalizerControl === false || !state.bands?.length) {
    throw new Error("Play a song before changing equalizer bands.");
  }
  setStandardAudioBands(levelsForBands(bands, state));
}

export async function syncEqualizerWithNative(customSettings?: {
  equalizerEnabled?: boolean;
  equalizer?: Record<string, number>;
}): Promise<void> {
  if (isRunningInExpoGo() || (Platform.OS !== "android" && Platform.OS !== "ios")) {
    return;
  }
  try {
    const settings = customSettings ?? await (await import("@/lib/storage")).getSettings();

    const state = await getAudioEffects();
    if (state.sessionId > 0 && state.equalizerAvailable) {
      if (settings.equalizer && Array.isArray(state.bands)) {
        setStandardAudioBands(levelsForBands(settings.equalizer, state));
      }
      if (typeof settings.equalizerEnabled === "boolean") {
        setStandardEqualizerEnabled(settings.equalizerEnabled);
      }
    }
  } catch (error) {
    logger.warn("[Equalizer] Could not restore audio settings", error);
  }
}

export async function openDeviceSystemEqualizer(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    await Linking.sendIntent("android.media.action.DISPLAY_AUDIO_EFFECT_CONTROL_PANEL");
    return true;
  } catch {
    return false;
  }
}

export function checkSystemEqualizerAvailable(): Promise<boolean> {
  return Promise.resolve(Platform.OS === "android" && !isRunningInExpoGo());
}
