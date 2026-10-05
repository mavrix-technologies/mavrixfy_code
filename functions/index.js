const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
function validateLicenseRequest(user, rights, claims, requestedQuality) {
  if (["disabled", "banned"].includes(user.subscriptionStatus)) throw new Error("Account disabled");
  if (rights.downloadable === false || rights.offlineAllowed === false || rights.drmRequired === true) {
    throw new Error("This track is not available for offline download");
  }
  const territories = Array.isArray(rights.territoryRights) ? rights.territoryRights : [];
  if (territories.length && !territories.includes(String(claims.country || "").toUpperCase())) {
    throw new Error("This track is not available in your verified region");
  }
  const qualities = ["low", "medium", "high"];
  const requested = qualities.indexOf(requestedQuality);
  if (requested < 0) throw new Error("Invalid download quality");
  const maximum = qualities.indexOf(rights.offlineMaxQuality ?? "high");
  if (maximum < 0) throw new Error("Invalid track rights");
  return qualities[Math.min(requested, maximum)];
}

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
  const deletePlaylists = Promise.all(
    ["createdBy.id", "createdBy.uid", "createdBy._id"].map((field) =>
      db.collection("playlists").where(field, "==", user.uid).get()
    )
  ).then((snapshots) =>
    Promise.all(snapshots.flatMap((playlists) => playlists.docs.map((playlist) => db.recursiveDelete(playlist.ref))))
  );

  const deleteUserData = db
    .collection("playlist_shares")
    .where("createdBy", "==", user.uid)
    .get()
    .then((shares) =>
      Promise.all([
        ...shares.docs.map((share) => share.ref.delete()),
        db.recursiveDelete(db.doc("users/" + user.uid)),
        db.doc("likedSongs/" + user.uid).delete(),
      ])
    );

  await Promise.all([deletePlaylists, deleteUserData]);
});
