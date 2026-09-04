/**
 * Shared asynchronous helper utilities.
 * Consolidated to eliminate exact duplicate timeout logic across network providers.
 */

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 8000,
  errorMessage: string = "Request timeout"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
}

export async function fetchJson<T = any>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

