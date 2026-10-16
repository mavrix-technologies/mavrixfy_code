import { logger } from "@/lib/logger";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";

function reportSplashError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message.includes("No native splash screen registered")) {
    logger.warn(`[Launch] ${action}`, error);
  }
}

// Register at module load, before React renders. The JS overlay owns the exit fade.
const nativeSplashReady = SplashScreen.preventAutoHideAsync().catch(error => {
  reportSplashError("Could not retain native splash", error);
});

if (Constants.executionEnvironment !== "storeClient" && Constants.appOwnership !== "expo") {
  SplashScreen.setOptions({ fade: false, duration: 0 });
}

let hideRequest: Promise<void> | undefined;

/** One handoff shared by startup and error recovery, including failed retention. */
export function hideNativeSplash(reason: string): Promise<void> {
  hideRequest ??= nativeSplashReady
    .then(() => SplashScreen.hideAsync())
    .catch(error => reportSplashError(`Could not hide native splash (${reason})`, error));
  return hideRequest;
}
