import React from "react";
import { Pressable, Text, View } from "react-native";
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

import {
  NavHomeIcon,
  NavSearchIcon,
  NavLibraryIcon,
  NavLikedIcon,
  NavImportIcon,
} from "@/components/OfficialNavIcons";

export function TabIcon({
  route,
  isFocused,
  size,
  color,
}: {
  route: VisibleRoute;
  isFocused: boolean;
  size: number;
  color: string;
}) {
  switch (route) {
    case "index":
      return <NavHomeIcon size={size} color={color} isFocused={isFocused} />;
    case "search":
      return <NavSearchIcon size={size} color={color} isFocused={isFocused} />;
    case "library":
      return <NavLibraryIcon size={size} color={color} isFocused={isFocused} />;
    case "liked-songs":
      return <NavLikedIcon size={size} color={color} isFocused={isFocused} />;
    case "import-songs":
      return <NavImportIcon size={size} color={color} isFocused={isFocused} />;
    default:
      return null;
  }
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
  isAndroid: _isAndroid,
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
            isFocused={isFocused}
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
              marginTop: 3,
              color: itemColor,
              fontFamily: isFocused ? "Inter_700Bold" : "Inter_500Medium",
            },
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
    prev.navIconSize === next.navIconSize &&
    prev.navLabelSize === next.navLabelSize &&
    prev.navLabelLineHeight === next.navLabelLineHeight &&
    prev.activeNavColor === next.activeNavColor &&
    prev.navInactiveColor === next.navInactiveColor
  );
});
