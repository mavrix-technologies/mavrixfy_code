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
module.exports = { validateLicenseRequest };
