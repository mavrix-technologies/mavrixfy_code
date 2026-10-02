import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable,StyleSheet,Text,View } from "react-native";

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
          <Ionicons name="person" size={28} color="rgba(255, 255, 255, 0.4)" />
        )}
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.profileName} numberOfLines={1}>
          {user?.name || (isAuthenticated ? "Mavrixfy User" : "Guest User")}
        </Text>
        <Text style={styles.profileEmail} numberOfLines={1}>
          {user?.email || (isAuthenticated ? "Signed In" : "Not signed in")}
        </Text>
      </View>
      {!isAuthenticated && (
        <Pressable
          onPress={onSignInPress}
          style={styles.signInButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 14,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileEmail: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12.5,
    marginTop: 3,
    fontFamily: "Inter_400Regular",
  },
  signInButton: {
    marginLeft: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  signInButtonText: {
    color: "#000000",
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
});
