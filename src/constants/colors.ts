const themeAccent = "#26E19A";
const themeBg = "#10141A";
const themeSurface = "#181C22";
const themeSurfaceLight = "#22262E";
const themeText = "#FFFFFF";
const themeSubtext = "#8E99A8";

export default {
  light: {
    text: themeText,
    background: themeBg,
    tint: themeAccent,
    tabIconDefault: themeSubtext,
    tabIconSelected: themeText,
  },
  primary: themeAccent,
  primaryGlow: "transparent",
  background: themeBg,
  backgroundGradientStart: "#09111B",
  backgroundGradientEnd: "#10141A",
  surface: themeSurface,
  surfaceLight: themeSurfaceLight,
  cardBorder: "rgba(255, 255, 255, 0.08)",
  cardBorderStrong: "rgba(255, 255, 255, 0.14)",
  surfaceGlass: "rgba(255, 255, 255, 0.05)",
  surfaceGlassDark: "rgba(16, 20, 26, 0.90)",
  text: themeText,
  subtext: themeSubtext,
  inactive: "#6B7280",
  black: "#0A0D12",
  error: "#FF6B6B",
  gradientDark: ["#09111B", "#10141A", "#181C22"],
  gradientGreen: ["#26E19A", "#00B87B", "#26E19A"],
  shadow: {
    color: "#000000",
    offset: { width: 0, height: 4 },
    opacity: 0.3,
    radius: 8,
  },
};

