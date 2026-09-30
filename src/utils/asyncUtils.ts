/**
 * Shared asynchronous helper utilities.
 * Consolidated to eliminate exact duplicate timeout logic across network providers.
 */

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 8000,
  errorMessage: string = "Request timeout"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMessage)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (options.signal?.aborted) controller.abort();
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

/** Fetch JSON with a real request deadline. Errors stay distinct from empty results. */
export async function fetchJsonStrict<T>(url: string, signal?: AbortSignal, timeoutMs = 8000): Promise<T> {
  const response = await fetchWithTimeout(url, { signal, headers: { Accept: "application/json" } }, timeoutMs);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function fetchJson<T = any>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    return await fetchJsonStrict<T>(url, signal);
  } catch {
    return null;
  }
}

