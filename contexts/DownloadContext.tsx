/**
 * Download Context — global React state for the download system.
 *
 * Performance design:
 * - `downloadsRef` holds the live map (no re-render on progress ticks).
 * - `statusMap` is a separate state that only holds songId→status strings.
 *   It updates only when a status changes, not on every progress byte.
 * - `DownloadButton` reads from `downloadsRef` directly for progress values
 *   and subscribes to `statusMap` for re-render triggers.
 * - The full `downloads` state is only used by the Downloads screen.
 */

import React, {
  createContext,
  use,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
  useSyncExternalStore,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { Song } from "@/lib/musicData";
import {
  DownloadItem,
  DownloadPreferences,
  DownloadEntitlement,
  StorageSummary,
  DownloadStatus,
  DEFAULT_DOWNLOAD_PREFERENCES,
} from "@/types/downloads";
import {
  getAllDownloads,
  downloadSong,
  downloadCollection,
  pauseSongDownload,
  resumeSongDownload,
  retrySongDownload,
  removeSongDownload,
  removeAllDownloads,
  syncLicenses,
  getStorageSummary,
  getLocalPlaybackUrl,
  onQueueEvent,
  DownloadResult,
} from "@/lib/downloads/downloadManager";
import {
  loadDownloadPreferences,
  saveDownloadPreferences,
} from "@/lib/downloads/downloadStore";
import { getDownloadEntitlement } from "@/lib/downloads/entitlement";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";

const subscribeToAppStateChanges = (listener: (state: AppStateStatus) => void) => {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
};

// ─── External store for per-song download items ───────────────────────────────
// Components subscribe to individual song IDs, not the whole map.
// This means a progress update for song A never re-renders a row showing song B.

type Listener = () => void;

const downloadItemStore = {
  _items: new Map<string, DownloadItem>(),
  _listeners: new Map<string, Set<Listener>>(),

  get(songId: string): DownloadItem | null {
    return this._items.get(songId) ?? null;
  },

  set(songId: string, item: DownloadItem) {
    this._items.set(songId, item);
    this._listeners.get(songId)?.forEach((fn) => fn());
  },

  delete(songId: string) {
    this._items.delete(songId);
    this._listeners.get(songId)?.forEach((fn) => fn());
  },

  subscribe(songId: string, fn: Listener): () => void {
    if (!this._listeners.has(songId)) {
      this._listeners.set(songId, new Set());
    }
    this._listeners.get(songId)!.add(fn);
    return () => {
      this._listeners.get(songId)?.delete(fn);
    };
  },

  getSnapshot(songId: string): DownloadItem | null {
    return this._items.get(songId) ?? null;
  },

  seed(items: DownloadItem[]) {
    for (const item of items) {
      this._items.set(item.songId, item);
    }
  },

  getAll(): DownloadItem[] {
    return Array.from(this._items.values());
  },
};

// ─── Context value ────────────────────────────────────────────────────────────

interface DownloadContextValue {
  preferences: DownloadPreferences;
  entitlement: DownloadEntitlement | null;
  storageSummary: StorageSummary;
  isInitialized: boolean;

  // Actions
  downloadSong: (song: Song, options?: { collectionId?: string }) => Promise<DownloadResult>;
  downloadCollection: (
    songs: Song[],
    collectionId: string
  ) => Promise<{ queued: number; skipped: number; failed: number }>;
  pauseDownload: (songId: string) => Promise<void>;
  resumeDownload: (songId: string) => Promise<void>;
  retryDownload: (songId: string) => Promise<void>;
  removeDownload: (songId: string, collectionId?: string) => Promise<void>;
  removeAllDownloads: () => Promise<void>;
  updatePreferences: (patch: Partial<DownloadPreferences>) => Promise<void>;
  refreshSummary: () => Promise<void>;
  refreshDownloads: () => Promise<void>;

  // Queries (read from store directly — no re-render cost)
  getDownload: (songId: string) => DownloadItem | null;
  isDownloaded: (songId: string) => boolean;
  isDownloading: (songId: string) => boolean;
  getLocalUrl: (songId: string) => Promise<string | null>;

  // For the Downloads screen — snapshot of all items
  getAllDownloadItems: () => DownloadItem[];
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DownloadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const [preferences, setPreferences] = useState<DownloadPreferences>(
    DEFAULT_DOWNLOAD_PREFERENCES
  );
  const [entitlement, setEntitlement] = useState<DownloadEntitlement | null>(null);
  const [storageSummary, setStorageSummary] = useState<StorageSummary>({
    totalDownloadedBytes: 0,
    totalDownloadedTracks: 0,
    completedTracks: 0,
    pendingTracks: 0,
    failedTracks: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // ─── Refresh Downloads (merges YouTube + JioSaavn) ────────────────────────
  const refreshDownloads = useCallback(async () => {
    try {
      const [jioItems, summary] = await Promise.all([
        getAllDownloads(),
        getStorageSummary(),
      ]);

      let ytItems: DownloadItem[] = [];
      try {
        const { getAllDownloads: getAllYtDownloads } = await import("@/lib/offlineDownloadService");
        const ytDownloaded = await getAllYtDownloads();
        ytItems = ytDownloaded.map(ytSong => ({
          songId: ytSong.songId || `youtube_${ytSong.videoId}`,
          title: ytSong.title,
          artist: ytSong.artist,
          album: "YouTube Music",
          coverUrl: ytSong.thumbnail,
          audioUrl: "",
          duration: ytSong.duration,
          status: "completed" as const,
          progress: 1.0,
          bytesDownloaded: ytSong.filesize,
          totalBytes: ytSong.filesize,
          quality: "high" as const,
          localPath: ytSong.localUri,
          collectionRefs: [],
          retryCount: 0,
          failedAt: null,
          failureReason: null,
          queuedAt: new Date(ytSong.downloadedAt).toISOString(),
          completedAt: new Date(ytSong.downloadedAt).toISOString(),
          licenseExpiresAt: null,
        }));
      } catch (ytErr) {
        logger.error("[DownloadContext] failed to load YouTube downloads", ytErr);
      }

      // Seed all items to the store
      const allItems = [...jioItems, ...ytItems];
      downloadItemStore.seed(allItems);

      // Recalculate storage summary to include YouTube songs
      const totalYtBytes = ytItems.reduce((sum, item) => sum + item.bytesDownloaded, 0);
      const totalYtCount = ytItems.length;

      const mergedSummary: StorageSummary = {
        totalDownloadedBytes: summary.totalDownloadedBytes + totalYtBytes,
        totalDownloadedTracks: summary.totalDownloadedTracks + totalYtCount,
        completedTracks: summary.completedTracks + totalYtCount,
        pendingTracks: summary.pendingTracks,
        failedTracks: summary.failedTracks,
      };

      setStorageSummary(mergedSummary);
    } catch (err) {
      logger.error("[DownloadContext] refreshDownloads failed", err);
    }
  }, []);

  // ─── Initialization ─────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const prefs = await loadDownloadPreferences();
        if (isMounted) {
          setPreferences(prefs);
        }
        await refreshDownloads();
        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (err) {
        if (isMounted) {
          logger.error("[DownloadContext] initialize failed", err);
          setIsInitialized(true);
        }
      }
    };

    void initialize();

    return () => {
      isMounted = false;
    };
  }, [refreshDownloads]);



  // ─── Entitlement refresh ────────────────────────────────────────────────────

  useEffect(() => {
    if (!uid) { setEntitlement(null); return; }
    getDownloadEntitlement(uid)
      .then(setEntitlement)
      .catch(() => setEntitlement(null));
  }, [uid]);

  // ─── Queue event subscriptions ──────────────────────────────────────────────
  // Progress events update the store but do NOT trigger a React state update.
  // Status changes update the store AND notify per-song subscribers.

  useEffect(() => {
    const unsubs = [
      // Progress: update store only — no setState, no re-render cascade.
      onQueueEvent("progress", (songId, item) => {
        downloadItemStore.set(songId, item);
      }),

      // Status change: update store (subscribers re-render their own row).
      onQueueEvent("status", (songId, item) => {
        downloadItemStore.set(songId, item);
      }),

      onQueueEvent("completed", (songId, item) => {
        downloadItemStore.set(songId, item);
        if (uid) {
          import("@/lib/downloads/downloadManager")
            .then(({ onDownloadCompleted }) => onDownloadCompleted(uid, songId, 1))
            .catch(() => {});
        }
        refreshDownloads();
      }),

      onQueueEvent("failed", (songId, item) => {
        downloadItemStore.set(songId, item);
        if (uid) {
          import("@/lib/downloads/downloadManager")
            .then(({ onDownloadFailed }) =>
              onDownloadFailed(uid, songId, item.failureReason ?? "unknown")
            )
            .catch(() => {});
        }
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [uid, refreshDownloads]);

  // ─── License sync on app foreground ────────────────────────────────────────

  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    if (!uid) return;

    const handleAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastSyncRef.current < 60 * 60 * 1000) return;
      lastSyncRef.current = now;

      syncLicenses(uid)
        .then(() => getAllDownloads())
        .then((items) => {
          for (const item of items) downloadItemStore.set(item.songId, item);
        })
        .catch(() => {});
    };

    return subscribeToAppStateChanges(handleAppState);
  }, [uid]);

  // ─── Storage summary ────────────────────────────────────────────────────────

  const refreshSummary = useCallback(async () => {
    await refreshDownloads();

  }, [refreshDownloads]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const prefsRef = useRef(preferences);
  useEffect(() => { prefsRef.current = preferences; }, [preferences]);

  const handleDownloadSong = useCallback(
    async (song: Song, options?: { collectionId?: string }): Promise<DownloadResult> => {
      if (!uid) return { ok: false, reason: "Sign in to download songs." };
      return downloadSong(song, uid, prefsRef.current, options);
    },
    [uid]
  );

  const handleDownloadCollection = useCallback(
    async (songs: Song[], collectionId: string) => {
      if (!uid) return { queued: 0, skipped: 0, failed: songs.length };
      return downloadCollection(songs, collectionId, uid, prefsRef.current);
    },
    [uid]
  );

  const handlePause = useCallback(async (songId: string) => {
    await pauseSongDownload(songId);
  }, []);

  const handleResume = useCallback(async (songId: string) => {
    await resumeSongDownload(songId, prefsRef.current);
  }, []);

  const handleRetry = useCallback(async (songId: string) => {
    await retrySongDownload(songId, prefsRef.current);
  }, []);

  const handleRemove = useCallback(async (songId: string, collectionId?: string) => {
    const isYt = songId.startsWith("youtube_") || songId.startsWith("yt:") || downloadItemStore.get(songId)?.album === "YouTube Music";
    if (isYt) {
      const videoId = songId.replace("youtube_", "").replace("yt:", "");
      try {
        const { deleteDownload } = await import("@/lib/offlineDownloadService");
        await deleteDownload(videoId);
      } catch (err) {
        logger.error("[DownloadContext] failed to delete YouTube download", err);
      }
      downloadItemStore.delete(songId);
      await refreshDownloads();
      return;
    }
    await removeSongDownload(songId, collectionId);
    downloadItemStore.delete(songId);
    refreshSummary();
  }, [refreshDownloads, refreshSummary]);

  const handleRemoveAll = useCallback(async () => {
    try {
      const { clearAllDownloads } = await import("@/lib/offlineDownloadService");
      await clearAllDownloads();
    } catch (err) {
      logger.error("[DownloadContext] failed to clear YouTube downloads", err);
    }
    await removeAllDownloads();
    // Clear the store
    for (const item of downloadItemStore.getAll()) {
      downloadItemStore.delete(item.songId);
    }
    await refreshDownloads();
  }, [refreshDownloads, refreshSummary]);

  const handleUpdatePreferences = useCallback(
    async (patch: Partial<DownloadPreferences>) => {
      const updated = { ...prefsRef.current, ...patch };
      setPreferences(updated);
      await saveDownloadPreferences(updated);
    },
    []
  );

  // ─── Queries (stable — no dependency on downloads state) ────────────────────

  const getDownload = useCallback(
    (songId: string): DownloadItem | null => downloadItemStore.get(songId),
    []
  );

  const isDownloaded = useCallback(
    (songId: string): boolean => downloadItemStore.get(songId)?.status === "completed",
    []
  );

  const isDownloading = useCallback((songId: string): boolean => {
    const status = downloadItemStore.get(songId)?.status;
    return (
      status === "downloading" ||
      status === "queued" ||
      status === "waiting_for_wifi" ||
      status === "waiting_for_charging"
    );
  }, []);

  const getLocalUrl = useCallback(
    async (songId: string): Promise<string | null> => getLocalPlaybackUrl(songId),
    []
  );

  const getAllDownloadItems = useCallback(
    (): DownloadItem[] => downloadItemStore.getAll(),
    []
  );

  // ─── Context value — stable, only changes when non-download state changes ───

  const value = useMemo<DownloadContextValue>(
    () => ({
      preferences,
      entitlement,
      storageSummary,
      isInitialized,
      downloadSong: handleDownloadSong,
      downloadCollection: handleDownloadCollection,
      pauseDownload: handlePause,
      resumeDownload: handleResume,
      retryDownload: handleRetry,
      removeDownload: handleRemove,
      removeAllDownloads: handleRemoveAll,
      updatePreferences: handleUpdatePreferences,
      refreshSummary,
      refreshDownloads,
      getDownload,
      isDownloaded,
      isDownloading,
      getLocalUrl,
      getAllDownloadItems,
    }),
    // Intentionally excludes downloads map — components subscribe per-song via store
    [
      preferences,
      entitlement,
      storageSummary,
      isInitialized,
      handleDownloadSong,
      handleDownloadCollection,
      handlePause,
      handleResume,
      handleRetry,
      handleRemove,
      handleRemoveAll,
      handleUpdatePreferences,
      refreshSummary,
      refreshDownloads,
      getDownload,
      isDownloaded,
      isDownloading,
      getLocalUrl,
      getAllDownloadItems,
    ]
  );

  return (
    <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useDownloads(): DownloadContextValue {
  const ctx = use(DownloadContext);
  if (!ctx) throw new Error("useDownloads must be used within DownloadProvider");
  return ctx;
}

export function useDownloadsSafe(): DownloadContextValue | null {
  return use(DownloadContext);
}

/**
 * Subscribe to a single song's download item.
 * Only re-renders the component when THAT song's state changes.
 * Progress ticks for other songs are completely invisible to this component.
 */
export function useSongDownload(songId: string): DownloadItem | null {
  return useSyncExternalStore(
    (fn) => downloadItemStore.subscribe(songId, fn),
    () => downloadItemStore.getSnapshot(songId),
    () => null
  );
}
