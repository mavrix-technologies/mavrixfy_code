const themeAccent = "#26E19A";
const themeBg = "#10141A";
const themeSurface = "#181C22";
const themeSurfaceLight = "#262A31";
const themeText = "#DFE2EB";
const themeSubtext = "#BCCBB9";

export default {
  light: {
    text: themeText,
    background: themeBg,
    tint: themeAccent,
    tabIconDefault: themeSubtext,
    tabIconSelected: themeText,
  },
  primary: themeAccent,
  primaryGlow: "rgba(38, 225, 154, 0.34)",
  background: themeBg,
  backgroundGradientStart: "#09111B",
  backgroundGradientEnd: "#10141A",
  surface: themeSurface,
  surfaceLight: themeSurfaceLight,
  cardBorder: "rgba(61, 74, 61, 0.35)",
  cardBorderStrong: "rgba(61, 74, 61, 0.5)",
  surfaceGlass: "rgba(38, 42, 49, 0.45)",
  surfaceGlassDark: "rgba(16, 20, 26, 0.72)",
  text: themeText,
  subtext: themeSubtext,
  inactive: "#869585",
  black: "#06241A",
  error: "#FF6B6B",
  gradientDark: ["#09111B", "#10141A", "#181C22"],
  gradientGreen: ["#26E19A", "#00B87B", "#86F7C8"],
  shadow: {
    color: "#000000",
    offset: { width: 0, height: 4 },
    opacity: 0.3,
    radius: 8,
  },
};
