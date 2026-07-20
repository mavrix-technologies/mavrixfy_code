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

function AuthField({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  trailing,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  secureTextEntry?: boolean;
  trailing?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.fieldShell, compact ? styles.fieldShellCompact : null]}>
      <Ionicons name={icon} size={18} color={Colors.inactive} />
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
      />
      {trailing}
    </View>
  );
}

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

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;
  const isShort = screenHeight <= 780;
  const isUltraShort = screenHeight <= 690;
  const isWide = screenWidth >= 960 && screenHeight >= 640;
  const isNarrow = screenWidth <= 360;
  const isExpoGo = Constants.appOwnership === "expo";
  const guestLoginEnabled = GUEST_LOGIN_ENABLED;
  const showAppleLoginOption = Platform.OS === "ios" || Platform.OS === "web";
  const shellMaxWidth = Math.min(isWide ? 980 : 460, screenWidth - 32);
  const logoSize = isUltraShort ? 42 : 50;
  const cardPadding = isUltraShort ? 16 : isShort ? 18 : 24;
  const heroTitleSize = isWide ? 40 : isUltraShort ? 22 : isShort ? 26 : 30;
  const heroLineHeight = isWide ? 46 : isUltraShort ? 27 : isShort ? 31 : 36;
  const primaryButtonHeight = isUltraShort ? 44 : 48;
  const fieldGap = isUltraShort ? 8 : 10;
  const heroVisible = isWide;

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleAvailabilityChecked, setAppleAvailabilityChecked] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  const isSignup = mode === "signup";
  const showAuthActionStack = !isSignup && (!isExpoGo || guestLoginEnabled || showAppleLoginOption);
  const title = isSignup ? "Create your account" : "Log in to Mavrixfy";
  const subtitle = isSignup
    ? "Set up your profile and keep your library synced."
    : "Music, playlists, and account access in one clean place.";

  useEffect(() => {
    let mounted = true;

    void isAppleSignInAvailable()
      .then((available) => {
        if (mounted) {
          // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
          setAppleAvailable(available);
          setAppleAvailabilityChecked(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setAppleAvailable(false);
          setAppleAvailabilityChecked(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (isSignup && !fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }
    if (isSignup && password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
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
      const msg = error.message || "Something went wrong";
      const friendlyMsg = msg.includes("user-not-found")
        ? "No account found with this email"
        : msg.includes("wrong-password") || msg.includes("invalid-credential")
          ? "Incorrect password"
          : msg.includes("email-already-in-use")
            ? "An account with this email already exists"
            : msg.includes("invalid-email")
              ? "Please enter a valid email address"
              : msg;
      Alert.alert("Error", friendlyMsg);
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
      Alert.alert("Error", error.message || "Google Sign-In failed");
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
      Alert.alert("Error", error.message || "Apple Sign-In failed");
    } finally {
      setAppleLoading(false);
    }
  };

  const handleUnavailableAppleSignIn = () => {
    Alert.alert(
      "Apple Sign-In unavailable",
      isExpoGo
        ? "Expo Go can test Apple Sign-In on iOS, but this device is reporting it unavailable. Make sure you are on an iPhone or iPad signed into iCloud with two-factor authentication enabled."
        : "Apple Sign-In is not available on this device or this build is missing the Apple Sign-In entitlement."
    );
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
      Alert.alert("Unable to reset password", friendlyMsg);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleContinueAsGuest = () => {
    if (!guestLoginEnabled) {
      return;
    }

    continueAsGuest();
    routerReplace("/(tabs)");
  };

  const switchMode = (nextMode: AuthMode) => {
    // React automatically batches these updates
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setMode(nextMode);
    setPassword("");
    if (nextMode === "login") {
      setFullName("");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={Colors.gradientDark as [string, string, string]} style={StyleSheet.absoluteFill} />
      <View style={[styles.glowOrb, styles.glowOrbTop]} />
      <View style={[styles.glowOrb, styles.glowOrbBottom]} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? topInset : 0}
      >
        <View
          style={[
            styles.page,
            {
              paddingTop: topInset + (isUltraShort ? 8 : 18),
              paddingBottom: bottomInset + 12,
              paddingHorizontal: 16,
            },
          ]}
        >
          <View
            style={[
              styles.authShell,
              {
                maxWidth: shellMaxWidth,
                flexDirection: isWide ? "row" : "column",
              },
            ]}
          >
            {heroVisible ? (
              <View style={styles.heroPanel}>
                <View style={styles.heroBrandRow}>
                  <View style={[styles.logoBadge, { width: 58, height: 58, borderRadius: 29 }]}>
                    <Image source={require("@/assets/images/mavrixfy_icone.png")} style={styles.logoImage} contentFit="contain" />
                  </View>
                  <View style={styles.heroBrandCopy}>
                    <Text style={styles.heroBrandName}>Mavrixfy</Text>
                    <Text style={styles.heroBrandTag}>Streaming, imports, and account control</Text>
                  </View>
                </View>

                <Text style={[styles.heroTitle, { fontSize: heroTitleSize, lineHeight: heroLineHeight }]}>
                  Focused music access that feels clean on every screen.
                </Text>
                <Text style={styles.heroText}>
                  The auth flow stays compact, readable, and aligned with the Mavrixfy theme across phones and larger displays.
                </Text>

                <View style={styles.heroFeatureStack}>
                  <View style={styles.heroFeature}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.heroFeatureText}>
                      {guestLoginEnabled ? "Fast sign in, sign up, and guest access" : "Fast sign in and sign up flows"}
                    </Text>
                  </View>
                  <View style={styles.heroFeature}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.heroFeatureText}>Responsive spacing for short and tall devices</Text>
                  </View>
                  <View style={styles.heroFeature}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.heroFeatureText}>Matches the current Mavrixfy visual style</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View
              style={[
                styles.card,
                {
                  padding: cardPadding,
                  width: isWide ? 430 : "100%",
                },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.mobileBrandRow}>
                  {!heroVisible ? (
                    <>
                      <View style={[styles.logoBadge, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
                        <Image source={require("@/assets/images/mavrixfy_icone.png")} style={styles.logoImage} contentFit="contain" />
                      </View>
                      <View style={styles.mobileBrandCopy}>
                        <Text style={styles.mobileBrandName}>Mavrixfy</Text>
                        <Text style={styles.mobileBrandTag}>
                          {isSignup ? "Create your profile" : guestLoginEnabled ? "Login or guest access" : "Login or create an account"}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <View />
                  )}

                  <View style={styles.modeBadge}>
                    <Text style={styles.modeBadgeText}>{isSignup ? "SIGN UP" : "LOGIN"}</Text>
                  </View>
                </View>

                <View style={styles.modeSwitch}>
                  <Pressable
                    style={[styles.modeSwitchBtn, !isSignup ? styles.modeSwitchBtnActive : null]}
                    onPress={() => switchMode("login")}
                  >
                    <Text style={[styles.modeSwitchText, !isSignup ? styles.modeSwitchTextActive : null]}>
                      Log In
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeSwitchBtn, isSignup ? styles.modeSwitchBtnActive : null]}
                    onPress={() => switchMode("signup")}
                  >
                    <Text style={[styles.modeSwitchText, isSignup ? styles.modeSwitchTextActive : null]}>
                      Sign Up
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.cardTitle}>{title}</Text>
                {!isUltraShort ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
              </View>

              {showAuthActionStack ? (
                <View style={styles.authActionStack}>
                  {showAppleLoginOption ? (
                    <View style={[styles.appleButtonWrap, { height: primaryButtonHeight }]}>
                      {appleLoading ? (
                        <View style={styles.appleLoadingButton}>
                          <ActivityIndicator size="small" color={Colors.black} />
                          <Text style={styles.oauthButtonText}>Continue with Apple</Text>
                        </View>
                      ) : appleAvailable && Platform.OS === "ios" ? (
                        <AppleAuthentication.AppleAuthenticationButton
                          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                          cornerRadius={primaryButtonHeight / 2}
                          style={styles.appleButton}
                          onPress={handleAppleSignIn}
                        />
                      ) : Platform.OS === "web" ? (
                        <Pressable
                          style={styles.appleFallbackButton}
                          onPress={handleAppleSignIn}
                          accessibilityRole="button"
                          accessibilityLabel="Continue with Apple"
                        >
                          <Ionicons name="logo-apple" size={20} color={Colors.black} />
                          <Text style={styles.oauthButtonText}>Continue with Apple</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[
                            styles.appleFallbackButton,
                            !appleAvailabilityChecked ? styles.appleFallbackButtonChecking : null,
                          ]}
                          onPress={handleUnavailableAppleSignIn}
                          accessibilityRole="button"
                          accessibilityLabel="Continue with Apple"
                        >
                          {!appleAvailabilityChecked ? (
                            <ActivityIndicator size="small" color={Colors.black} />
                          ) : (
                            <Ionicons name="logo-apple" size={20} color={Colors.black} />
                          )}
                          <Text style={styles.oauthButtonText}>Continue with Apple</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : null}

                  {!isExpoGo ? (
                    <Pressable
                      style={[styles.oauthButton, { height: primaryButtonHeight }]}
                      onPress={handleGoogleSignIn}
                      disabled={googleLoading}
                    >
                      {googleLoading ? (
                        <ActivityIndicator size="small" color={Colors.black} />
                      ) : (
                        <>
                          <View style={styles.oauthIconWrap}>
                            <MaterialCommunityIcons name="google" size={18} color="#DB4437" />
                          </View>
                          <Text style={styles.oauthButtonText}>Continue with Google</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}

                  {guestLoginEnabled ? (
                    <Pressable
                      style={[styles.secondaryButton, { height: primaryButtonHeight }]}
                      onPress={handleContinueAsGuest}
                    >
                      <Ionicons name="person-circle-outline" size={18} color={Colors.text} />
                      <Text style={styles.secondaryButtonText}>Continue As A Guest</Text>
                    </Pressable>
                  ) : null}

                  {!isExpoGo ? (
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or use email</Text>
                      <View style={styles.dividerLine} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.formStack, { gap: fieldGap }]}>
                {isSignup ? (
                  <AuthField
                    icon="person-outline"
                    placeholder="Full Name"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    compact={isUltraShort}
                  />
                ) : null}

                <AuthField
                  icon="mail-outline"
                  placeholder="Email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  compact={isUltraShort}
                />

                <AuthField
                  icon="lock-closed-outline"
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  compact={isUltraShort}
                  trailing={
                    <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={10}>
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.inactive}
                      />
                    </Pressable>
                  }
                />

                {!isSignup ? (
                  <Pressable
                    style={styles.inlineLink}
                    onPress={handleForgotPassword}
                    disabled={resetPasswordLoading}
                  >
                    <Text style={[styles.inlineLinkText, resetPasswordLoading ? styles.inlineLinkDisabled : null]}>
                      {resetPasswordLoading ? "Sending reset link..." : "Forgot Password?"}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.signupHint}>Use at least 6 characters for your password.</Text>
                )}
              </View>

              <Pressable
                style={[styles.primaryButton, { height: primaryButtonHeight }, loading ? styles.primaryButtonDisabled : null]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.black} />
                ) : (
                  <Text style={styles.primaryButtonText}>{isSignup ? "Create Account" : "Log In"}</Text>
                )}
              </Pressable>

              <Text style={[styles.legalText, isNarrow ? styles.legalTextCompact : null]}>
                By continuing, you agree to our{" "}
                <Text style={styles.legalLink} onPress={() => { void openTermsOfService(); }}>
                  Terms of Service
                </Text>
                {" "}and{" "}
                <Text style={styles.legalLink} onPress={() => { void openPrivacyPolicy(); }}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  authShell: {
    width: "100%",
    alignSelf: "center",
    gap: 16,
    alignItems: "stretch",
    justifyContent: "center",
  },
  glowOrb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.18,
  },
  glowOrbTop: {
    width: 220,
    height: 220,
    top: 40,
    right: -50,
    backgroundColor: Colors.primary,
  },
  glowOrbBottom: {
    width: 200,
    height: 200,
    bottom: 20,
    left: -50,
    backgroundColor: "#1D4ED8",
  },
  heroPanel: {
    flex: 1,
    paddingRight: 14,
    justifyContent: "center",
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroBrandCopy: {
    marginLeft: 14,
    flex: 1,
  },
  heroBrandName: {
    color: Colors.text,
    fontSize: 19,
    fontFamily: "Inter_700Bold",
  },
  heroBrandTag: {
    marginTop: 2,
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  logoBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  heroTitle: {
    marginTop: 24,
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.7,
    maxWidth: 520,
  },
  heroText: {
    marginTop: 12,
    color: Colors.subtext,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 500,
    fontFamily: "Inter_400Regular",
  },
  heroFeatureStack: {
    marginTop: 20,
    gap: 10,
  },
  heroFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroFeatureText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: "rgba(17,23,31,0.9)",
    boxShadow: "none",
    alignSelf: "center",
  },
  cardTop: {
    marginBottom: 12,
  },
  mobileBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 34,
  },
  mobileBrandCopy: {
    flex: 1,
    marginLeft: 12,
  },
  mobileBrandName: {
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  mobileBrandTag: {
    marginTop: 2,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modeBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: "Inter_700Bold",
  },
  modeSwitch: {
    marginTop: 14,
    flexDirection: "row",
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modeSwitchBtn: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSwitchBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeSwitchText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  modeSwitchTextActive: {
    color: Colors.black,
  },
  cardTitle: {
    marginTop: 16,
    color: Colors.text,
    fontSize: 25,
    lineHeight: 31,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    marginTop: 6,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  authActionStack: {
    gap: 10,
    marginBottom: 4,
  },
  appleButtonWrap: {
    marginTop: 4,
    width: "100%",
  },
  appleButton: {
    width: "100%",
    height: "100%",
  },
  appleLoadingButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: Colors.text,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  appleFallbackButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: Colors.text,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  appleFallbackButtonChecking: {
    opacity: 0.82,
  },
  oauthButton: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: Colors.text,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  oauthIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  oauthButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.cardBorder,
  },
  dividerText: {
    color: Colors.inactive,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Inter_600SemiBold",
  },
  formStack: {
    marginTop: 2,
  },
  fieldShell: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldShellCompact: {
    height: 44,
  },
  fieldInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
  },
  inlineLink: {
    alignSelf: "flex-end",
    marginTop: 2,
  },
  inlineLinkText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  inlineLinkDisabled: {
    opacity: 0.7,
  },
  signupHint: {
    color: Colors.inactive,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  legalText: {
    marginTop: 12,
    color: Colors.subtext,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
  legalTextCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  legalLink: {
    color: Colors.text,
    textDecorationLine: "underline",
    fontFamily: "Inter_600SemiBold",
  },
});
