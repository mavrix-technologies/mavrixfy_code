export interface AudioEngineCapabilities {
  supportsBackgroundPlayback: boolean;
  supportsLockscreenControls: boolean;
  supportsEqualizer: boolean;
}

export interface IAudioEngine {
  name: string;
  setupPlayer(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

export const AUDIO_ENGINE_KEY = "IAudioEngine";
