import "dotenv/config";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyBWgv_mE8ZAnG2kUJSacCOUgkbo1RxxSpE",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "spotify-8fefc.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "spotify-8fefc",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "spotify-8fefc.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "816396705670",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:816396705670:web:005e724df7139772521607",
};

const print = (msg: string = "") => process.stdout.write(`${msg}\n`);
const printErr = (msg: string = "") => process.stderr.write(`${msg}\n`);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.trim().toLowerCase();

  if (!command) {
    print(`
Mavrixfy Festival Theme CLI
===========================
Usage:
  # Public Live Festival Commands:
  npm run festival <festival_name> [imageUrl]   (e.g., npm run festival new_year https://...)
  npm run festival off                          (Disable public festival theme)

  # Developer / Admin Testing Commands:
  npm run festival dev <festival_name> [url]    (Enable dev preview with optional dev background URL)
  npm run festival dev-off                      (Disable dev preview mode)
  npm run festival dev-image <url>              (Set dev background image URL)

  # Status:
  npm run festival status                       (View current public live & dev testing state)
`);
    process.exit(0);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const mainDocRef = doc(db, "appConfig", "festivalTheme");

  if (command === "status") {
    const snap = await getDoc(mainDocRef);
    const data = snap.exists() ? snap.data() : {};

    print("\n================ FESTIVAL THEME STATUS ================");
    print("🌐 [PUBLIC LIVE CONFIGURATION]:");
    print(`   Enabled:          ${data.enabled === true ? "✅ YES (Live for all users)" : "❌ NO (Disabled)"}`);
    print(`   Active Festival:  ${data.activeFestival || "(None)"}`);
    print(`   Background Image: ${data.backgroundImageUrl || "(None)"}`);
    print(`   Main Title:       ${data.mainTitle || "(None)"}`);
    print(`   Sub Title:        ${data.subTitle || "(None)"}`);
    print(`   Badge Text:       ${data.badgeText || "(None)"}`);
    print(`   Theme Color:      ${data.themeAccentColor || "(None)"}`);

    print("\n🟠 [DEV TEST PREVIEW CONFIGURATION] (__DEV__ & Admin Only):");
    print(`   Dev Testing:      ${data.devTesting === true ? "✅ ACTIVE" : "⚪ INACTIVE"}`);
    print(`   Testing Festival: ${data.devTestingFestival || "(None)"}`);
    print(`   Dev Background:   ${data.devBackgroundImageUrl || "(None)"}`);
    print(`   Dev Main Title:   ${data.devMainTitle || "(None)"}`);
    print(`   Dev Sub Title:    ${data.devSubTitle || "(None)"}`);
    print(`   Dev Theme Color:  ${data.devThemeAccentColor || "(None)"}`);
    print(`   Last Updated:     ${data.updatedAt || "(N/A)"}`);
    print("========================================================\n");
    process.exit(0);
  }

  if (command === "off" || command === "disable" || command === "false") {
    await setDoc(mainDocRef, { enabled: false, updatedAt: new Date().toISOString() }, { merge: true });
    print("🛑 Public festival theme DISABLED. Regular users and old apps will see Pure Normal Music Mode.");
    process.exit(0);
  }

  if (command === "dev-off" || command === "dev:off") {
    await setDoc(mainDocRef, { devTesting: false, updatedAt: new Date().toISOString() }, { merge: true });
    print("⚪ Dev Testing mode DISABLED. Developers and admins will now see public settings.");
    process.exit(0);
  }

  if (command === "dev-image" || command === "dev:image") {
    const imageUrl = args[1]?.trim();
    if (!imageUrl) {
      print("❌ Please provide an image URL. Example: npm run festival dev-image https://example.com/banner.webp");
      process.exit(1);
    }
    await setDoc(mainDocRef, { devBackgroundImageUrl: imageUrl, updatedAt: new Date().toISOString() }, { merge: true });
    print(`🖼️ Dev Background Image URL set to: "${imageUrl}"`);
    process.exit(0);
  }

  if (command === "dev" || command === "test") {
    const targetFestival = args[1]?.trim().toLowerCase();
    const devImageUrl = args[2]?.trim();

    if (!targetFestival) {
      print(`❌ Please specify festival for dev testing. Example: npm run festival dev new_year [imageUrl]`);
      process.exit(1);
    }

    const payload: Record<string, any> = {
      devTesting: true,
      devTestingFestival: targetFestival,
      updatedAt: new Date().toISOString(),
    };

    if (devImageUrl) {
      payload.devBackgroundImageUrl = devImageUrl;
    }

    await setDoc(mainDocRef, payload, { merge: true });
    print(`🟠 Dev Testing ACTIVATED for: "${targetFestival}"!`);
    if (devImageUrl) {
      print(`🖼️ Dev Background URL set to: "${devImageUrl}"`);
    }
    print("Visible ONLY in development mode (__DEV__) and to Admin accounts.");
    process.exit(0);
  }

  const publicImageUrl = args[1]?.trim();

  // Set public live festival
  const publicPayload: Record<string, any> = {
    enabled: true,
    activeFestival: command,
    updatedAt: new Date().toISOString(),
  };

  if (publicImageUrl && (publicImageUrl.startsWith("http://") || publicImageUrl.startsWith("https://"))) {
    publicPayload.backgroundImageUrl = publicImageUrl;
  }

  await setDoc(mainDocRef, publicPayload, { merge: true });

  print(`🎉 Public Live festival switched to: "${command}" (enabled: true)! Live for all users!`);
  if (publicPayload.backgroundImageUrl) {
    print(`🖼️ Public Background URL set to: "${publicPayload.backgroundImageUrl}"`);
  }
  process.exit(0);
}

main().catch((err) => {
  printErr(`Error: ${err}`);
  process.exit(1);
});

