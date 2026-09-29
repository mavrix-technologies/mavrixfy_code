const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { validateLicenseRequest } = require("./licensePolicy.cjs");
initializeApp();

exports.issueOfflineLicense = onCall({ region: "us-central1", maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to download songs");
  const { songId, deviceId, quality } = request.data || {};
  if (![songId, deviceId].every(value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value))) {
    throw new HttpsError("invalid-argument", "Invalid song or device ID");
  }
  const db = getFirestore();
  const userRef = db.doc(`users/${request.auth.uid}`);
  const licenseRef = userRef.collection("offlineLicenses").doc(`${deviceId}_${songId}`);
  return db.runTransaction(async transaction => {
    const [user, song, previous, devices, licenses] = await Promise.all([
      transaction.get(userRef), transaction.get(db.doc(`songs/${songId}`)), transaction.get(licenseRef),
      transaction.get(userRef.collection("downloadDevices").where("active", "==", true)),
      transaction.get(userRef.collection("offlineLicenses").where("status", "==", "active")),
    ]);
    if (!user.exists) throw new HttpsError("failed-precondition", "Account profile is missing");
    if (previous.data()?.status === "revoked") throw new HttpsError("permission-denied", "License revoked");
    let allowedQuality;
    try { allowedQuality = validateLicenseRequest(user.data(), song.data() || {}, request.auth.token, quality); }
    catch (error) { throw new HttpsError("permission-denied", error.message); }
    if (!devices.docs.some(device => device.id === deviceId) && devices.size >= 999) {
      throw new HttpsError("resource-exhausted", "Device limit reached");
    }
    if (!previous.exists && licenses.size >= 10000) throw new HttpsError("resource-exhausted", "Offline song limit reached");
    const now = new Date();
    const license = {
      songId, deviceId, status: "active", issuedByServer: true, quality: allowedQuality,
      rightsVersion: song.data()?.rightsVersion ?? 1,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      refreshedAt: now.toISOString(),
    };
    transaction.set(licenseRef, license);
    transaction.set(userRef.collection("downloadDevices").doc(deviceId), {
      deviceId, active: true, lastLicenseSyncAt: now.toISOString(),
    }, { merge: true });
    return license;
  });
});

// Auth deletion succeeds first; cleanup retries independently if a service is unavailable.
const functionsV1 = require("firebase-functions/v1");
exports.cleanupDeletedAccount = functionsV1.runWith({ failurePolicy: true }).auth.user().onDelete(async (user) => {
  const db = getFirestore();
  for (const field of ["createdBy.id", "createdBy.uid", "createdBy._id"]) {
    const playlists = await db.collection("playlists").where(field, "==", user.uid).get();
    for (const playlist of playlists.docs) await db.recursiveDelete(playlist.ref);
  }
  const shares = await db.collection("playlist_shares").where("createdBy", "==", user.uid).get();
  for (const share of shares.docs) await share.ref.delete();
  await db.recursiveDelete(db.doc('users/' + user.uid));
  await db.doc('likedSongs/' + user.uid).delete();
});
