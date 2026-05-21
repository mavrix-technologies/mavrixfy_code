/**
 * License Sync — Firestore license refresh, revocation, expiry, and rights-version checks.
 *
 * Per the PRD, Firestore writes are allowed ONLY for:
 *   - Download completed
 *   - Download failed
 *   - Download expired or revoked
 *   - License refresh
 *   - Device registration or removal
 *
 * Byte-level progress, per-segment progress, queue heartbeats, and transient
 * pause/resume events must NEVER be written to Firestore.
 */

import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  OfflineLicense,
  LicenseStatus,
  DownloadDevice,
  LICENSE_REFRESH_INTERVAL_HOURS,
  LICENSE_GRACE_PERIOD_DAYS,
} from "@/types/downloads";
import { logger } from "@/lib/logger";
import { getDeviceId, getDeviceInfo } from "@/lib/downloads/deviceInfo";

// ─── License helpers ──────────────────────────────────────────────────────────

function licenseRef(uid: string, songId: string) {
  return doc(db!, "users", uid, "offlineLicenses", songId);
}

function deviceRef(uid: string, deviceId: string) {
  return doc(db!, "users", uid, "downloadDevices", deviceId);
}

/** Compute an expiry ISO string from now + hours. */
function expiresAt(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// ─── Device registration ──────────────────────────────────────────────────────

/** Register this device in Firestore if not already registered. */
export async function registerDevice(uid: string): Promise<string> {
  const deviceId = await getDeviceId();
  if (!db) return deviceId;

  try {
    const ref = deviceRef(uid, deviceId);
    const snap = await getDoc(ref);

    const info = await getDeviceInfo();

    if (!snap.exists()) {
      const device: Omit<DownloadDevice, "activeDownloadCount"> = {
        deviceId,
        platform: info.platform,
        appVersion: info.appVersion,
        modelName: info.modelName,
        registeredAt: new Date().toISOString(),
        lastLicenseSyncAt: new Date().toISOString(),
        active: true,
      };
      await setDoc(ref, { ...device, activeDownloadCount: 0 });
    } else {
      // Update last sync time and app version on each registration call.
      await setDoc(
        ref,
        {
          lastLicenseSyncAt: serverTimestamp(),
          appVersion: info.appVersion,
          active: true,
        },
        { merge: true }
      );
    }
  } catch (err) {
    logger.error("[LicenseSync] registerDevice failed", err);
  }

  return deviceId;
}

/** Remove a device registration from Firestore. */
export async function unregisterDevice(uid: string, deviceId: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(deviceRef(uid, deviceId));
  } catch (err) {
    logger.error("[LicenseSync] unregisterDevice failed", err);
  }
}

/** Fetch all registered devices for a user. */
export async function getRegisteredDevices(uid: string): Promise<DownloadDevice[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, "users", uid, "downloadDevices"));
    return snap.docs.map((d) => d.data() as DownloadDevice);
  } catch (err) {
    logger.error("[LicenseSync] getRegisteredDevices failed", err);
    return [];
  }
}

// ─── License write events (allowed Firestore writes) ─────────────────────────

/** Write a "completed" license event to Firestore. */
export async function writeLicenseCompleted(
  uid: string,
  songId: string,
  rightsVersion: number
): Promise<void> {
  if (!db) return;
  try {
    const deviceId = await getDeviceId();
    const license: OfflineLicense = {
      songId,
      deviceId,
      status: "active",
      rightsVersion,
      expiresAt: expiresAt(LICENSE_REFRESH_INTERVAL_HOURS),
      refreshedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failedAt: null,
      failureCode: null,
    };
    await setDoc(licenseRef(uid, songId), license);
  } catch (err) {
    logger.error("[LicenseSync] writeLicenseCompleted failed", err);
  }
}

/** Write a "failed" license event to Firestore. */
export async function writeLicenseFailed(
  uid: string,
  songId: string,
  failureCode: string
): Promise<void> {
  if (!db) return;
  try {
    const deviceId = await getDeviceId();
    await setDoc(
      licenseRef(uid, songId),
      {
        songId,
        deviceId,
        status: "expired" as LicenseStatus,
        failedAt: new Date().toISOString(),
        failureCode,
        completedAt: null,
      },
      { merge: true }
    );
  } catch (err) {
    logger.error("[LicenseSync] writeLicenseFailed failed", err);
  }
}

/** Revoke a license (e.g. rights removed by admin). */
export async function revokeLicense(uid: string, songId: string): Promise<void> {
  if (!db) return;
  try {
    await setDoc(
      licenseRef(uid, songId),
      { status: "revoked" as LicenseStatus },
      { merge: true }
    );
  } catch (err) {
    logger.error("[LicenseSync] revokeLicense failed", err);
  }
}

// ─── License refresh ──────────────────────────────────────────────────────────

/**
 * Refresh all active licenses for this device.
 * Returns the set of songIds whose licenses were revoked or expired.
 */
export async function refreshLicenses(uid: string): Promise<Set<string>> {
  const revoked = new Set<string>();
  if (!db) return revoked;

  try {
    const deviceId = await getDeviceId();
    const snap = await getDocs(collection(db, "users", uid, "offlineLicenses"));
    const now = Date.now();
    const graceCutoff = now - LICENSE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    await Promise.all(snap.docs.map(async (docSnap) => {
      const license = docSnap.data() as OfflineLicense;

      // Only process licenses for this device.
      if (license.deviceId !== deviceId) return;

      if (license.status === "revoked") {
        revoked.add(license.songId);
        return;
      }

      if (license.status === "expired") {
        // Check grace period.
        const failedMs = license.failedAt ? new Date(license.failedAt).getTime() : 0;
        if (failedMs < graceCutoff) {
          revoked.add(license.songId);
        }
        return;
      }

      // Check expiry.
      const expiresMs = new Date(license.expiresAt).getTime();
      if (expiresMs < now) {
        // Attempt refresh — extend expiry.
        try {
          await setDoc(
            licenseRef(uid, license.songId),
            {
              status: "active" as LicenseStatus,
              expiresAt: expiresAt(LICENSE_REFRESH_INTERVAL_HOURS),
              refreshedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch {
          // If refresh fails, mark expired.
          await setDoc(
            licenseRef(uid, license.songId),
            {
              status: "expired" as LicenseStatus,
              failedAt: new Date().toISOString(),
              failureCode: "refresh_failed",
            },
            { merge: true }
          );
          revoked.add(license.songId);
        }
      }
    }));

    // Update last sync time on the device document.
    await setDoc(
      deviceRef(uid, deviceId),
      { lastLicenseSyncAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    logger.error("[LicenseSync] refreshLicenses failed", err);
  }

  return revoked;
}

/** Check whether a specific license is valid (active and not expired). */
export async function isLicenseValid(uid: string, songId: string): Promise<boolean> {
  if (!db) return false;
  try {
    const snap = await getDoc(licenseRef(uid, songId));
    if (!snap.exists()) return false;

    const license = snap.data() as OfflineLicense;
    if (license.status !== "active") return false;

    const expiresMs = new Date(license.expiresAt).getTime();
    const graceCutoff = Date.now() - LICENSE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    return expiresMs > graceCutoff;
  } catch {
    return false;
  }
}
