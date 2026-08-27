import "dotenv/config";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyBWgv_mE8ZAnG2kUJSacCOUgkbo1RxxSpE",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "spotify-8fefc.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "spotify-8fefc",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "spotify-8fefc.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "816396705670",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:816396705670:web:005e724df7139772521607",
};

const validFestivals = [
  "raksha_bandhan",
  "diwali",
  "navratri",
  "janmashtami",
  "ganesh_chaturthi",
  "holi",
  "durga_puja",
  "chhath_puja",
  "christmas",
  "new_year",
  "makar_sankranti",
  "republic_day",
  "maha_shivratri",
  "eid",
  "independence_day",
];

async function main() {
  const target = process.argv[2]?.trim().toLowerCase();

  if (!target) {
    console.log(`
Usage:
  npm run festival <festival_name>
  npm run festival off

Available Festivals:
  ${validFestivals.join(", ")}
`);
    process.exit(0);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  if (target === "off" || target === "disable" || target === "false") {
    await setDoc(doc(db, "appConfig", "festivalTheme"), { enabled: false }, { merge: true });
    console.log("🛑 Festival theme DISABLED. App is now in Pure Normal Music Mode.");
    process.exit(0);
  }

  if (!validFestivals.includes(target)) {
    console.log(`❌ Unknown festival: "${target}". Valid options are:\n${validFestivals.join(", ")}`);
    process.exit(1);
  }

  await setDoc(
    doc(db, "appConfig", "festivalTheme"),
    {
      enabled: true,
      activeFestival: target,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`🎉 Festival switched to: "${target}" (enabled: true)! Check your device!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
