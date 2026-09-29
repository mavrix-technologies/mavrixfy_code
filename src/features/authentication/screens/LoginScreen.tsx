import Colors from "@/constants/colors";
import { IS_IOS, IS_WEB, IS_ANDROID } from "@/constants/platform";
import { useAuth } from "@/contexts/AuthContext";
import { getAppleMobileCredential,isAppleSignInAvailable } from "@/lib/appleAuth";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import { getGoogleMobileIdToken } from "@/lib/googleAuth";
import { triggerImpact,triggerNotification } from "@/lib/haptics";
import { openPrivacyPolicy,openTermsOfService } from "@/lib/legal";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React,{ useEffect,useState } from "react";
import {
ActivityIndicator,
Alert,
KeyboardAvoidingView,
Pressable,
ScrollView,
StyleSheet,
Text,
TextInput,
View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg,{ Path } from "react-native-svg";
import { styles } from "../styles/loginStyles";

type AuthMode = "login" | "signup";

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function BrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <Image
        source={require("../../../../assets/images/mavrixfy_transparent_master.png")}
        style={styles.logoImage}
        contentFit="contain"
      />
      <Text style={styles.brandTitle}>Mavrixfy</Text>
    </View>
  );
}

interface AuthFieldProps {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  autoComplete?: React.ComponentProps<typeof TextInput>["autoComplete"];
  textContentType?: React.ComponentProps<typeof TextInput>["textContentType"];
  secureTextEntry?: boolean;
  trailing?: React.ReactNode;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}

function AuthField({
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  secureTextEntry,
  trailing,
  isFocused,
  onFocus,
  onBlur,
}: AuthFieldProps) {
  return (
    <View style={[styles.fieldShell, isFocused && styles.fieldShellFocused]}>
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="rgba(255, 255, 255, 0.38)"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        secureTextEntry={secureTextEntry}
        selectionColor={Colors.primary}
        cursorColor={Colors.primary}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {trailing}
    </View>
  );
}

interface SocialButtonsProps {
  googleLoading: boolean;
  onGoogleSignIn: () => void;
  showAppleOption: boolean;
  appleLoading: boolean;
  onAppleSignIn: () => void;
}

