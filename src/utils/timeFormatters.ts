import { mapFilter } from "@/lib/arrayUtils";

/**
 * Normalizes various raw duration representations (seconds, milliseconds, "MM:SS", "HH:MM:SS")
 * into a finite number of seconds.
 */
export function toDurationSeconds(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const normalized = Math.max(0, raw);
    return normalized > 10000 ? normalized / 1000 : normalized;
  }

  if (typeof raw !== "string") return 0;
  const value = raw.trim();
  if (!value) return 0;

  if (value.includes(":")) {
    const parts = mapFilter(
      value.split(":"),
      (part) => Number(part.trim()),
      (part) => Number.isFinite(part) && part >= 0
    );

    if (parts.length >= 2) {
      let total = 0;
      for (const part of parts) {
        total = total * 60 + part;
      }
      return Math.max(0, total);
    }
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.max(0, parsed);
  return normalized > 10000 ? normalized / 1000 : normalized;
}

/**
 * Formats a duration in seconds to "M:SS" or "0:00".
 */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
