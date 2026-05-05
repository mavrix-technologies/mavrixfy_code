import Constants from "expo-constants";

type ExpoExtra = Record<string, unknown>;

const bundledAppConfig = require("../app.json");
const bundledExtra = (bundledAppConfig?.expo?.extra ?? {}) as ExpoExtra;

export function getExpoExtra(): ExpoExtra {
  try {
    const extra = Constants.expoConfig?.extra;
    if (extra && typeof extra === "object") {
      return extra as ExpoExtra;
    }
  } catch {
    // Standalone builds can throw while resolving expoConfig if the embedded manifest is unavailable.
  }

  try {
    const manifest2Extra = (Constants as any).manifest2?.extra?.expoClient?.extra;
    if (manifest2Extra && typeof manifest2Extra === "object") {
      return manifest2Extra as ExpoExtra;
    }
  } catch {
    // Ignore manifest lookup failures and fall back to the bundled app config.
  }

  try {
    const manifestExtra = (Constants as any).manifest?.extra;
    if (manifestExtra && typeof manifestExtra === "object") {
      return manifestExtra as ExpoExtra;
    }
  } catch {
    // Ignore manifest lookup failures and fall back to the bundled app config.
  }

  return bundledExtra;
}
