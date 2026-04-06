import { logEvent as firebaseLogEvent } from "firebase/analytics";
import { analytics } from "./firebase";
import { Platform } from "react-native";

/**
 * Log an analytics event
 * Works on web platform with Firebase Analytics
 * For native (iOS/Android), events are logged to console for development
 */
export function logEvent(eventName: string, params?: Record<string, any>) {
  if (Platform.OS === "web") {
    if (analytics) {
      try {
        firebaseLogEvent(analytics, eventName, params);
      } catch (error) {
        // Silent fail in production
      }
    }
  }
}

/**
 * Log app open event
 */
export function logAppOpen() {
  logEvent("app_open");
}

/**
 * Log screen view event
 */
export function logScreenView(screenName: string, screenClass?: string) {
  logEvent("screen_view", {
    screen_name: screenName,
    screen_class: screenClass || screenName,
  });
}

/**
 * Log user login event
 */
export function logLogin(method: string) {
  logEvent("login", { method });
}

/**
 * Log user signup event
 */
export function logSignUp(method: string) {
  logEvent("sign_up", { method });
}

/**
 * Log search event
 */
export function logSearch(searchTerm: string) {
  logEvent("search", { search_term: searchTerm });
}

/**
 * Log content selection (e.g., song, playlist)
 */
export function logSelectContent(contentType: string, itemId: string) {
  logEvent("select_content", {
    content_type: contentType,
    item_id: itemId,
  });
}
