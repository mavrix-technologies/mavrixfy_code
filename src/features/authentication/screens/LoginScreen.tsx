import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { IS_IOS, IS_WEB } from "@/constants/platform";
import { useAuth } from "@/contexts/AuthContext";
import { triggerNotification, triggerImpact } from "@/lib/haptics";
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
        color={isFocused ? Colors.primary : "rgba(255,255,255,0.4)"}
        style={styles.fieldIcon}
      />
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
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

function BrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.logoContainer}>
        <Image
          source={require("@/assets/images/mavrixfy_transparent_master.png")}
          style={styles.logoImage}
          contentFit="contain"
        />
      </View>
      <Text style={styles.heroTitle}>Millions of songs.</Text>
      <Text style={styles.heroSubtitle}>Free on Mavrixfy.</Text>
    </View>
  );
}

function AuthLegalFooter() {
  return (
    <View style={styles.legalFooterContainer}>
      <Text style={styles.legalText}>
        {"By continuing, you agree to Mavrixfy's "}
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
  );
}

interface ModeSwitcherProps {
  isSignup: boolean;
  onSelectMode: (mode: AuthMode) => void;
}

function AuthModeSwitcher({
  isSignup,
  onSelectMode,
}: ModeSwitcherProps) {
  return (
    <View style={styles.modeSwitcherWrap}>
      <Pressable
        style={[
          styles.modeSwitcherTab,
          !isSignup && styles.modeSwitcherTabActive,
        ]}
        onPress={() => onSelectMode("login")}
      >
        <Text
          style={[
            styles.modeSwitcherText,
            !isSignup && styles.modeSwitcherTextActive,
          ]}
        >
          Log In
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.modeSwitcherTab,
          isSignup && styles.modeSwitcherTabActive,
        ]}
        onPress={() => onSelectMode("signup")}
      >
        <Text
          style={[
            styles.modeSwitcherText,
            isSignup && styles.modeSwitcherTextActive,
          ]}
        >
          Sign Up
        </Text>
      </Pressable>
    </View>
  );
}

interface FormFieldsProps {
  isSignup: boolean;
  fullName: string;
  onFullNameChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  focusedField: "name" | "email" | "password" | null;
  onFocusField: (field: "name" | "email" | "password" | null) => void;
  onForgotPassword: () => void;
  resetPasswordLoading: boolean;
}

