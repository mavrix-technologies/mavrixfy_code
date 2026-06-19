/**
 * Enterprise Notification Store — Mavrixfy
 *
 * Single source of truth for the in-app Activity Feed.
 * Architecture:
 *   Push arrives (FCM) → _layout listeners → addNotification()
 *   App opens → loadNotifications() reads AsyncStorage cache + syncs from Firestore
 *   Activity screen → subscribes via subscribeNotifications()
 *   User reads/deletes → persisted locally + synced to Firestore
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "release"
  | "recommendation"
  | "playlist"
  | "system"
  | "feature"
  | "update"
  | "artist"
  | "promotion";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timestamp: string; // ISO string
  read: boolean;
  type: NotificationType;
  priority?: "critical" | "high" | "medium" | "low";
  imageUrl?: string;
  meta?: {
    songId?: string;
    albumId?: string;
    playlistId?: string;
    artistName?: string;
    artistId?: string;
    coverUrl?: string;
    deeplink?: string;
    route?: string;
    imageUrl?: string;
    notificationId?: string; // Firestore notification doc ID (for analytics)
    minAppVersion?: string;
    maxAppVersion?: string;
  };
  // Analytics tracking
  analytics?: {
    deliveredAt?: string;
    openedAt?: string;
    clickedAt?: string;
  };
}

export type NotificationGroup = "today" | "yesterday" | "this_week" | "earlier";

export interface GroupedNotifications {
  today: NotificationItem[];
  yesterday: NotificationItem[];
  this_week: NotificationItem[];
  earlier: NotificationItem[];
}

// ─── State ────────────────────────────────────────────────────────────────────

const CACHE_KEY = "@mavrixfy_notifications_v2";
const MAX_STORED = 100; // Keep last 100

let inMemory: NotificationItem[] = [];
let seeded = false;

// ─── Pub-Sub ──────────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeNotifications(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* silence listener errors */ }
  });
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persist(items: NotificationItem[]): Promise<void> {
  try {
    // Keep newest MAX_STORED only
    const trimmed = items.slice(0, MAX_STORED);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors
  }
}

// ─── Grouping Helper ─────────────────────────────────────────────────────────

export function groupNotifications(items: NotificationItem[]): GroupedNotifications {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);

  const grouped: GroupedNotifications = { today: [], yesterday: [], this_week: [], earlier: [] };

  for (const n of items) {
    const d = new Date(n.timestamp);
    if (d >= todayStart) grouped.today.push(n);
    else if (d >= yesterdayStart) grouped.yesterday.push(n);
    else if (d >= weekStart) grouped.this_week.push(n);
    else grouped.earlier.push(n);
  }

  return grouped;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function dedup(items: NotificationItem[]): NotificationItem[] {
  const seen = new Set<string>();
  return items.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

// ─── Firestore Sync ───────────────────────────────────────────────────────────

/**
 * Sync activity feed from Firestore for the signed-in user.
 * Runs in background — does not block UI.
 * Firestore path: users/{uid}/activityFeed/{notifId}
 */
export async function syncFromFirestore(userId: string): Promise<void> {
  try {
    const [{ db }, { collection, query, orderBy, limit, getDocs }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/firestore"),
    ]);

    const snap = await getDocs(
      query(
        collection(db, "users", userId, "activityFeed"),
        orderBy("timestamp", "desc"),
        limit(50)
      )
    );

    if (snap.empty) return;

    const remote: NotificationItem[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title ?? "",
        body: data.body ?? "",
        timestamp: data.timestamp?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        read: data.read ?? false,
        type: data.type ?? "system",
        priority: data.priority,
        imageUrl: data.imageUrl || data.meta?.imageUrl,
        meta: data.meta ?? {},
        analytics: data.analytics ?? {},
      } as NotificationItem;
    });

    // Merge: remote items take precedence for read state; local-only items are kept
    const localIds = new Set(inMemory.map((n) => n.id));
    const remoteMap = new Map(remote.map((n) => [n.id, n]));

    // Sync deletions: if a local item falls within the time window of fetched remote items
    // and is not present in remoteMap, it was deleted on the server (rolled back).
    if (remote.length > 0) {
      const remoteTimes = remote.map((r) => new Date(r.timestamp).getTime());
      const newestRemote = Math.max(...remoteTimes);
      const oldestRemote = Math.min(...remoteTimes);

      inMemory = inMemory.filter((localItem) => {
        const localTime = new Date(localItem.timestamp).getTime();
        if (localTime >= oldestRemote && localTime <= newestRemote) {
          return remoteMap.has(localItem.id);
        }
        return true;
      });
    }

    // Merge read status from remote into local
    inMemory = inMemory.map((n) => {
      const r = remoteMap.get(n.id);
      return r ? { ...n, read: r.read } : n;
    });

    // Add any remote items not yet in local
    for (const r of remote) {
      if (!localIds.has(r.id)) {
        inMemory.push(r);
      }
    }

    // Sort newest first
    inMemory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    inMemory = dedup(inMemory);

    await persist(inMemory);
    notify();
  } catch {
    // Firestore sync is best-effort — fail silently
  }
}

