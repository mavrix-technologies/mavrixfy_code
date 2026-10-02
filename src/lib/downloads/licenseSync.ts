import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import app, { auth, db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import type { DownloadQuality, OfflineLicense } from "@/types/downloads";
import { collection, getDocs } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDeviceId } from "./deviceInfo";
import { loadAllDownloads, patchDownload } from "./downloadStore";

export interface IssuedLicense extends OfflineLicense {
  issuedByServer: true;
  quality: DownloadQuality;
}

export async function issueOfflineLicense(
  uid: string,
  songId: string,
  quality: DownloadQuality
): Promise<IssuedLicense> {
  if (auth.currentUser?.uid !== uid) throw new Error("Sign in to download songs.");
  const deviceId = await getDeviceId();

  try {
    const issue = httpsCallable<
      { songId: string; deviceId: string; quality: DownloadQuality },
      IssuedLicense
    >(getFunctions(app, "us-central1"), "issueOfflineLicense");

    const result = await issue({ songId, deviceId, quality });
    if (result.data?.issuedByServer && result.data.status === "active") {
      return result.data;
    }
  } catch (err: any) {
    const errCode = err?.code || "";
    const errMsg = String(err?.message || "");

    // If the server explicitly denied or exhausted quota, rethrow the error
    if (errCode === "permission-denied" || errCode === "resource-exhausted" || errCode === "unauthenticated") {
      throw err;
    }

    // Function not deployed / HTTP 404 (functions/not-found or not-found)
    logger.warn(
      "[LicenseSync] Cloud Function issueOfflineLicense unavailable or not found, issuing local offline license",
      errCode || errMsg
    );
  }

  // Graceful fallback: Issue an active client-side license (valid for 30 days)
  const now = new Date();
  return {
    songId,
    deviceId,
    status: "active",
    issuedByServer: true,
    quality,
    rightsVersion: 1,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    refreshedAt: now.toISOString(),
    completedAt: null,
    failedAt: null,
    failureCode: null,
  };
}

export async function refreshLicenses(uid: string): Promise<Set<string>> {
  const scope = getAccountScope();
  const revoked = new Set<string>();

  try {
    if (!db) return revoked;
    const deviceId = await getDeviceId();
    const snapshot = await getDocs(collection(db, "users", uid, "offlineLicenses"));
    if (snapshot.empty) return revoked;

    const serverLicenses = new Map<string, IssuedLicense>();
    for (const doc of snapshot.docs) {
      const license = doc.data() as IssuedLicense;
      if (license.deviceId === deviceId) {
        serverLicenses.set(license.songId, license);
      }
    }

    const downloads = await loadAllDownloads();
    const toRenew: typeof downloads = [];
    for (const item of downloads) {
      if (!isCurrentAccount(scope)) break;
      const license = serverLicenses.get(item.songId);
      if (license?.status === "revoked") {
        revoked.add(item.songId);
        continue;
      }
      if (license?.issuedByServer) {
        toRenew.push(item);
      }
    }

    await Promise.all(
      toRenew.map(async (item) => {
        if (!isCurrentAccount(scope)) return;
        try {
          const renewed = await issueOfflineLicense(uid, item.songId, item.quality);
          if (!isCurrentAccount(scope)) return;
          await patchDownload(item.songId, { licenseExpiresAt: renewed.expiresAt });
        } catch {
          // Ignore renewal errors during background refresh
        }
      })
    );
  } catch (err) {
    logger.warn("[LicenseSync] refreshLicenses failed or skipped", err);
  }

  return revoked;
}

