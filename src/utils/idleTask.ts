/**
 * idleTask.ts
 *
 * Safe replacement for deprecated InteractionManager in React Native 0.86+ / SDK 57+.
 * Uses requestIdleCallback where available, with a lightweight timer fallback.
 */

export function runAfterIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => {
      callback();
    });
    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(handle);
      }
    };
  }

  const timer = setTimeout(callback, 32);
  return () => clearTimeout(timer);
}