/**
 * Write a notification event to Firestore activityFeed for the user.
 * This allows cross-device sync.
 */
async function syncItemToFirestore(
  userId: string,
  item: NotificationItem
): Promise<void> {
  try {
    const [{ db }, { doc, setDoc, serverTimestamp }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/firestore"),
    ]);

    await setDoc(
      doc(db, "users", userId, "activityFeed", item.id),
      {
        title: item.title,
        body: item.body,
        timestamp: serverTimestamp(),
        read: item.read,
        type: item.type,
        priority: item.priority ?? "medium",
        meta: item.meta ?? {},
      },
      { merge: true }
    );
  } catch {
    // Best-effort
  }
}

async function syncReadToFirestore(userId: string, id: string): Promise<void> {
  try {
    const [{ db }, { doc, updateDoc }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/firestore"),
    ]);
    await updateDoc(doc(db, "users", userId, "activityFeed", id), { read: true });
  } catch { /* best-effort */ }
}

async function syncDeleteToFirestore(userId: string, id: string): Promise<void> {
  try {
    const [{ db }, { doc, deleteDoc }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/firestore"),
    ]);
    await deleteDoc(doc(db, "users", userId, "activityFeed", id));
  } catch { /* best-effort */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load from AsyncStorage cache on app start */
export async function loadNotifications(): Promise<NotificationItem[]> {
  if (seeded) return inMemory;

  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as NotificationItem[];
      inMemory = dedup(parsed.slice(0, MAX_STORED));
    } else {
      inMemory = [];
    }
  } catch {
    inMemory = [];
  }

  seeded = true;
  notify();
  return inMemory;
}

/** Force reload (reset seed flag to re-read from storage + Firestore) */
export async function reloadNotifications(userId?: string): Promise<NotificationItem[]> {
  seeded = false;
  await loadNotifications();
  if (userId) void syncFromFirestore(userId);
  return inMemory;
}

/** Synchronous in-memory read */
export function getNotifications(): NotificationItem[] {
  return inMemory;
}

/** Unread count */
export function getUnreadNotificationsCount(): number {
  return inMemory.filter((n) => !n.read).length;
}

/**
 * Add a notification from an FCM push.
 * Deduplicates by notificationId in meta to avoid double-adding.
 */
export async function addNotification(
  title: string,
  body: string,
  type: NotificationType,
  meta?: NotificationItem["meta"],
  userId?: string
): Promise<void> {
  // Dedup: check if we already have this notification ID from Firestore
  const existingId = meta?.notificationId;
  if (existingId && inMemory.some((n) => n.meta?.notificationId === existingId)) {
    return;
  }

  const item: NotificationItem = {
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    title,
    body,
    timestamp: new Date().toISOString(),
    read: false,
    type,
    priority: "high",
    imageUrl: meta?.imageUrl,
    meta,
    analytics: { deliveredAt: new Date().toISOString() },
  };

  inMemory = dedup([item, ...inMemory]).slice(0, MAX_STORED);
  await persist(inMemory);
  notify();

  // Sync to Firestore for cross-device
  if (userId) void syncItemToFirestore(userId, item);
}

/** Mark one notification as read + sync */
export async function markNotificationAsRead(
  id: string,
  userId?: string
): Promise<void> {
  inMemory = inMemory.map((n) =>
    n.id === id
      ? { ...n, read: true, analytics: { ...n.analytics, openedAt: new Date().toISOString() } }
      : n
  );
  await persist(inMemory);
  notify();
  if (userId) void syncReadToFirestore(userId, id);
}

/** Mark all as read */
export async function markAllNotificationsAsRead(userId?: string): Promise<void> {
  const now = new Date().toISOString();
  inMemory = inMemory.map((n) =>
    n.read ? n : { ...n, read: true, analytics: { ...n.analytics, openedAt: now } }
  );
  await persist(inMemory);
  notify();
  // Batch sync for all previously unread
  if (userId) {
    for (const n of inMemory) void syncReadToFirestore(userId, n.id);
  }
}

/** Delete a single notification */
export async function deleteNotification(id: string, userId?: string): Promise<void> {
  inMemory = inMemory.filter((n) => n.id !== id);
  await persist(inMemory);
  notify();
  if (userId) void syncDeleteToFirestore(userId, id);
}

/** Clear all notifications */
export async function clearAllNotifications(userId?: string): Promise<void> {
  const toDelete = userId ? [...inMemory] : [];
  inMemory = [];
  await persist(inMemory);
  notify();
  if (userId) {
    for (const n of toDelete) void syncDeleteToFirestore(userId, n.id);
  }
}
