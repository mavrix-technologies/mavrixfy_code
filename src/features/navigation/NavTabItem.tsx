import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { IS_WEB } from "@/constants/platform";
import { styles } from "./layoutStyles";

import {
  type VisibleRoute,
  type NavItem,
  NAV_ITEMS,
} from "./navTabConstants";
export type { VisibleRoute, NavItem };

export function TabIcon({ route, name, size, color }: { route: VisibleRoute; name: string; size: number; color: string }) {
  if (route === "liked-songs") {
    const iconName = name.includes("sharp") || name.includes("heart") || name.includes("Active") || name === "heart-sharp"
      ? "favorite"
      : "favorite-border";
    return <MaterialIcons name={iconName as any} size={size} color={color} />;
  }
  if (route === "library") {
    const iconName = name.includes("sharp") || name.includes("library") || name.includes("Active") || name === "library-sharp"
      ? "music-box-multiple"
      : "music-box-multiple-outline";
    return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
  }
  if (route === "import-songs") {
    const iconName = name.includes("sharp") || name.includes("Active") || name === "cloud-upload"
      ? "cloud-upload"
      : "cloud-upload-outline";
    return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

export type NavTabItemProps = {
  item: (typeof NAV_ITEMS)[number];
  isFocused: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  navIconSize: number;
  navLabelSize: number;
  navLabelLineHeight: number;
  activeNavColor: string;
  navInactiveColor: string;
  onPress: (route: VisibleRoute, isFocused: boolean) => void;
  onLongPress: () => void;
};

export function NavTabItem({
  item,
  isFocused,
  isAndroid,
  isIOS,
  onPress,
  onLongPress,
  navIconSize,
  navLabelSize,
  navLabelLineHeight,
  activeNavColor,
  navInactiveColor,
}: NavTabItemProps) {
  const handlePress = React.useCallback(() => {
    if (!IS_WEB) {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress(item.route, isFocused);
  }, [isFocused, item.route, onPress]);

  const iconName = isFocused ? item.iconActive : item.icon;
  const itemColor = isFocused ? activeNavColor : navInactiveColor;

  return (
    <View style={styles.navItemAnimWrap}>
      <Pressable
        android_disableSound
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        onPress={handlePress}
        onLongPress={onLongPress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.navItem,
          isIOS && styles.navItemIOS,
          pressed && styles.navItemPressed,
        ]}
      >
        <View style={styles.navIconWrap}>
          <TabIcon
            route={item.route}
            name={iconName}
            size={navIconSize}
            color={itemColor}
          />
        </View>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={[
            styles.navLabel,
            {
              fontSize: navLabelSize,
              lineHeight: navLabelLineHeight,
              marginTop: isAndroid ? 3 : 2,
              color: itemColor,
              fontFamily: isFocused ? (isIOS ? "Inter_600SemiBold" : "Inter_700Bold") : "Inter_500Medium",
            },
            isIOS && styles.navLabelIOS,
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    </View>
  );
}

export const MemoizedNavTabItem = React.memo(NavTabItem, (prev, next) => {
  return (
    prev.isFocused === next.isFocused &&
    prev.item.route === next.item.route &&
    prev.isAndroid === next.isAndroid &&
    prev.isIOS === next.isIOS &&
    prev.navIconSize === next.navIconSize &&
    prev.navLabelSize === next.navLabelSize &&
    prev.navLabelLineHeight === next.navLabelLineHeight &&
    prev.activeNavColor === next.activeNavColor &&
    prev.navInactiveColor === next.navInactiveColor
  );
});
