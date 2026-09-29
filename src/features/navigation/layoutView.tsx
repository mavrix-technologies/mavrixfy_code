import { View } from "react-native";
import { styles } from "./layoutStyles";

export { AppNavBar } from "./AppNavBar";
export {
IOSMiniPlayerOverlay,IOSNativeTabLayout,NativeMiniPlayerOverlay,NativeTabLayout
} from "./IOSMiniBarOverlay";

export function AuthRouteFallback() {
  return <View style={styles.authRouteFallback} />;
}
