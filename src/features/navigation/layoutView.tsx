import React from "react";
import { View } from "react-native";
import { styles } from "./layoutStyles";

export { AppNavBar } from "./AppNavBar";
export { IOSNativeTabLayout, IOSMiniPlayerOverlay } from "./IOSMiniBarOverlay";

export function AuthRouteFallback() {
  return <View style={styles.authRouteFallback} />;
}
