import { Platform } from "react-native";

const os = Platform.OS;
export const IS_IOS = os === "ios";
export const IS_ANDROID = os === "android";
export const IS_WEB = os === "web";
