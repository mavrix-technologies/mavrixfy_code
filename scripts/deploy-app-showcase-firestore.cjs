const fs = require("fs");
const os = require("os");
const path = require("path");

async function getAccessToken() {
  const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firebase credentials not found at ${configPath}. Please run 'npx firebase-tools login'.`);
  }

  let cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  let tokens = cfg.tokens || {};

  // If current access_token is still valid, use it directly
  if (tokens.access_token && tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
    return tokens.access_token;
  }

  // Refresh via firebase-tools if token is close to expiry
  try {
    const { execSync } = require("child_process");
    execSync("npx firebase-tools projects:list", { stdio: "ignore" });
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    tokens = cfg.tokens || {};
    if (tokens.access_token) return tokens.access_token;
  } catch {}

  const rt = tokens.refresh_token;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret && rt) {
    try {
      const refreshData = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: rt,
        }),
      }).then((res) => res.json());

      if (refreshData?.access_token) {
        return refreshData.access_token;
      }
    } catch {}
  }

  if (tokens.access_token) {
    return tokens.access_token;
  }
  throw new Error("Unable to obtain access token. Please run 'npx firebase-tools login'.");
}

const PROJECT_ID = "spotify-8fefc";
const SHOWCASE_DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/appConfig/appShowcase`;

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (
      arg === "status" ||
      arg === "on" ||
      arg === "off" ||
      arg === "enable" ||
      arg === "disable" ||
      arg === "test" ||
      arg === "dev-on" ||
      arg === "dev-off"
    ) {
      options.command = arg;
    } else if (arg === "--route" && args[i + 1]) {
      options.ctaRoute = args[++i];
    } else if (arg === "--title" && args[i + 1]) {
      options.title = args[++i];
    } else if (arg === "--subtitle" && args[i + 1]) {
      options.subtitle = args[++i];
    } else if (arg === "--cta" && args[i + 1]) {
      options.ctaText = args[++i];
    } else if (arg === "--subtext" && args[i + 1]) {
      options.subtext = args[++i];
    } else if (arg === "--dismiss" && args[i + 1]) {
      options.dismissText = args[++i];
    } else if (arg === "--card-color" && args[i + 1]) {
      options.cardBgColor = args[++i];
    } else if (arg === "--card-text-color" && args[i + 1]) {
      options.cardTextColor = args[++i];
    } else if (arg === "--cta-color" && args[i + 1]) {
      options.ctaBgColor = args[++i];
    } else if (arg === "--cta-text-color" && args[i + 1]) {
      options.ctaTextColor = args[++i];
    } else if (arg === "--on") {
      options.enabled = true;
    } else if (arg === "--off") {
      options.enabled = false;
    } else if (arg === "--dev-on") {
      options.devEnabled = true;
    } else if (arg === "--dev-off") {
      options.devEnabled = false;
    }
  }
  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  const command = options.command || (args[0] && !args[0].startsWith("-") ? args[0].toLowerCase() : "deploy");

  if (command === "status") {
    console.log("[Status] Fetching current Firestore settings from:", SHOWCASE_DOC_URL);
    const res = await fetch(SHOWCASE_DOC_URL);
    if (!res.ok) {
      console.log("[Status] Document does not exist or fetch error:", res.status);
      return;
    }
    const data = await res.json();
    console.log("\n================ APP SHOWCASE FIRESTORE STATUS ================");
    console.log("Document:       ", data.name);
    console.log("Master Enabled: ", data.fields?.enabled?.booleanValue === true ? "✅ YES (Active)" : "❌ NO (Disabled)");
    console.log("Dev Mode Test:  ", data.fields?.devEnabled?.booleanValue === true ? "✅ ON (Testing Active)" : "❌ OFF (Disabled)");
    console.log("Title:          ", data.fields?.title?.stringValue || "(none)");
    console.log("Subtitle:       ", data.fields?.subtitle?.stringValue || "(none)");
    console.log("CTA Text:       ", data.fields?.ctaText?.stringValue || "(none)");
    console.log("CTA Route:      ", data.fields?.ctaRoute?.stringValue || "(none)");
    console.log("Subtext:        ", data.fields?.subtext?.stringValue || "(none)");
    console.log("Card Color:     ", data.fields?.cardBgColor?.stringValue || "(default)");
    console.log("Card Text Color:", data.fields?.cardTextColor?.stringValue || "(default)");
    console.log("CTA Color:      ", data.fields?.ctaBgColor?.stringValue || "(default)");
    console.log("CTA Text Color: ", data.fields?.ctaTextColor?.stringValue || "(default)");
    console.log("Updated At:     ", data.fields?.updatedAt?.stringValue || "(none)");
    console.log("===============================================================\n");
    return;
  }

  const token = await getAccessToken();

  // Read existing live values from Firestore first
  let existing = {
    enabled: false,
    devEnabled: false,
    title: "",
    subtitle: "",
    ctaText: "",
    ctaRoute: "",
    subtext: "",
    dismissText: "DISMISS",
    cardBgColor: "#1DB954",
    cardTextColor: "#FFFFFF",
    ctaBgColor: "#FFFFFF",
    ctaTextColor: "#000000",
  };

  try {
    const checkRes = await fetch(SHOWCASE_DOC_URL);
    if (checkRes.ok) {
      const live = await checkRes.json();
      const f = live.fields || {};
      existing = {
        enabled: f.enabled?.booleanValue ?? existing.enabled,
        devEnabled: f.devEnabled?.booleanValue ?? existing.devEnabled,
        title: f.title?.stringValue ?? existing.title,
        subtitle: f.subtitle?.stringValue ?? existing.subtitle,
        ctaText: f.ctaText?.stringValue ?? existing.ctaText,
        ctaRoute: f.ctaRoute?.stringValue ?? existing.ctaRoute,
        subtext: f.subtext?.stringValue ?? existing.subtext,
        dismissText: f.dismissText?.stringValue ?? existing.dismissText,
        cardBgColor: f.cardBgColor?.stringValue ?? existing.cardBgColor,
        cardTextColor: f.cardTextColor?.stringValue ?? existing.cardTextColor,
        ctaBgColor: f.ctaBgColor?.stringValue ?? existing.ctaBgColor,
        ctaTextColor: f.ctaTextColor?.stringValue ?? existing.ctaTextColor,
      };
    }
  } catch {}

  const fieldsToUpdate = {
    enabled: options.enabled !== undefined ? options.enabled : (existing.title ? existing.enabled : true),
    devEnabled: options.devEnabled !== undefined ? options.devEnabled : (existing.title ? existing.devEnabled : true),
    title: options.title !== undefined ? options.title : "Unlock High Quality Audio",
    subtitle: options.subtitle !== undefined ? options.subtitle : "Experience crystal-clear studio sound and listen to your songs in maximum 320 kbps fidelity.",
    ctaText: options.ctaText !== undefined ? options.ctaText : "UNLOCK HIGH QUALITY",
    ctaRoute: options.ctaRoute !== undefined ? options.ctaRoute : "/profile/streaming-downloads",
    subtext: options.subtext !== undefined ? options.subtext : "Adjust audio streaming quality anytime in Settings.",
    dismissText: options.dismissText !== undefined ? options.dismissText : "DISMISS",
    cardBgColor: options.cardBgColor !== undefined ? options.cardBgColor : "#26E19A",
    cardTextColor: options.cardTextColor !== undefined ? options.cardTextColor : "#081D14",
    ctaBgColor: options.ctaBgColor !== undefined ? options.ctaBgColor : "#081D14",
    ctaTextColor: options.ctaTextColor !== undefined ? options.ctaTextColor : "#26E19A",
  };

  if (command === "dev-on" || options.devEnabled === true) {
    console.log("[Deploy] Turning ON Dev Mode Testing in Firestore...");
    fieldsToUpdate.devEnabled = true;
  } else if (command === "dev-off" || options.devEnabled === false) {
    console.log("[Deploy] Turning OFF Dev Mode Testing in Firestore...");
    fieldsToUpdate.devEnabled = false;
  } else if (command === "on" || command === "enable" || options.enabled === true) {
    console.log("[Deploy] Turning ON App Showcase in Firestore...");
    fieldsToUpdate.enabled = true;
    if (options.ctaRoute !== undefined) fieldsToUpdate.ctaRoute = options.ctaRoute;
    if (options.title !== undefined) fieldsToUpdate.title = options.title;
    if (options.subtitle !== undefined) fieldsToUpdate.subtitle = options.subtitle;
    if (options.ctaText !== undefined) fieldsToUpdate.ctaText = options.ctaText;
  } else if (command === "off" || command === "disable" || options.enabled === false) {
    console.log("[Deploy] Turning OFF App Showcase in Firestore...");
    fieldsToUpdate.enabled = false;
  } else {
    console.log("[Deploy] Deploying High Quality song unlock showcase configuration (black content text) to Firestore...");
  }

  const patchPayload = {
    fields: {
      enabled: { booleanValue: Boolean(fieldsToUpdate.enabled) },
      devEnabled: { booleanValue: Boolean(fieldsToUpdate.devEnabled) },
      title: { stringValue: String(fieldsToUpdate.title || "") },
      subtitle: { stringValue: String(fieldsToUpdate.subtitle || "") },
      ctaText: { stringValue: String(fieldsToUpdate.ctaText || "") },
      ctaRoute: { stringValue: String(fieldsToUpdate.ctaRoute || "") },
      subtext: { stringValue: String(fieldsToUpdate.subtext || "") },
      dismissText: { stringValue: String(fieldsToUpdate.dismissText || "DISMISS") },
      cardBgColor: { stringValue: String(fieldsToUpdate.cardBgColor || "#26E19A") },
      cardTextColor: { stringValue: String(fieldsToUpdate.cardTextColor || "#081D14") },
      ctaBgColor: { stringValue: String(fieldsToUpdate.ctaBgColor || "#081D14") },
      ctaTextColor: { stringValue: String(fieldsToUpdate.ctaTextColor || "#26E19A") },
      updatedAt: { stringValue: new Date().toISOString() },
    },
  };

  const res = await fetch(SHOWCASE_DOC_URL, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchPayload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Deploy failed with status ${res.status}: ${errText}`);
  }

  const result = await res.json();
  console.log("✅ [Deploy] SUCCESS! appConfig/appShowcase is live on Firestore.");
  console.log("Document name: ", result.name);
  console.log("Enabled state: ", result.fields?.enabled?.booleanValue);
  console.log("Dev Enabled:   ", result.fields?.devEnabled?.booleanValue);
  console.log("Title:         ", result.fields?.title?.stringValue || "(none)");
  console.log("CTA Route:     ", result.fields?.ctaRoute?.stringValue || "(none)");
  console.log("Last updated:  ", result.fields?.updatedAt?.stringValue);
}

main().catch((err) => {
  console.error("❌ [Deploy] Error:", err.message);
  process.exit(1);
});
