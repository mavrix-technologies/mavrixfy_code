import { NativeEventEmitter, NativeModules, Platform } from "react-native";

type NativeFullPlayerModule = {
  present: (options: {
    url: string;
    startPositionSeconds?: number;
    shouldPlay?: boolean;
  }) => Promise<void>;
  dismiss: () => Promise<void>;
};

export type IOSNativeFullPlayerCloseEvent = {
  reason?: string;
  currentTimeSeconds?: number;
  durationSeconds?: number;
  wasPlaying?: boolean;
};

const nativeModule: NativeFullPlayerModule | null =
  Platform.OS === "ios" ? (NativeModules.MavrixfyAVPlayer as NativeFullPlayerModule | undefined) ?? null : null;

const nativeEmitter =
  Platform.OS === "ios" && nativeModule ? new NativeEventEmitter(NativeModules.MavrixfyAVPlayer) : null;

export function isIOSNativeFullPlayerAvailable(): boolean {
  return Platform.OS === "ios" && nativeModule !== null;
}

export async function presentIOSNativeFullPlayer(options: {
  url: string;
  startPositionSeconds?: number;
  shouldPlay?: boolean;
}): Promise<void> {
  if (!nativeModule) {
    throw new Error("Native iOS full player is not available in this runtime.");
  }

  await nativeModule.present(options);
}

export async function dismissIOSNativeFullPlayer(): Promise<void> {
  if (!nativeModule) {
    return;
  }

  await nativeModule.dismiss();
}

export function addIOSNativeFullPlayerCloseListener(
  listener: (event: IOSNativeFullPlayerCloseEvent) => void
) {
  if (!nativeEmitter) {
    return { remove() {} };
  }

  return nativeEmitter.addListener("MavrixfyAVPlayerDidClose", listener);
}

export function addIOSNativeFullPlayerErrorListener(listener: (event: { message?: string }) => void) {
  if (!nativeEmitter) {
    return { remove() {} };
  }

  return nativeEmitter.addListener("MavrixfyAVPlayerError", listener);
}
