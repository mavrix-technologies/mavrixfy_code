import { Platform } from "react-native";

type AnalyticsModule = {
  analytics: unknown;
  logEvent: (analytics: unknown, eventName: string, params?: Record<string, unknown>) => void;
};

let analyticsModulePromise: Promise<AnalyticsModule | null> | null = null;

async function loadAnalyticsModule(): Promise<AnalyticsModule | null> {
  if (Platform.OS !== "web") {
    return null;
  }

  if (!analyticsModulePromise) {
    analyticsModulePromise = (async () => {
      try {
        const [{ getAnalytics, isSupported, logEvent }, firebaseAppModule] = await Promise.all([
          import("firebase/analytics"),
          import("./firebase"),
        ]);

        const supported = await isSupported().catch(() => false);
        if (!supported) {
          return null;
        }

        return {
          analytics: getAnalytics(firebaseAppModule.default),
          logEvent,
        };
      } catch {
        return null;
      }
    })();
  }

  return analyticsModulePromise;
}

/**
 * Log an analytics event.
 * Native builds intentionally no-op here so startup never pulls in the web
 * Firebase Analytics bundle.
 */
export function logEvent(eventName: string, params?: Record<string, unknown>) {
  if (Platform.OS !== "web") {
    return;
  }

  void loadAnalyticsModule()
    .then((module) => {
      if (!module) {
        return;
      }

      module.logEvent(module.analytics, eventName, params);
    })
    .catch(() => {});
}

export function logAppOpen() {
  logEvent("app_open");
}

export function logScreenView(screenName: string, screenClass?: string) {
  logEvent("screen_view", {
    screen_name: screenName,
    screen_class: screenClass || screenName,
  });
}

export function logLogin(method: string) {
  logEvent("login", { method });
}

export function logSignUp(method: string) {
  logEvent("sign_up", { method });
}

export function logSearch(searchTerm: string) {
  logEvent("search", { search_term: searchTerm });
}

export function logSelectContent(contentType: string, itemId: string) {
  logEvent("select_content", {
    content_type: contentType,
    item_id: itemId,
  });
}
