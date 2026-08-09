import { useSyncExternalStore } from "react";

export type PlaybackAudioLevels = readonly [number, number, number];

export type PlaybackAudioLevelFrame = {
  levels: PlaybackAudioLevels;
  hasSignal: boolean;
  updatedAt: number;
};

type AudioSampleLike = {
  channels: { frames: number[] }[];
};

type Listener = () => void;

const IDLE_LEVELS: PlaybackAudioLevels = [0.24, 0.32, 0.2];
const SAMPLE_PUBLISH_INTERVAL_MS = 36;
const MAX_SAMPLES_PER_SEGMENT = 96;

const listeners = new Set<Listener>();
let frame: PlaybackAudioLevelFrame = {
  levels: IDLE_LEVELS,
  hasSignal: false,
  updatedAt: 0,
};
let lastSamplePublishedAt = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function clampLevel(value: number): number {
  return Math.max(0.16, Math.min(1, value));
}

function getSegmentLevel(sample: AudioSampleLike, segmentIndex: number): number {
  let squaredTotal = 0;
  let peak = 0;
  let sampleCount = 0;

  sample.channels.forEach((channel) => {
    const segmentSize = Math.ceil(channel.frames.length / 3);
    const start = Math.max(0, segmentIndex * segmentSize);
    const end = Math.min(channel.frames.length, start + segmentSize);
    const stride = Math.max(1, Math.floor((end - start) / MAX_SAMPLES_PER_SEGMENT));

    for (let index = start; index < end; index += stride) {
      const value = channel.frames[index];
      if (!Number.isFinite(value)) continue;

      const magnitude = Math.abs(value);
      squaredTotal += magnitude * magnitude;
      peak = Math.max(peak, magnitude);
      sampleCount += 1;
    }
  });

  if (sampleCount === 0) return IDLE_LEVELS[segmentIndex];

  const rms = Math.sqrt(squaredTotal / sampleCount);
  const amplified = Math.max(rms * 4.2, peak * 0.92);
  return clampLevel(0.16 + Math.min(1, amplified) * 0.84);
}

function smoothLevel(previous: number, next: number): number {
  const nextWeight = next >= previous ? 0.72 : 0.42;
  return clampLevel(previous * (1 - nextWeight) + next * nextWeight);
}

function toAudioLevels(sample: AudioSampleLike): PlaybackAudioLevels {
  const rawLevels: PlaybackAudioLevels = [
    getSegmentLevel(sample, 0),
    getSegmentLevel(sample, 1),
    getSegmentLevel(sample, 2),
  ];

  if (!frame.hasSignal) return rawLevels;

  return [
    smoothLevel(frame.levels[0], rawLevels[0]),
    smoothLevel(frame.levels[1], rawLevels[1]),
    smoothLevel(frame.levels[2], rawLevels[2]),
  ];
}

export function publishPlaybackAudioSample(sample: AudioSampleLike): void {
  const now = Date.now();
  if (now - lastSamplePublishedAt < SAMPLE_PUBLISH_INTERVAL_MS) return;

  lastSamplePublishedAt = now;
  frame = {
    levels: toAudioLevels(sample),
    hasSignal: true,
    updatedAt: now,
  };
  emit();
}

export function resetPlaybackAudioLevels(): void {
  if (!frame.hasSignal && frame.updatedAt === 0) return;

  lastSamplePublishedAt = 0;
  frame = {
    levels: IDLE_LEVELS,
    hasSignal: false,
    updatedAt: 0,
  };
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PlaybackAudioLevelFrame {
  return frame;
}

function usePlaybackAudioLevels(): PlaybackAudioLevelFrame {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
