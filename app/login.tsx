import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { triggerNotification } from "@/lib/haptics";
import { openPrivacyPolicy, openTermsOfService } from "@/lib/legal";
import { getAppleMobileCredential, isAppleSignInAvailable } from "@/lib/appleAuth";
import { getGoogleMobileIdToken } from "@/lib/googleAuth";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";

type AuthMode = "login" | "signup";

interface AuthFieldProps {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  secureTextEntry?: boolean;
  trailing?: React.ReactNode;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}

function AuthField({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  trailing,
  isFocused,
  onFocus,
  onBlur,
}: AuthFieldProps) {
  return (
    <View
      style={[
        styles.fieldShell,
        isFocused ? styles.fieldShellFocused : null,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={isFocused ? Colors.primary : Colors.inactive}
        style={styles.fieldIcon}
      />
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor={Colors.inactive}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        selectionColor={Colors.primary}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {trailing}
    </View>
  );
}

const handleUnavailableAppleSignIn = () => {
  Alert.alert(
    "Apple Sign-In Unavailable",
    "Make sure you are on a compatible iOS device signed into iCloud with two-factor authentication enabled."
  );
};

export default function LoginScreen() {
  return <LoginScreenView />;
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
function LoginScreenView() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { replace: routerReplace } = useRouter();
  const {
    login,
    register,
    signInWithGoogle,
    signInWithGoogleCredential,
    signInWithApple,
    signInWithAppleCredential,
    resetPassword,
    continueAsGuest,
  } = useAuth();

  const topInset = Platform.OS === "web" ? 30 : insets.top;
  const bottomInset = Platform.OS === "web" ? 30 : insets.bottom;
  const isExpoGo = Constants.appOwnership === "expo";
  const guestLoginEnabled = GUEST_LOGIN_ENABLED;
  const showAppleLoginOption = Platform.OS === "ios" || Platform.OS === "web";
  const cardMaxWidth = Math.min(420, screenWidth - 32);

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"name" | "email" | "password" | null>(null);

  const isSignup = mode === "signup";
  const showAuthActionStack = !isSignup && (!isExpoGo || guestLoginEnabled || showAppleLoginOption);

  useEffect(() => {
    let mounted = true;

    void isAppleSignInAvailable()
      .then((available) => {
        if (mounted) {
          setAppleAvailable(available);
        }
      })
      .catch(() => {
        if (mounted) {
          setAppleAvailable(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Required", "Please fill in all fields");
      return;
    }
    if (isSignup && !fullName.trim()) {
      Alert.alert("Required", "Please enter your name");
      return;
    }
    if (isSignup && password.length < 6) {
      Alert.alert("Invalid Password", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        await register(email.trim(), password, fullName.trim());
      } else {
        await login(email.trim(), password);
      }
      void triggerNotification(Haptics.NotificationFeedbackType.Success);
      routerReplace("/(tabs)");
    } catch (error: any) {
      const msg = error.message || "An unexpected error occurred";
      const friendlyMsg = msg.includes("user-not-found")
        ? "No account found with this email"
        : msg.includes("wrong-password") || msg.includes("invalid-credential")
          ? "Incorrect password"
          : msg.includes("email-already-in-use")
            ? "An account with this email already exists"
            : msg.includes("invalid-email")
              ? "Please enter a valid email address"
              : msg;
      Alert.alert("Authentication Failed", friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (Platform.OS === "web") {
      setGoogleLoading(true);
      try {
        await signInWithGoogle();
        routerReplace("/(tabs)");
      } catch (error: any) {
        Alert.alert("Error", error.message || "Google Sign-In failed");
      } finally {
        setGoogleLoading(false);
      }
      return;
    }

    setGoogleLoading(true);
    try {
      const idToken = await getGoogleMobileIdToken("Google Sign-In");
      await signInWithGoogleCredential(idToken);
      void triggerNotification(Haptics.NotificationFeedbackType.Success);
      routerReplace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Google Sign-In", error.message || "Failed to sign in with Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (appleLoading) return;

    setAppleLoading(true);
    try {
      if (Platform.OS === "web") {
        await signInWithApple();
      } else {
        const credential = await getAppleMobileCredential("Apple Sign-In");
        await signInWithAppleCredential(credential);
      }
      void triggerNotification(Haptics.NotificationFeedbackType.Success);
      routerReplace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Apple Sign-In", error.message || "Failed to sign in with Apple");
    } finally {
      setAppleLoading(false);
    }
  };


  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert("Forgot Password", "Enter your email address first, then tap Forgot Password again.");
      return;
    }

    setResetPasswordLoading(true);
    try {
      await resetPassword(trimmedEmail);
      Alert.alert("Check your email", `We sent a password reset link to ${trimmedEmail}.`);
    } catch (error: any) {
      const msg = String(error?.message || "");
      const friendlyMsg = msg.includes("invalid-email")
        ? "Please enter a valid email address."
        : msg.includes("user-not-found")
          ? "No account was found with that email address."
          : msg || "Could not send a reset email right now.";
      Alert.alert("Reset Error", friendlyMsg);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleContinueAsGuest = () => {
    if (!guestLoginEnabled) return;
    continueAsGuest();
    routerReplace("/(tabs)");
  };

  const toggleAuthMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setPassword("");
    setFullName("");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.backgroundGradientStart, Colors.background, Colors.surface]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOrb} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: topInset + 40,
              paddingBottom: bottomInset + 40,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.authCard, { maxWidth: cardMaxWidth }]}>
            {/* Header / Brand */}
            <View style={styles.brandHeader}>
              <View style={styles.logoContainer}>
                <Image
                  source={require("@/assets/images/mavrixfy_icone.png")}
                  style={styles.logoImage}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.brandName}>Mavrixfy</Text>
              <Text style={styles.brandSubtitle}>
                {isSignup ? "Create an account to start streaming" : "Log in to access your music library"}
              </Text>
            </View>

            {/* Inputs Form */}
            <View style={styles.formContainer}>
              {isSignup && (
                <AuthField
                  icon="person-outline"
                  placeholder="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  isFocused={focusedField === "name"}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                />
              )}

              <AuthField
                icon="mail-outline"
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                isFocused={focusedField === "email"}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
              />

              <AuthField
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                isFocused={focusedField === "password"}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                trailing={
                  <Pressable
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={12}
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={Colors.inactive}
                    />
                  </Pressable>
                }
              />

              {!isSignup && (
                <Pressable
                  style={styles.forgotBtn}
                  onPress={handleForgotPassword}
                  disabled={resetPasswordLoading}
                >
                  <Text style={styles.forgotText}>
                    {resetPasswordLoading ? "Sending reset email..." : "Forgot Password?"}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Primary Action Button */}
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed ? styles.btnPressed : null,
                loading ? styles.submitBtnDisabled : null,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isSignup ? "Create Account" : "Log In"}
                </Text>
              )}
            </Pressable>

            {/* Switch Mode Link */}
            <View style={styles.switchModeContainer}>
              <Text style={styles.switchModeLabel}>
                {isSignup ? "Already have an account? " : "Don't have an account? "}
              </Text>
              <Pressable onPress={toggleAuthMode}>
                <Text style={styles.switchModeLink}>
                  {isSignup ? "Log In" : "Sign Up"}
                </Text>
              </Pressable>
            </View>

            {/* OAuth and Guest Stack */}
            {showAuthActionStack && (
              <View style={styles.oauthContainer}>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or continue with</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.oauthButtonsRow}>
                  {/* Google */}
                  {!isExpoGo && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.oauthCircleBtn,
                        pressed ? styles.btnPressed : null,
                      ]}
                      onPress={handleGoogleSignIn}
                      disabled={googleLoading}
                    >
                      {googleLoading ? (
                        <ActivityIndicator size="small" color={Colors.text} />
                      ) : (
                        <MaterialCommunityIcons name="google" size={22} color={Colors.text} />
                      )}
                    </Pressable>
                  )}

                  {/* Apple */}
                  {showAppleLoginOption && (
                    <View style={styles.appleButtonContainer}>
                      {appleLoading ? (
                        <View style={styles.oauthCircleBtn}>
                          <ActivityIndicator size="small" color={Colors.text} />
                        </View>
                      ) : appleAvailable && Platform.OS === "ios" ? (
                        <AppleAuthentication.AppleAuthenticationButton
                          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                          cornerRadius={24}
                          style={styles.appleNativeBtn}
                          onPress={handleAppleSignIn}
                        />
                      ) : (
                        <Pressable
                          style={({ pressed }) => [
                            styles.oauthCircleBtn,
                            pressed ? styles.btnPressed : null,
                          ]}
                          onPress={Platform.OS === "web" ? handleAppleSignIn : handleUnavailableAppleSignIn}
                        >
                          <Ionicons name="logo-apple" size={22} color={Colors.text} />
                        </Pressable>
                      )}
                    </View>
                  )}

                  {/* Guest */}
                  {guestLoginEnabled && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.oauthCircleBtn,
                        pressed ? styles.btnPressed : null,
                      ]}
                      onPress={handleContinueAsGuest}
                    >
                      <Ionicons name="person-outline" size={22} color={Colors.text} />
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Legal Links */}
            <Text style={styles.legalText}>
              By continuing, you agree to our{" "}
              <Text style={styles.legalLink} onPress={() => { void openTermsOfService(); }}>
                Terms
              </Text>
              {" "}and{" "}
              <Text style={styles.legalLink} onPress={() => { void openPrivacyPolicy(); }}>
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  glowOrb: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    top: "15%",
    right: "-10%",
    backgroundColor: Colors.primaryGlow,
    opacity: 0.45,
    filter: Platform.OS === "web" ? "blur(80px)" : undefined,
  },
  authCard: {
    width: "100%",
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 24,
    boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.3)",
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  brandName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  brandSubtitle: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  formContainer: {
    gap: 12,
    marginBottom: 20,
  },
  fieldShell: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  fieldShellFocused: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(38, 225, 154, 0.02)",
  },
  fieldIcon: {
    marginRight: 12,
  },
  fieldInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
  },
  eyeBtn: {
    paddingLeft: 8,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 12.5,
    color: Colors.subtext,
    fontFamily: "Inter_600SemiBold",
  },
  submitBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.black,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  switchModeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  switchModeLabel: {
    fontSize: 13,
    color: Colors.subtext,
  },
  switchModeLink: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  oauthContainer: {
    width: "100%",
    marginBottom: 16,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  dividerText: {
    fontSize: 12,
    color: Colors.inactive,
    marginHorizontal: 12,
    fontFamily: "Inter_500Medium",
  },
  oauthButtonsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  oauthCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  appleButtonContainer: {
    width: 48,
    height: 48,
  },
  appleNativeBtn: {
    width: 48,
    height: 48,
  },
  legalText: {
    fontSize: 11,
    color: Colors.inactive,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 8,
  },
  legalLink: {
    color: Colors.text,
    textDecorationLine: "underline",
    fontFamily: "Inter_600SemiBold",
  },
});
