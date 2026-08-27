import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Colors from "@/constants/colors";

interface ProfileAccountHeaderProps {
  user: { name?: string | null; email?: string | null; picture?: string | null } | null;
  isAuthenticated: boolean;
  onSignInPress: () => void;
}

export function ProfileAccountHeader({
  user,
  isAuthenticated,
  onSignInPress,
}: ProfileAccountHeaderProps) {
  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatar}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Ionicons name="person" size={42} color="rgba(255, 255, 255, 0.4)" />
        )}
      </View>
      <Text style={styles.profileName}>
        {user?.name || (isAuthenticated ? "Mavrixfy User" : "Guest User")}
      </Text>
      <Text style={styles.profileEmail}>
        {user?.email || (isAuthenticated ? "Signed In" : "Not signed in")}
      </Text>
      {!isAuthenticated && (
        <Pressable
          onPress={onSignInPress}
          style={styles.signInButton}
          hitSlop={8}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 8,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  profileEmail: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 15,
    marginTop: 4,
    fontFamily: "Inter_400Regular",
  },
  signInButton: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  signInButtonText: {
    color: "#000000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
