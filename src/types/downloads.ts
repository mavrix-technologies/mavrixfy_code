/**
 * Offline Downloads — Type Definitions
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const DOWNLOAD_DEVICE_LIMIT = 999;
export const MAX_OFFLINE_SONGS = 10_000;
export const LICENSE_REFRESH_INTERVAL_HOURS = 24;
export const LICENSE_GRACE_PERIOD_DAYS = 7;

/** Minimum free storage (bytes) before downloads are paused. */
export const MIN_FREE_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB

// ─── Download Queue State ─────────────────────────────────────────────────────

export type DownloadStatus =
  | "queued"
  | "waiting_for_wifi"
  | "waiting_for_charging"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "expired"
  | "revoked"
  | "deleted";

// ─── Download Quality ─────────────────────────────────────────────────────────

export type DownloadQuality = "low" | "medium" | "high";

// ─── Download Item ────────────────────────────────────────────────────────────

export interface DownloadItem {
  /** Unique song ID. */
  songId: string;
  /** Human-readable title. */
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  /** Remote audio URL used to fetch the file. */
  audioUrl: string;
  /** Duration in seconds. */
  duration: number;

  status: DownloadStatus;
  /** 0–100 */
  progress: number;
  /** Bytes downloaded so far. */
  bytesDownloaded: number;
  /** Total file size in bytes (0 if unknown). */
  totalBytes: number;

  quality: DownloadQuality;
  /** Absolute path to the local file once completed. */
  localPath: string | null;

  /** Collection IDs (playlist / album) that reference this track. */
  collectionRefs: string[];

  /** Number of download retry attempts. */
  retryCount: number;
  /** ISO timestamp of last failure. */
  failedAt: string | null;
  /** Human-readable failure reason. */
  failureReason: string | null;

  /** ISO timestamp when the download was queued. */
  queuedAt: string;
  /** ISO timestamp when the download completed. */
  completedAt: string | null;
  /** ISO timestamp when the license expires. */
  licenseExpiresAt: string | null;
}

// ─── Download Preferences ─────────────────────────────────────────────────────

export interface DownloadPreferences {
  /** Only download on Wi-Fi. */
  wifiOnly: boolean;
  /** Only download while charging. */
  chargingOnly: boolean;
  quality: DownloadQuality;
  /** Automatically delete expired downloads. */
  autoDeleteExpired: boolean;
}

export const DEFAULT_DOWNLOAD_PREFERENCES: DownloadPreferences = {
  wifiOnly: false,
  chargingOnly: false,
  quality: "high",
  autoDeleteExpired: false,
};

// ─── Offline License ──────────────────────────────────────────────────────────

export type LicenseStatus = "active" | "expired" | "revoked" | "pending";

export interface OfflineLicense {
  songId: string;
  deviceId: string;
  status: LicenseStatus;
  /** Rights version copied from the catalog at license creation time. */
  rightsVersion: number;
  expiresAt: string;
  refreshedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
}

// ─── Download Device ──────────────────────────────────────────────────────────

export interface DownloadDevice {
  deviceId: string;
  platform: "android" | "ios" | "web";
  appVersion: string;
  modelName: string;
  registeredAt: string;
  lastLicenseSyncAt: string;
  active: boolean;
  activeDownloadCount: number;
}

// ─── Download Entitlement ─────────────────────────────────────────────────────

export interface DownloadEntitlement {
  canDownload: boolean;
  maxDevices: number;
  maxOfflineSongs: number;
  licenseGracePeriodDays: number;
  /** Reason why downloads are blocked (if canDownload is false). */
  blockedReason?: string;
}

// ─── Catalog Track Rights ─────────────────────────────────────────────────────

export interface TrackRights {
  downloadable: boolean;
  territoryRights: string[];
  drmRequired: boolean;
  offlineAllowed: boolean;
  offlineMaxQuality: DownloadQuality;
  rightsVersion: number;
}

// ─── Storage Summary ──────────────────────────────────────────────────────────

export interface StorageSummary {
  totalDownloadedBytes: number;
  totalDownloadedTracks: number;
  completedTracks: number;
  pendingTracks: number;
  failedTracks: number;
}

// ─── Download Context State ───────────────────────────────────────────────────

export interface DownloadContextState {
  downloads: Record<string, DownloadItem>;
  preferences: DownloadPreferences;
  entitlement: DownloadEntitlement | null;
  storageSummary: StorageSummary;
  isInitialized: boolean;
}
