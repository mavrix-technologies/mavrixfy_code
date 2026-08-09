import React from "react";
import { Redirect } from "expo-router";

export function SettingsScreen() {
  return <Redirect href="/profile" />;
}

export default SettingsScreen;
