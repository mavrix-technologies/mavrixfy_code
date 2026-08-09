import Colors from "@/constants/colors";

export const Typography = {
  bold: {
    fontFamily: "Inter_700Bold",
  },
  medium: {
    fontFamily: "Inter_500Medium",
  },
  regular: {
    fontFamily: "Inter_400Regular",
  },
  h1: {
    fontSize: 24,
    lineHeight: 32,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  h2: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
};

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