function AuthSocialButtons({
  googleLoading,
  onGoogleSignIn,
  showAppleOption,
  appleLoading,
  onAppleSignIn,
}: SocialButtonsProps) {
  return (
    <View style={styles.socialRow}>
      {/* Google Pill */}
      <Pressable
        style={({ pressed }) => [styles.socialPill, pressed && styles.socialPillPressed]}
        onPress={onGoogleSignIn}
        disabled={googleLoading || appleLoading}
      >
        {googleLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <GoogleIcon size={20} />
            <Text style={styles.socialPillText}>
              {showAppleOption ? "Google" : "Continue with Google"}
            </Text>
          </>
        )}
      </Pressable>

      {/* Apple Pill (Only displayed on iOS and Web, hidden on Android) */}
      {showAppleOption && (
        <Pressable
          style={({ pressed }) => [styles.socialPill, pressed && styles.socialPillPressed]}
          onPress={onAppleSignIn}
          disabled={appleLoading || googleLoading}
        >
          {appleLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
              <Text style={styles.socialPillText}>Apple</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

function AuthLegalFooter() {
  return (
    <View style={styles.legalFooterContainer}>
      <Pressable onPress={() => { void openTermsOfService(); }} hitSlop={8}>
        <Text style={styles.legalLink}>Terms of Service</Text>
      </Pressable>
      <Text style={styles.legalDivider}>|</Text>
      <Pressable onPress={() => { void openPrivacyPolicy(); }} hitSlop={8}>
        <Text style={styles.legalLink}>Privacy Policy</Text>
      </Pressable>
    </View>
  );
}

export function LoginScreen() {
  return <LoginScreenView />;
}

export default LoginScreen;

function LoginScreenView() {
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

  const topInset = IS_WEB ? 24 : insets.top;
  const bottomInset = IS_WEB ? 24 : insets.bottom;
  const requiresCustomDevelopmentBuild = !IS_WEB && Constants.appOwnership === "expo";
  const showAppleOption = !IS_ANDROID;

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [, setAppleAvailable] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"name" | "email" | "password" | null>(null);

  const isSignup = mode === "signup";

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
      const msg = String(error?.message || "An unexpected error occurred");
      if (msg.toLowerCase().includes("full") || error?.code === 13 || msg.includes("SQLITE_FULL")) {
        return;
      }
      const friendlyMsg = msg.includes("user-not-found")
        ? "No account found with this email"
        : msg.includes("wrong-password") || msg.includes("invalid-credential")
          ? "Incorrect password"
          : msg.includes("email-already-in-use")
            ? "An account with this email already exists"
            : msg.includes("invalid-email")
              ? "Please enter a valid email address"
              : msg.includes("Too many login attempts")
                ? msg
                : "Authentication failed. Please check your credentials and try again.";
      Alert.alert("Authentication Failed", friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (requiresCustomDevelopmentBuild) {
      Alert.alert(
        "Development Build Required",
        "Google Sign-In uses a native module that is not included in Expo Go. Install a custom development build to test it."
      );
      return;
    }

    if (IS_WEB) {
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

    if (!IS_IOS && !IS_WEB) {
      Alert.alert(
        "Apple Sign-In Unavailable",
        "Apple Sign-In is only supported on iOS devices and supported web browsers."
      );
      return;
    }

    if (requiresCustomDevelopmentBuild) {
      Alert.alert(
        "Development Build Required",
        "Expo Go signs in as the Expo app, so its Apple credential cannot authenticate as Mavrixfy with Firebase. Install a custom development build to test Apple Sign-In."
      );
      return;
    }

    setAppleLoading(true);
    try {
      if (IS_WEB) {
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

  const handleToggleMode = () => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setPassword("");
    setFullName("");
  };

  const handleGuestContinue = () => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    continueAsGuest();
    routerReplace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Radiant Glowing Background: Mavrixfy emerald green aura at top, fading completely into pure black at bottom */}
      <LinearGradient
        colors={["#0c4a34", "#083625", "#052217", "#02120d", "#000000", "#000000"]}
        locations={[0, 0.16, 0.32, 0.48, 0.65, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />

      {/* Top Ambient Light Aura */}
      <View style={styles.ambientGlow} pointerEvents="none">
        <LinearGradient
          colors={["rgba(38, 225, 154, 0.38)", "rgba(16, 185, 129, 0.14)", "transparent"]}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={IS_IOS ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: topInset + 8,
              paddingBottom: Math.max(bottomInset, 16) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.mainCard}>
            {/* Top Brand Logo & Title */}
            <BrandHeader />

            {/* Dynamic Title & Subtitle */}
            <View style={styles.headerArea}>
              <Text style={styles.titleText}>
                {isSignup ? "Create an Account" : "Hi There!"}
              </Text>
              <Text style={styles.subtitleText}>
                {isSignup
                  ? "To create an account provide details verify email and set a password."
                  : "Please enter required details."}
              </Text>
            </View>

            {/* Social Buttons */}
            <AuthSocialButtons
              googleLoading={googleLoading}
              onGoogleSignIn={handleGoogleSignIn}
              showAppleOption={showAppleOption}
              appleLoading={appleLoading}
              onAppleSignIn={handleAppleSignIn}
            />

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Form Fields */}
            <View style={styles.inputsContainer}>
              {isSignup && (
                <AuthField
                  placeholder="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  isFocused={focusedField === "name"}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                />
              )}

              <AuthField
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                isFocused={focusedField === "email"}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
              />

              <AuthField
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={isSignup ? "new-password" : "current-password"}
                textContentType={isSignup ? "newPassword" : "password"}
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
                      color="rgba(255, 255, 255, 0.45)"
                    />
                  </Pressable>
                }
              />
            </View>

            {/* Forgot Password (on Login mode) */}
            {!isSignup && (
              <Pressable
                style={styles.forgotBtn}
                onPress={handleForgotPassword}
                disabled={resetPasswordLoading}
                hitSlop={8}
              >
                <Text style={styles.forgotText}>
                  {resetPasswordLoading ? "Sending reset link..." : "Forgot Password?"}
                </Text>
              </Pressable>
            )}

            {/* Primary Action Button (Theme Emerald-to-Mint Gradient Pill) */}
            <Pressable
              style={({ pressed }) => [
                styles.submitBtnWrap,
                pressed && styles.btnPressed,
                loading && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <LinearGradient
                colors={["#00E58F", "#26E19A", "#48F2A8"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.submitBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#03140C" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {isSignup ? "Continue" : "Log In"}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Switch Mode Prompt */}
            <Pressable
              style={styles.switchPromptRow}
              onPress={handleToggleMode}
              hitSlop={8}
            >
              <Text style={styles.switchPromptText}>
                {isSignup ? "Have an account?" : "Create an account?"}
              </Text>
              <Text style={styles.switchPromptAction}>
                {isSignup ? "Log In" : "Sign Up"}
              </Text>
            </Pressable>

            {/* Optional Dev / Guest Bypass */}
            {GUEST_LOGIN_ENABLED && (
              <Pressable
                style={styles.guestBtn}
                onPress={handleGuestContinue}
                hitSlop={8}
              >
                <Text style={styles.guestBtnText}>Continue as Guest</Text>
              </Pressable>
            )}

            {/* Legal Footer safely inside view, not at the edge of the screen */}
            <AuthLegalFooter />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
