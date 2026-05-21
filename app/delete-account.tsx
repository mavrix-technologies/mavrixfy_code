import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getGoogleMobileIdToken } from "@/lib/googleAuth";
import {
  openPrivacyPolicy,
  openPrivacySupportEmail,
  openTermsOfService,
} from "@/lib/legal";
import { safeGoBack } from "@/utils/navigation";

function getFriendlyDeleteError(message: string): string {
  if (message.includes("wrong-password") || message.includes("invalid-credential")) {
    return "The password you entered is incorrect.";
  }

  if (message.includes("requires-recent-login")) {
    return "Please sign in again and retry the deletion request.";
  }

  if (message.includes("network-request-failed")) {
    return "A network error interrupted the deletion request. Please try again.";
  }

  return message || "We could not delete your account right now.";
}

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { replace: routerReplace } = useRouter();
  const { user, firebaseUser, deleteAccount } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomScrollPadding = Platform.OS === "web" ? 110 : Math.max(118, insets.bottom + 112);
  const [password, setPassword] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [loading, setLoading] = useState(false);

  const primaryProviderId = useMemo(() => {
    return firebaseUser?.providerData?.[0]?.providerId || firebaseUser?.providerId || "password";
  }, [firebaseUser]);
  const isPasswordAccount = primaryProviderId === "password";
  const isGoogleAccount = primaryProviderId === "google.com";

  const performDeletion = async () => {
    setLoading(true);

    try {
      let googleIdToken: string | undefined;

      if (isGoogleAccount && Platform.OS !== "web") {
        googleIdToken = await getGoogleMobileIdToken("Google confirmation");
      }

      await deleteAccount({
        password,
        googleIdToken,
      });

      Alert.alert("Account deleted", "Your Mavrixfy account and app data have been deleted.");
      routerReplace("/login");
    } catch (error: any) {
      Alert.alert(
        "Unable to delete account",
        getFriendlyDeleteError(String(error?.message || ""))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (confirmationText.trim().toUpperCase() !== "DELETE") {
      Alert.alert("Confirmation required", 'Type "DELETE" to confirm permanent account deletion.');
      return;
    }

    if (isPasswordAccount && !password.trim()) {
      Alert.alert("Password required", "Enter your password to confirm account deletion.");
      return;
    }

    Alert.alert(
      "Delete account?",
      "This permanently deletes your Mavrixfy account, liked songs, playlists, and synced app data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void performDeletion();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentInset={{ bottom: bottomScrollPadding }}
        scrollIndicatorInsets={{ bottom: bottomScrollPadding }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="warning-outline" size={28} color="#FF6B6B" />
          </View>
          <Text style={styles.heroTitle}>This action is permanent</Text>
          <Text style={styles.heroText}>
            Deleting your account removes your Mavrixfy profile, liked songs, playlists, and synced
            app data tied to {user?.email || "this account"}.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Before you continue</Text>
          <Text style={styles.listItem}>Your Firebase account will be permanently deleted.</Text>
          <Text style={styles.listItem}>Your Firestore profile, liked songs, and created playlists will be removed.</Text>
          <Text style={styles.listItem}>This action cannot be undone.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Confirm your identity</Text>
          <Text style={styles.helperText}>
            {isPasswordAccount
              ? "Enter your current password to confirm deletion."
              : isGoogleAccount && Platform.OS !== "web"
                ? "When you tap Delete Account, we will ask Google to confirm the deletion."
                : "When you tap Delete Account, you may be asked to sign in again to confirm."}
          </Text>

          {isPasswordAccount ? (
            <TextInput
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor={Colors.inactive}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          ) : null}

          <TextInput
            style={styles.input}
            placeholder='Type "DELETE" to confirm'
            placeholderTextColor={Colors.inactive}
            value={confirmationText}
            onChangeText={setConfirmationText}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <Pressable style={styles.linkRow} onPress={() => { void openPrivacyPolicy(); }}>
            <View style={styles.linkRowLeft}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
              <Text style={styles.linkText}>Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={Colors.subtext} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => { void openTermsOfService(); }}>
            <View style={styles.linkRowLeft}>
              <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
              <Text style={styles.linkText}>Terms of Service</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={Colors.subtext} />
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => { void openPrivacySupportEmail(); }}>
            <View style={styles.linkRowLeft}>
              <Ionicons name="mail-outline" size={18} color={Colors.primary} />
              <Text style={styles.linkText}>Contact privacy support</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={Colors.subtext} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Pressable style={styles.cancelBtn} onPress={safeGoBack} disabled={loading}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[styles.deleteBtn, loading && styles.deleteBtnDisabled]}
            onPress={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={Colors.text} />
                <Text style={styles.deleteBtnText}>Delete Account</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  scrollView: {
    flex: 1,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 20,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.22)",
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 107, 107, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  heroText: {
    color: Colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  listItem: {
    color: Colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  helperText: {
    color: Colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.text,
    paddingHorizontal: 14,
    height: 48,
    marginTop: 10,
    fontFamily: "Inter_400Regular",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  linkRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  linkText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  cancelBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  deleteBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#B83A3A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  deleteBtnDisabled: {
    opacity: 0.7,
  },
  deleteBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
