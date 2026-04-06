import React, { useState } from "react";
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
  Image,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthApiUrl } from "@/lib/api-config";
import { triggerNotification } from "@/lib/haptics";

export default function LoginScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register, signInWithGoogle, signInWithGoogleCredential } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const isCompactHeight = screenHeight <= 760;
  const isVeryCompactHeight = screenHeight <= 700;
  const isWideLayout = screenWidth >= 768;
  const horizontalPadding = isWideLayout ? 28 : 20;
  const contentMaxWidth = Math.min(560, screenWidth - horizontalPadding * 2);
  const heroVisualSize = Math.round(
    Math.min(contentMaxWidth, isVeryCompactHeight ? 220 : isCompactHeight ? 260 : 320)
  );
  const circleSize = Math.round(Math.max(56, Math.min(88, heroVisualSize * 0.275)));
  const logoSize = Math.round(Math.max(64, Math.min(92, heroVisualSize * 0.3)));
  const heroTitleSize = isVeryCompactHeight ? 26 : isCompactHeight ? 30 : 34;
  const heroTitleLineHeight = isVeryCompactHeight ? 31 : isCompactHeight ? 36 : 40;
  const primaryButtonHeight = isVeryCompactHeight ? 46 : 50;
  const formGap = isVeryCompactHeight ? 8 : 10;

  const [showSignupForm, setShowSignupForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (showSignupForm && !fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }
    if (showSignupForm && password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (showSignupForm) {
        await register(email.trim(), password, fullName.trim());
      } else {
        await login(email.trim(), password);
      }
      void triggerNotification(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (error: any) {
      const msg = error.message || "Something went wrong";
      const friendlyMsg = msg.includes("user-not-found") ? "No account found with this email"
        : msg.includes("wrong-password") || msg.includes("invalid-credential") ? "Incorrect password"
          : msg.includes("email-already-in-use") ? "An account with this email already exists"
            : msg.includes("invalid-email") ? "Please enter a valid email address"
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
        router.replace("/(tabs)");
      } catch (error: any) {
        Alert.alert("Error", error.message || "Google Sign-In failed");
      } finally {
        setGoogleLoading(false);
      }
      return;
    }

    setGoogleLoading(true);
    try {
      const returnUrl = Linking.createURL("google-auth");
      const apiUrl = getAuthApiUrl();
      const authUrl = `${apiUrl}api/auth/google-mobile?returnUrl=${encodeURIComponent(returnUrl)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

      if (result.type === "success" && result.url) {
        const parsedUrl = Linking.parse(result.url);
        const queryParams = parsedUrl.queryParams as Record<string, string | undefined> | undefined;
        const idToken = queryParams?.id_token;

        if (idToken) {
          await signInWithGoogleCredential(idToken);
          void triggerNotification(Haptics.NotificationFeedbackType.Success);
          router.replace("/(tabs)");
        } else {
          Alert.alert("Error", "Could not complete Google Sign-In. No token received.");
        }
      } else if (result.type === "cancel") {
        Alert.alert("Cancelled", "Google Sign-In was cancelled");
      } else {
        Alert.alert("Error", "Could not complete Google Sign-In. Please try again.");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Google Sign-In failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient
        colors={Colors.gradientDark as [string, string, string]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? topInset : 0}
      >
          {!showSignupForm ? (
            // Main Login Screen
            <View
              style={[
                styles.mainContent,
                {
                  paddingHorizontal: horizontalPadding,
                  paddingBottom: bottomInset + 16,
                },
              ]}
            >
              <View
                style={[
                  styles.mainInner,
                  {
                    maxWidth: contentMaxWidth,
                    justifyContent: isVeryCompactHeight ? "space-between" : "space-evenly",
                  },
                ]}
              >
              {/* Hero Section with Artist Images */}
              <View
                style={[
                  styles.heroSection,
                  { height: heroVisualSize, marginBottom: isVeryCompactHeight ? 12 : 18 },
                ]}
              >
                <View style={[styles.circleGrid, { width: heroVisualSize, height: heroVisualSize }]}>
                  {/* Artist/Album Images from internet */}
                  <View
                    style={[
                      styles.artistCircle,
                      {
                        width: circleSize,
                        height: circleSize,
                        borderRadius: circleSize / 2,
                        top: Math.round(heroVisualSize * 0.02),
                        left: Math.round(heroVisualSize * 0.03),
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab67616d0000b273e787cffec20aa2a396a61647" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View
                    style={[
                      styles.artistCircle,
                      {
                        width: circleSize,
                        height: circleSize,
                        borderRadius: circleSize / 2,
                        top: Math.round(heroVisualSize * 0.08),
                        left: Math.round(heroVisualSize * 0.36),
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View
                    style={[
                      styles.artistCircle,
                      {
                        width: circleSize,
                        height: circleSize,
                        borderRadius: circleSize / 2,
                        top: Math.round(heroVisualSize * 0.02),
                        right: Math.round(heroVisualSize * 0.03),
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb8ae7f2aaa9817a704a87ea36" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View
                    style={[
                      styles.artistCircle,
                      {
                        width: circleSize,
                        height: circleSize,
                        borderRadius: circleSize / 2,
                        top: Math.round(heroVisualSize * 0.44),
                        left: Math.round(heroVisualSize * 0.01),
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb40b5c07ab77b6b1a9075fdc0" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View
                    style={[
                      styles.artistCircle,
                      {
                        width: circleSize,
                        height: circleSize,
                        borderRadius: circleSize / 2,
                        top: Math.round(heroVisualSize * 0.54),
                        left: Math.round(heroVisualSize * 0.42),
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb12d5ab979779aa0c87a8c8c0" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View
                    style={[
                      styles.artistCircle,
                      {
                        width: circleSize,
                        height: circleSize,
                        borderRadius: circleSize / 2,
                        top: Math.round(heroVisualSize * 0.44),
                        right: Math.round(heroVisualSize * 0.05),
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb6a224073987b930f99adc706" }}
                      style={styles.circleImage}
                    />
                  </View>
                </View>

                {/* Mavrixfy Logo */}
                <View
                  style={[
                    styles.logoCircle,
                    {
                      width: logoSize,
                      height: logoSize,
                      borderRadius: logoSize / 2,
                      marginLeft: -(logoSize / 2),
                      bottom: Math.round(heroVisualSize * 0.04),
                      padding: Math.round(logoSize * 0.22),
                    },
                  ]}
                >
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* Title */}
              <View
                style={[
                  styles.titleSection,
                  { marginBottom: isVeryCompactHeight ? 16 : 24 },
                ]}
              >
                <Text style={[styles.heroTitle, { fontSize: heroTitleSize, lineHeight: heroTitleLineHeight }]}>
                  Millions of songs.
                </Text>
                <Text style={[styles.heroTitle, { fontSize: heroTitleSize, lineHeight: heroTitleLineHeight }]}>
                  Free on Mavrixfy.
                </Text>
              </View>

              {/* Google Sign In */}
              <Pressable
                style={[styles.googleBtn, { height: primaryButtonHeight, marginBottom: 16 }]}
                onPress={handleGoogleSignIn}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <ActivityIndicator size="small" color={Colors.black} />
                ) : (
                  <>
                    <View style={styles.googleIconCircle}>
                      <MaterialCommunityIcons name="google" size={20} color="#DB4437" />
                    </View>
                    <Text style={styles.googleBtnText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>

              {/* Login Form */}
              <View style={[styles.formSection, { gap: formGap }]}>
                <View style={[styles.inputGroup, { marginBottom: formGap }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={Colors.inactive}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={Colors.primary}
                  />
                </View>

                <View style={[styles.inputGroup, { marginBottom: formGap }]}>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor={Colors.inactive}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      selectionColor={Colors.primary}
                    />
                    <Pressable
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.inactive}
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable style={styles.forgotPassword}>
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </Pressable>

                <Pressable
                  style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.black} />
                  ) : (
                    <Text style={styles.loginBtnText}>Log In</Text>
                  )}
                </Pressable>

                <View style={styles.signupPrompt}>
                  <Text style={styles.signupPromptText}>Don&apos;t have an account? </Text>
                  <Pressable onPress={() => setShowSignupForm(true)}>
                    <Text style={styles.signupLink}>Sign up</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            </View>
          ) : (
            // Signup Form
            <View
              style={[
                styles.signupContent,
                {
                  paddingHorizontal: horizontalPadding,
                  paddingBottom: bottomInset + 16,
                },
              ]}
            >
              <View
                style={[
                  styles.signupInner,
                  {
                    maxWidth: contentMaxWidth,
                    justifyContent: isVeryCompactHeight ? "flex-start" : "center",
                  },
                ]}
              >
              <Pressable
                style={styles.backButton}
                onPress={() => {
                  setShowSignupForm(false);
                  setEmail("");
                  setPassword("");
                  setFullName("");
                }}
              >
                <Ionicons name="arrow-back" size={24} color={Colors.text} />
              </Pressable>

              <View style={styles.signupHeader}>
                <Text style={styles.signupTitle}>Create your account</Text>
              </View>

              <View style={[styles.signupForm, { gap: formGap }]}>
                <View style={[styles.inputGroup, { marginBottom: formGap }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={Colors.inactive}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    selectionColor={Colors.primary}
                  />
                </View>

                <View style={[styles.inputGroup, { marginBottom: formGap }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={Colors.inactive}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={Colors.primary}
                  />
                </View>

                <View style={[styles.inputGroup, { marginBottom: formGap }]}>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor={Colors.inactive}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      selectionColor={Colors.primary}
                    />
                    <Pressable
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.inactive}
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.black} />
                  ) : (
                    <Text style={styles.loginBtnText}>Sign Up</Text>
                  )}
                </Pressable>

                <View style={styles.signupPrompt}>
                  <Text style={styles.signupPromptText}>Already have an account? </Text>
                  <Pressable onPress={() => setShowSignupForm(false)}>
                    <Text style={styles.signupLink}>Log in</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            </View>
          )}
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

  // Main Content
  mainContent: {
    flex: 1,
    width: "100%",
  },
  mainInner: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },

  // Hero Section with Colorful Circles
  heroSection: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  circleGrid: {
    alignSelf: "center",
    position: "relative",
  },
  artistCircle: {
    position: "absolute",
    overflow: "hidden",
  },
  circleImage: {
    width: "100%",
    height: "100%",
  },
  logoCircle: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    backgroundColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },

  // Title Section
  titleSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    lineHeight: 40,
  },

  // Google Button
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.text,
    borderRadius: 25,
    height: 50,
    marginBottom: 16,
    gap: 12,
  },
  googleIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.black,
  },

  // Form Section
  formSection: {
    gap: 10,
  },
  inputGroup: {
    marginBottom: 10,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: "absolute",
    right: 16,
    top: 14,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 25,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.black,
  },
  signupPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  signupPromptText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  signupLink: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textDecorationLine: "underline",
  },

  // Signup Screen
  signupContent: {
    flex: 1,
    width: "100%",
    paddingTop: 10,
  },
  signupInner: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  signupHeader: {
    marginBottom: 24,
  },
  signupTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  signupForm: {
    gap: 10,
  },
});
