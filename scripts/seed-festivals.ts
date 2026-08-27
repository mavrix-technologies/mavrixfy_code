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

export const MASTER_INDIAN_FESTIVALS = [
  {
    id: "raksha_bandhan",
    subTitle: "C E L E B R A T E",
    mainTitle: "Raksha Bandhan",
    badgeText: "FESTIVE HITS & SIBLING SONGS",
    themeAccentColor: "#014D52",
    targetQuery: "Raksha Bandhan",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#C5E6DA",
    mainTitleColor: "#FFFDF2",
    badgeTextColor: "#FDE6A6",
    sparkleColors: ["#FFE899", "#FFD166", "#FFB3D9"],
  },
  {
    id: "diwali",
    subTitle: "F E S T I V A L  O F  L I G H T S",
    mainTitle: "Happy Diwali",
    badgeText: "LAXMI PUJA & PARTY PLAYLISTS",
    themeAccentColor: "#78350F",
    targetQuery: "Diwali Special Bollywood Songs",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#FDE68A",
    mainTitleColor: "#FFFBEB",
    badgeTextColor: "#FBBF24",
    sparkleColors: ["#FDE047", "#F59E0B", "#F97316"],
  },
  {
    id: "navratri",
    subTitle: "D A N D I Y A  &  G A R B A  N I G H T S",
    mainTitle: "Navratri Special",
    badgeText: "TOP 50 NON-STOP GARBA HITS",
    themeAccentColor: "#831843",
    targetQuery: "Navratri Garba Dandiya Hits",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#F472B6",
    mainTitleColor: "#FFF1F2",
    badgeTextColor: "#FDE047",
    sparkleColors: ["#FDE047", "#EC4899", "#38BDF8"],
  },
  {
    id: "janmashtami",
    subTitle: "J A I  S H R E E  K R I S H N A",
    mainTitle: "Janmashtami Special",
    badgeText: "DEVOTIONAL BHAJANS & KRISHNA AARTI",
    themeAccentColor: "#0C4A6E",
    targetQuery: "Krishna Bhajans Janmashtami",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#7DD3FC",
    mainTitleColor: "#F0F9FF",
    badgeTextColor: "#FDE047",
    sparkleColors: ["#38BDF8", "#FDE047", "#A7F3D0"],
  },
  {
    id: "ganesh_chaturthi",
    subTitle: "G A N P A T I  B A P P A  M O R Y A",
    mainTitle: "Ganesh Chaturthi",
    badgeText: "DHOL TASHA & AARTI HITS",
    themeAccentColor: "#9A3412",
    targetQuery: "Ganpati Songs Aarti",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#FDBA74",
    mainTitleColor: "#FFF7ED",
    badgeTextColor: "#FDE047",
    sparkleColors: ["#F59E0B", "#EF4444", "#FBBF24"],
  },
  {
    id: "holi",
    subTitle: "B U R A  N A  M A N O  H O L I  H A I",
    mainTitle: "Holi Hai!",
    badgeText: "NON-STOP BOLLYWOOD COLOR PARTY",
    themeAccentColor: "#9D174D",
    targetQuery: "Holi Songs Bollywood Dance",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#F472B6",
    mainTitleColor: "#FFF1F2",
    badgeTextColor: "#FEF08A",
    sparkleColors: ["#F43F5E", "#3B82F6", "#10B981", "#FBBF24"],
  },
  {
    id: "durga_puja",
    subTitle: "S H U B H O  M A H A L A Y A",
    mainTitle: "Durga Puja Hits",
    badgeText: "DHAK BEATS & FESTIVE PUJA ANTHEMS",
    themeAccentColor: "#991B1B",
    targetQuery: "Durga Puja Bengali Songs",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#FCA5A5",
    mainTitleColor: "#FEF2F2",
    badgeTextColor: "#FDE047",
    sparkleColors: ["#EF4444", "#FBBF24", "#FDE68A"],
  },
  {
    id: "chhath_puja",
    subTitle: "J A I  C H H A T H I  M A I Y A",
    mainTitle: "Chhath Puja Mahaparv",
    badgeText: "TRADITIONAL BHOJPURI & MAITHILI BHAJANS",
    themeAccentColor: "#B45309",
    targetQuery: "Chhath Puja Geet Sharda Sinha",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#FDE68A",
    mainTitleColor: "#FFFBEB",
    badgeTextColor: "#FB923C",
    sparkleColors: ["#FDE047", "#FB923C", "#F59E0B"],
  },
  {
    id: "christmas",
    subTitle: "M E R R Y  C H R I S T M A S",
    mainTitle: "Christmas Special",
    badgeText: "HOLIDAY CAROLS & WINTER CHILL",
    themeAccentColor: "#064E3B",
    targetQuery: "Christmas Songs Carols",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#A7F3D0",
    mainTitleColor: "#F0FDF4",
    badgeTextColor: "#FEF08A",
    sparkleColors: ["#FFFFFF", "#93C5FD", "#FEF08A"],
  },
  {
    id: "new_year",
    subTitle: "W E L C O M E  2 0 2 7",
    mainTitle: "Happy New Year",
    badgeText: "TOP PARTY ANTHEMS & CLUB MIXES",
    themeAccentColor: "#4C1D95",
    targetQuery: "New Year Party Bollywood Mix",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#D8B4FE",
    mainTitleColor: "#FAF5FF",
    badgeTextColor: "#FDE047",
    sparkleColors: ["#FDE047", "#C084FC", "#38BDF8"],
  },
  {
    id: "makar_sankranti",
    subTitle: "K A I  P O  C H E",
    mainTitle: "Makar Sankranti & Pongal",
    badgeText: "LOHRI, BIHU & KITE FESTIVAL HITS",
    themeAccentColor: "#C2410C",
    targetQuery: "Lohri Sankranti Folk Songs",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#FED7AA",
    mainTitleColor: "#FFF7ED",
    badgeTextColor: "#FDE047",
    sparkleColors: ["#FDE047", "#FB923C", "#38BDF8"],
  },
  {
    id: "republic_day",
    subTitle: "V A N D E  M A T A R A M",
    mainTitle: "Republic Day Special",
    badgeText: "BEST DESH BHAKTI & PATRIOTIC ANTHEMS",
    themeAccentColor: "#0F766E",
    targetQuery: "Patriotic Songs Desh Bhakti",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#99F6E4",
    mainTitleColor: "#F0FDFA",
    badgeTextColor: "#FED7AA",
    sparkleColors: ["#FB923C", "#FFFFFF", "#4ADE80"],
  },
  {
    id: "maha_shivratri",
    subTitle: "H A R  H A R  M A H A D E V",
    mainTitle: "Maha Shivratri",
    badgeText: "SHIVA TANDAV & DEVOTIONAL STOTRAMS",
    themeAccentColor: "#1E1B4B",
    targetQuery: "Shiva Tandav Stotram Bhajans",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#A5B4FC",
    mainTitleColor: "#EEF2FF",
    badgeTextColor: "#C7D2FE",
    sparkleColors: ["#818CF8", "#C7D2FE", "#FFFFFF"],
  },
  {
    id: "eid",
    subTitle: "E I D  M U B A R A K",
    mainTitle: "Eid Celebrations",
    badgeText: "SUFI, QAWWALI & CELEBRATION HITS",
    themeAccentColor: "#047857",
    targetQuery: "Sufi Songs Qawwali Hits",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#A7F3D0",
    mainTitleColor: "#ECFDF5",
    badgeTextColor: "#FEF08A",
    sparkleColors: ["#FEF08A", "#34D399", "#6EE7B7"],
  },
  {
    id: "independence_day",
    subTitle: "A Z A A D I  K A  A M R I T  M A H O T S A V",
    mainTitle: "Independence Day",
    badgeText: "FREEDOM ANTHEMS & INDIAN CLASSICS",
    themeAccentColor: "#1E3A8A",
    targetQuery: "Indian Patriotic Songs Independence Day",
    backgroundImageUrl: "",
    enableSparkles: true,
    subTitleColor: "#93C5FD",
    mainTitleColor: "#EFF6FF",
    badgeTextColor: "#FED7AA",
    sparkleColors: ["#FB923C", "#FFFFFF", "#4ADE80"],
  },
];

async function seedMaster() {
  console.log("Seeding all 15 Indian festival documents to Firestore appConfig/festivalTheme/festivals/...");
  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // Root Config Document
    await setDoc(
      doc(db, "appConfig", "festivalTheme"),
      {
        enabled: true,
        activeFestival: "raksha_bandhan",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("✓ Root document updated: appConfig/festivalTheme");

    // All Subcollection Documents
    for (const fest of MASTER_INDIAN_FESTIVALS) {
      const { id, ...festData } = fest;
      await setDoc(doc(db, "appConfig", "festivalTheme", "festivals", id), festData, { merge: true });
      console.log(`  ✓ Seeded: appConfig/festivalTheme/festivals/${id}`);
    }

    console.log("\n🎉 Complete! All 15 festival documents are live in Firestore.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding master festivals:", error);
    process.exit(1);
  }
}

seedMaster();
