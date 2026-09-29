import { getAccountScope,isCurrentAccount } from "@/lib/accountScope";
import app,{ auth,db } from "@/lib/firebase";
import type { DownloadQuality,OfflineLicense } from "@/types/downloads";
import { collection,getDocs } from "firebase/firestore";
import { getFunctions,httpsCallable } from "firebase/functions";
import { getDeviceId } from "./deviceInfo";
import { loadAllDownloads,patchDownload } from "./downloadStore";

export interface IssuedLicense extends OfflineLicense { issuedByServer: true; quality: DownloadQuality }
export async function issueOfflineLicense(uid: string, songId: string, quality: DownloadQuality): Promise<IssuedLicense> {
  if (auth.currentUser?.uid !== uid) throw new Error("Sign in to download songs.");
  const issue = httpsCallable<{ songId: string; deviceId: string; quality: DownloadQuality }, IssuedLicense>(getFunctions(app, "us-central1"), "issueOfflineLicense");
  const result = await issue({ songId, deviceId: await getDeviceId(), quality });
  if (!result.data.issuedByServer || result.data.status !== "active") throw new Error("Offline access was not granted.");
  return result.data;
}

export async function refreshLicenses(uid: string): Promise<Set<string>> {
  const scope = getAccountScope();
  const revoked = new Set<string>();
  const deviceId = await getDeviceId();
  const snapshot = await getDocs(collection(db, "users", uid, "offlineLicenses"));
  const serverLicenses = new Map(snapshot.docs.map(doc => doc.data() as IssuedLicense).filter(license => license.deviceId === deviceId).map(license => [license.songId, license]));
  const downloads = await loadAllDownloads();
  for (const item of downloads) {
    if (!isCurrentAccount(scope)) break;
    const license = serverLicenses.get(item.songId);
    if (!license?.issuedByServer || license.status === "revoked") { revoked.add(item.songId); continue; }
    const renewed = await issueOfflineLicense(uid, item.songId, item.quality);
    if (!isCurrentAccount(scope)) break;
    await patchDownload(item.songId, { licenseExpiresAt: renewed.expiresAt });
  }
  return revoked;
}
