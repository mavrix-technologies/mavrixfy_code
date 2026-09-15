const fs = require("fs");
const os = require("os");
const path = require("path");

async function getAccessToken() {
  const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firebase credentials not found at ${configPath}`);
  }

  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rt = cfg.tokens?.refresh_token;
  if (!rt) {
    throw new Error("No refresh_token found in firebase-tools.json");
  }

  const refreshData = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      grant_type: "refresh_token",
      refresh_token: rt,
    }),
  }).then((res) => res.json());

  const token = refreshData?.access_token;
  if (!token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(refreshData)}`);
  }
  return token;
}

const DEFAULT_IMAGE_URL =
  "https://res.cloudinary.com/jaquuh1i/image/upload/v1788797319/Mavrixfy_Ganesh_Chaturthi_Background_1_v0fpev.png";

// Simple, ultra-clean schema:
// - enabled: boolean
// - backgroundImageUrl: string
// - themeAccentColor: string (gold / festival accent)
// - titleText: string
// - activeColor: string (color for main header title & icons; sticky category header keeps clean default white)
function buildCleanConfigFields(overrides = {}) {
  return {
    enabled: { booleanValue: overrides.enabled ?? true },
    backgroundImageUrl: {
      stringValue: overrides.backgroundImageUrl || DEFAULT_IMAGE_URL,
    },
    themeAccentColor: { stringValue: overrides.themeAccentColor || "#ffb900" },
    titleText: { stringValue: overrides.titleText || "MAVRIXFY" },
    activeColor: {
      stringValue: overrides.activeColor || "#FFFFFF",
    },
    updatedAt: { stringValue: new Date().toISOString() },
  };
}

async function deployFestivalConfig(options = {}) {
  const token = await getAccessToken();

  const baseUrl =
    "https://firestore.googleapis.com/v1/projects/spotify-8fefc/databases/(default)/documents/appConfig/festivalTheme";

  // 1. Separate 'public' document: appConfig/festivalTheme/configs/public
  const publicUrl = `${baseUrl}/configs/public`;
  const publicPayload = {
    fields: buildCleanConfigFields({
      enabled: options.publicEnabled ?? false,
      backgroundImageUrl: options.publicBackgroundImageUrl,
      themeAccentColor: options.publicThemeAccentColor,
      titleText: options.publicTitleText,
      activeColor: options.publicActiveColor,
    }),
  };

  const [publicRes, devRes] = await Promise.all([
    fetch(publicUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(publicPayload),
    }),
    fetch(devUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(devPayload),
    }),
  ]);

  if (!publicRes.ok) {
    const err = await publicRes.json();
    throw new Error(`Failed to write configs/public: ${JSON.stringify(err)}`);
  }
  console.log("✓ Deployed clean configs/public with unified activeColor!");

  if (!devRes.ok) {
    const err = await devRes.json();
    throw new Error(`Failed to write configs/dev: ${JSON.stringify(err)}`);
  }
  console.log("✓ Deployed clean configs/dev with unified activeColor!");
}

if (require.main === module) {
  deployFestivalConfig()
    .then(() => {
      console.log("Done updating Firestore documents!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error updating configs:", err);
      process.exit(1);
    });
}

module.exports = { deployFestivalConfig };
