import { Linking, NativeModules, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";

export interface AudioEffectsState {
  sessionId: number;
  equalizerAvailable: boolean;
  equalizerControl?: boolean;
  equalizerEnabled?: boolean;
  equalizerActive?: boolean;
  equalizerError?: string;
  minLevel?: number;
  maxLevel?: number;
  currentPreset?: number;
  bands?: { id: number; frequency: number; level: number }[];
  presets?: { id: number; name: string }[];
  surroundAvailable: boolean;
  surroundSupported?: boolean;
  surroundControl?: boolean;
  surroundEnabled?: boolean;
  surroundActive?: boolean;
  surroundError?: string;
  strengthSupported?: boolean;
  strength?: number;
  headphonesConnected?: boolean;
}

export type AudioEffectCommand = "equalizer" | "band" | "preset" | "reset" | "surround" | "strength";

interface AudioEffectsModule {
  getAudioEffects(): Promise<AudioEffectsState>;
  updateAudioEffect(command: AudioEffectCommand, value: number, band: number, sessionId: number): Promise<AudioEffectsState>;
}

function getModule(): AudioEffectsModule {
  if (Platform.OS !== "android" && Platform.OS !== "ios") throw new Error("Audio effects require the Android or iOS app.");
  if (isRunningInExpoGo()) throw new Error("Audio effects require a native app build, not Expo Go.");
  const module = NativeModules.TrackPlayerModule as Partial<AudioEffectsModule> | undefined;
  if (!module?.getAudioEffects || !module.updateAudioEffect) {
    throw new Error("Install a new native build to use the equalizer and surround controls.");
  }
  return module as AudioEffectsModule;
}

export function getAudioEffects(): Promise<AudioEffectsState> {
  try { return getModule().getAudioEffects(); } catch (error) { return Promise.reject(error); }
}

export async function updateAudioEffect(
  state: AudioEffectsState,
  command: AudioEffectCommand,
  value = 0,
  band = 0
): Promise<AudioEffectsState> {
  if (!Number.isFinite(value) || !Number.isInteger(band) || !Number.isInteger(state.sessionId) || state.sessionId <= 0) {
    throw new Error("Play a song before changing audio effects.");
  }
  return getModule().updateAudioEffect(command, Math.round(value), band, state.sessionId);
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

export async function applyEqualizerEnabled(enabled: boolean): Promise<void> {
  try {
    const state = await getAudioEffects();
    if (state.sessionId > 0) {
      await updateAudioEffect(state, "equalizer", enabled ? 1 : 0);
    }
  } catch {
    // Fail silently if audio session is not ready
  }
}

export async function applyEqualizerBands(bands: Record<string, number>): Promise<void> {
  try {
    const state = await getAudioEffects();
    if (state.sessionId > 0 && Array.isArray(state.bands)) {
      const minLvl = typeof state.minLevel === "number" ? state.minLevel : -1200;
      const maxLvl = typeof state.maxLevel === "number" ? state.maxLevel : 1200;

      for (const b of state.bands) {
        const db = findClosestDb(bands, b.frequency);
        const millibels = Math.max(minLvl, Math.min(maxLvl, Math.round(db * 100)));
        await updateAudioEffect(state, "band", millibels, b.id);
      }
    }
  } catch {
    // Fail silently if audio session is not ready
  }
}

export async function applySurroundSoundEnabled(enabled: boolean): Promise<void> {
  try {
    const state = await getAudioEffects();
    if (state.sessionId > 0) {
      await updateAudioEffect(state, "surround", enabled ? 1 : 0);
    }
  } catch {
    // Fail silently if audio session is not ready
  }
}

export async function applySurroundStrength(strength: number): Promise<void> {
  try {
    const state = await getAudioEffects();
    if (state.sessionId > 0) {
      const clamped = Math.max(0, Math.min(400, Math.round(strength)));
      await updateAudioEffect(state, "strength", clamped);
    }
  } catch {
    // Fail silently if audio session is not ready
  }
}

export async function syncEqualizerWithNative(customSettings?: {
  equalizerEnabled?: boolean;
  equalizer?: Record<string, number>;
  surroundSoundEnabled?: boolean;
  surroundStrength?: number;
}): Promise<void> {
  try {
    let settings = customSettings;
    if (!settings) {
      try {
        const storage = require("@/lib/storage");
        if (storage?.getSettings) {
          settings = await storage.getSettings();
        }
      } catch {
        // Graceful fallback
      }
    }
    if (!settings) return;

    const state = await getAudioEffects();
    if (state.sessionId > 0) {
      if (typeof settings.equalizerEnabled === "boolean") {
        await updateAudioEffect(state, "equalizer", settings.equalizerEnabled ? 1 : 0);
      }
      if (settings.equalizer && Array.isArray(state.bands)) {
        const minLvl = typeof state.minLevel === "number" ? state.minLevel : -1200;
        const maxLvl = typeof state.maxLevel === "number" ? state.maxLevel : 1200;
        for (const b of state.bands) {
          const db = findClosestDb(settings.equalizer, b.frequency);
          const millibels = Math.max(minLvl, Math.min(maxLvl, Math.round(db * 100)));
          await updateAudioEffect(state, "band", millibels, b.id);
        }
      }
      if (typeof settings.surroundSoundEnabled === "boolean") {
        await updateAudioEffect(state, "surround", settings.surroundSoundEnabled ? 1 : 0);
        if (settings.surroundSoundEnabled) {
          const strength = typeof settings.surroundStrength === "number" ? Math.min(400, settings.surroundStrength) : 350;
          await updateAudioEffect(state, "strength", strength);
        }
      }
    }
  } catch {
    // Graceful fallback
  }
}

export async function openDeviceSystemEqualizer(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    await Linking.sendIntent("android.media.action.DISPLAY_AUDIO_EFFECT_CONTROL_PANEL");
    return true;
  } catch {
    try {
      await Linking.sendIntent("android.settings.SOUND_SETTINGS");
      return true;
    } catch {
      return false;
    }
  }
}

export async function openDeviceSoundSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("Device sound settings are only available on Android.");
  }
  await Linking.sendIntent("android.settings.SOUND_SETTINGS");
}

export async function checkSystemEqualizerAvailable(): Promise<boolean> {
  if (Platform.OS !== "android" || isRunningInExpoGo()) return false;
  return true;
}
