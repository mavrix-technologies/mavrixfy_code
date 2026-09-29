const themeAccent = "#26E19A";
const themeBg = "#121212";
const themeSurface = "#181818";
const themeSurfaceLight = "#242424";
const themeText = "#FFFFFF";
const themeSubtext = "#A7A7A7";

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
  backgroundGradientStart: themeBg,
  backgroundGradientEnd: themeBg,
  surface: themeSurface,
  surfaceLight: themeSurfaceLight,
  cardBorder: "rgba(255, 255, 255, 0.08)",
  cardBorderStrong: "rgba(255, 255, 255, 0.14)",
  surfaceGlass: "rgba(255, 255, 255, 0.05)",
  surfaceGlassDark: "rgba(18, 18, 18, 0.90)",
  text: themeText,
  subtext: themeSubtext,
  inactive: "#6B7280",
  black: "#000000",
  error: "#FF6B6B",
  gradientDark: [themeBg, "#181818", "#242424"],
  gradientGreen: ["#26E19A", "#00B87B", "#26E19A"],
  shadow: {
    color: "#000000",
    offset: { width: 0, height: 4 },
    opacity: 0.3,
    radius: 8,
  },
};