function AuthFormFields({
  isSignup,
  fullName,
  onFullNameChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  showPassword,
  onToggleShowPassword,
  focusedField,
  onFocusField,
  onForgotPassword,
  resetPasswordLoading,
}: FormFieldsProps) {
  return (
    <View style={styles.formContainer}>
      {isSignup && (
        <AuthField
          icon="person-outline"
          placeholder="Full Name"
          value={fullName}
          onChangeText={onFullNameChange}
          autoCapitalize="words"
          isFocused={focusedField === "name"}
          onFocus={() => onFocusField("name")}
          onBlur={() => onFocusField(null)}
        />
      )}

      <AuthField
        icon="mail-outline"
        placeholder="Email Address"
        value={email}
        onChangeText={onEmailChange}
        keyboardType="email-address"
        autoCapitalize="none"
        isFocused={focusedField === "email"}
        onFocus={() => onFocusField("email")}
        onBlur={() => onFocusField(null)}
      />

      <AuthField
        icon="lock-closed-outline"
        placeholder="Password"
        value={password}
        onChangeText={onPasswordChange}
        secureTextEntry={!showPassword}
        isFocused={focusedField === "password"}
        onFocus={() => onFocusField("password")}
        onBlur={() => onFocusField(null)}
        trailing={
          <Pressable
            onPress={onToggleShowPassword}
            hitSlop={12}
            style={styles.eyeBtn}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="rgba(255,255,255,0.4)"
            />
          </Pressable>
        }
      />

      {!isSignup && (
        <Pressable
          style={styles.forgotBtn}
          onPress={onForgotPassword}
          disabled={resetPasswordLoading}
        >
          <Text style={styles.forgotText}>
            {resetPasswordLoading ? "Sending reset link..." : "Forgot password?"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

interface SocialButtonsProps {
  isExpoGo: boolean;
  googleLoading: boolean;
  onGoogleSignIn: () => void;
  showAppleLoginOption: boolean;
  appleLoading: boolean;
  appleAvailable: boolean;
  onAppleSignIn: () => void;
  guestLoginEnabled: boolean;
  onContinueAsGuest: () => void;
}

function AuthSocialButtons({
  isExpoGo,
  googleLoading,
  onGoogleSignIn,
  showAppleLoginOption,
  appleLoading,
  appleAvailable,
  onAppleSignIn,
  guestLoginEnabled,
  onContinueAsGuest,
}: SocialButtonsProps) {
  return (
    <View style={styles.socialStack}>
      {!isExpoGo && (
        <Pressable
          style={({ pressed }) => [
            styles.socialBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={onGoogleSignIn}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="google" size={20} color="#FFFFFF" style={styles.socialIcon} />
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      )}

      {showAppleLoginOption && (
        <View style={styles.appleWrap}>
          {appleLoading ? (
            <View style={styles.socialBtn}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          ) : appleAvailable && IS_IOS ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={24}
              style={styles.appleNativeBtn}
              onPress={onAppleSignIn}
            />
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.socialBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={IS_WEB ? onAppleSignIn : handleUnavailableAppleSignIn}
            >
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" style={styles.socialIcon} />
              <Text style={styles.socialBtnText}>Continue with Apple</Text>
            </Pressable>
          )}
        </View>
      )}

      {guestLoginEnabled && (
        <Pressable
          style={({ pressed }) => [
            styles.guestBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={onContinueAsGuest}
        >
          <Ionicons name="musical-notes-outline" size={18} color="rgba(255,255,255,0.7)" style={styles.socialIcon} />
          <Text style={styles.guestBtnText}>Continue as Guest</Text>
        </Pressable>
      )}
    </View>
  );
}

const handleUnavailableAppleSignIn = () => {
  Alert.alert(
    "Apple Sign-In Unavailable",
    "Make sure you are on a compatible iOS device signed into iCloud with two-factor authentication enabled."
  );
};

export function LoginScreen() {
  return <LoginScreenView />;
}

export default LoginScreen;

function LoginScreenView() {
  const { width: screenWidth } = useWindowDimensions();
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
  const isExpoGo = Constants.appOwnership === "expo";
  const guestLoginEnabled = GUEST_LOGIN_ENABLED;
  const showAppleLoginOption = IS_IOS || IS_WEB;
  const cardMaxWidth = Math.min(420, screenWidth - 36);

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

  const handleContinueAsGuest = () => {
    if (!guestLoginEnabled) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    continueAsGuest();
    routerReplace("/(tabs)");
  };

  const setAuthMode = (newMode: AuthMode) => {
    if (mode === newMode) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
    setPassword("");
    setFullName("");
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={IS_IOS ? "padding" : undefined}
        keyboardVerticalOffset={IS_IOS ? 40 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: topInset + 20,
              paddingBottom: Math.max(bottomInset, 16) + 40,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.authCard, { maxWidth: cardMaxWidth }]}>
            <BrandHeader />

            <AuthModeSwitcher
              isSignup={isSignup}
              onSelectMode={setAuthMode}
            />

            <AuthFormFields
              isSignup={isSignup}
              fullName={fullName}
              onFullNameChange={setFullName}
              email={email}
              onEmailChange={setEmail}
              password={password}
              onPasswordChange={setPassword}
              showPassword={showPassword}
              onToggleShowPassword={() => setShowPassword((prev) => !prev)}
              focusedField={focusedField}
              onFocusField={setFocusedField}
              onForgotPassword={handleForgotPassword}
              resetPasswordLoading={resetPasswordLoading}
            />

            {/* Primary Action Button */}
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.btnPressed,
                loading && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isSignup ? "Create Account" : "Log In"}
                </Text>
              )}
            </Pressable>

            {/* Switch Mode Prompt */}
            <Pressable
              style={styles.switchPromptRow}
              onPress={() => setAuthMode(isSignup ? "login" : "signup")}
            >
              <Text style={styles.switchPromptText}>
                {isSignup ? "Already have an account?" : "Don't have an account?"}
              </Text>
              <Text style={styles.switchPromptAction}>
                {isSignup ? "Log In" : "Sign Up"}
              </Text>
            </Pressable>

            {/* Social Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Actions */}
            <AuthSocialButtons
              isExpoGo={isExpoGo}
              googleLoading={googleLoading}
              onGoogleSignIn={handleGoogleSignIn}
              showAppleLoginOption={showAppleLoginOption}
              appleLoading={appleLoading}
              appleAvailable={appleAvailable}
              onAppleSignIn={handleAppleSignIn}
              guestLoginEnabled={guestLoginEnabled}
              onContinueAsGuest={handleContinueAsGuest}
            />

            <AuthLegalFooter />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 18,
  },
  authCard: {
    width: "100%",
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 26,
  },
  logoContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: 42,
    height: 42,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: -0.2,
    textAlign: "center",
    marginTop: 4,
  },
  modeSwitcherWrap: {
    flexDirection: "row",
    backgroundColor: "#121212",
    borderRadius: 24,
    padding: 3,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  modeSwitcherTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  modeSwitcherTabActive: {
    backgroundColor: "#222222",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  modeSwitcherText: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255, 255, 255, 0.5)",
  },
  modeSwitcherTextActive: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  switchPromptRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 4,
  },
  switchPromptText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255, 255, 255, 0.55)",
  },
  switchPromptAction: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginLeft: 5,
  },
  formContainer: {
    gap: 12,
    marginBottom: 18,
  },
  fieldShell: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "#121212",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  fieldShellFocused: {
    borderColor: "rgba(255, 255, 255, 0.4)",
    backgroundColor: "#181818",
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
  },
  eyeBtn: {
    paddingLeft: 6,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  forgotText: {
    fontSize: 12,
    color: Colors.primary,
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
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    color: "#000000",
  },
  btnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  dividerText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginHorizontal: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  socialStack: {
    gap: 10,
    marginBottom: 20,
  },
  socialBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  socialIcon: {
    marginRight: 8,
  },
  socialBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  appleWrap: {
    width: "100%",
    height: 48,
  },
  appleNativeBtn: {
    width: "100%",
    height: 48,
  },
  guestBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  guestBtnText: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  legalFooterContainer: {
    marginTop: 18,
    paddingTop: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  legalText: {
    fontSize: 11.5,
    color: "rgba(255,255,255,0.42)",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 12,
  },
  legalLink: {
    color: "rgba(255,255,255,0.75)",
    textDecorationLine: "underline",
    fontFamily: "Inter_600SemiBold",
  },
});
