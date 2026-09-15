import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";

export const UNIFIED_HEADER_TOP_BAR_HEIGHT = 48;

export interface HomeTopBarRowProps {
  handleProfilePress: () => void;
  handleDownloadPress: () => void;
  isAuthenticated: boolean;
  user: { picture?: string | null } | null;
  headerIconColor: string;
  titleColor: string;
  titleText: string;
  topBarAnimatedStyle: any;
}

export const HomeTopBarRow = React.memo(function HomeTopBarRow({
  handleProfilePress,
  handleDownloadPress,
  isAuthenticated,
  user,
  headerIconColor,
  titleColor,
  titleText,
  topBarAnimatedStyle,
}: HomeTopBarRowProps) {
  return (
    <Animated.View
      style={[
        styles.topBarContainer,
        topBarAnimatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.topBarRow}>
        {/* Profile Avatar */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={handleProfilePress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.buttonPressed,
          ]}
        >
          {isAuthenticated && user?.picture ? (
            <Image
              source={{ uri: user.picture }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={16} color={headerIconColor} />
            </View>
          )}
        </Pressable>

        {/* App Branding */}
        <View style={styles.titleContainer}>
          <Text
            allowFontScaling={false}
            style={[
              styles.appTitle,
              { color: titleColor },
            ]}
          >
            {titleText}
          </Text>
        </View>

        {/* Downloads Action */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Downloads"
          onPress={handleDownloadPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.downloadButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="arrow-down-circle-outline" size={23} color={headerIconColor} />
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  topBarContainer: {
    height: UNIFIED_HEADER_TOP_BAR_HEIGHT,
    overflow: "hidden",
    zIndex: 2,
  },
  topBarRow: {
    height: UNIFIED_HEADER_TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appTitle: {
    color: "#FFFFFF",
    fontSize: 16.5,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 2.2,
  },
  downloadButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
});
