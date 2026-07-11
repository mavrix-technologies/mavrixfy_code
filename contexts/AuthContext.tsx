import React, { createContext, use, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logLogin, logSignUp } from "@/lib/analytics";
import { Platform } from "react-native";
import { deleteUserFirestoreData } from "@/lib/firestore";
import { clearAppStorage } from "@/lib/storage";
import { clearUserCache } from "@/lib/cache";
import { compactMap } from "@/lib/arrayUtils";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import { logger } from "@/lib/logger";
import type { AppleMobileCredential } from "@/lib/appleAuth";
import { safeValidate, loginSchema, registerSchema, emailSchema } from "@/lib/validation";
import { checkRateLimit, clearRateLimit, formatRetryAfter } from "@/lib/rateLimiter";

interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  continueAsGuest: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleCredential: (idToken: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithAppleCredential: (credential: AppleMobileCredential) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: (options?: {
    password?: string;
    googleIdToken?: string;
    appleIdToken?: string;
    appleRawNonce?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthProviderState() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const buildAppUser = useCallback(async (fbUser: FirebaseUser): Promise<AppUser> => {
    let name = fbUser.displayName || "";
    let picture = fbUser.photoURL || "";

    try {
      const userDoc = await getDoc(doc(db, "users", fbUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        name = data.fullName || data.displayName || name;
        picture = data.imageUrl || data.photoURL || picture;
        const isAdmin =
          data.isAdmin === true ||
          data.admin === true ||
          String(data.role || "").toLowerCase() === "admin";
        return {
          id: fbUser.uid,
          email: fbUser.email || "",
          name,
          picture,
          isAdmin,
        };
      }
    } catch {}

    return {
      id: fbUser.uid,
      email: fbUser.email || "",
      name,
      picture,
      isAdmin: false,
    };
  }, []);

  const clearAuthState = useCallback((userId?: string | null) => {
    if (userId) {
      clearUserCache(userId);
    }
    setFirebaseUser(null);
    setUser(null);
    setIsGuest(false);
  }, []);

  const applyAuthenticatedSnapshot = useCallback((fbUser: FirebaseUser) => {
    setFirebaseUser(fbUser);
    setUser({
      id: fbUser.uid,
      email: fbUser.email || "",
      name: fbUser.displayName || "",
      picture: fbUser.photoURL || "",
      isAdmin: false,
    });
    setIsGuest(false);
    setLoading(false);
  }, []);

  const applySignedOutSnapshot = useCallback(() => {
    setFirebaseUser(null);
    setUser(null);
    setIsGuest(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Safety fallback timeout to prevent stuck loading / splash screen on boot
    const safetyTimeout = setTimeout(() => {
      setLoading((currLoading) => {
        if (currLoading) {
          logger.warn("[AuthContext] Firebase auth initialization timed out. Forcing loading = false.");
          return false;
        }
        return currLoading;
      });
    }, 4500); // 4.5 seconds safety window

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(safetyTimeout);
      if (fbUser) {
        applyAuthenticatedSnapshot(fbUser);
        // Enrich with Firestore data in the background (non-blocking)
        buildAppUser(fbUser).then(setUser).catch(() => {});
      } else {
        applySignedOutSnapshot();
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, [applyAuthenticatedSnapshot, applySignedOutSnapshot, buildAppUser]);

  const login = useCallback(async (email: string, password: string) => {
    // Rate limit check
    const emailLower = email.trim().toLowerCase();
    const rateLimit = await checkRateLimit('auth:login', emailLower);
    if (!rateLimit.allowed) {
      throw new Error(`Too many login attempts. Please try again in ${formatRetryAfter(rateLimit.retryAfter!)}`);
    }

    // Validate input
    const validation = safeValidate(loginSchema, { email, password });
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const { email: validEmail, password: validPassword } = validation.data;

    try {
      const cred = await signInWithEmailAndPassword(auth, validEmail, validPassword);
      const appUser = await buildAppUser(cred.user);
      setUser(appUser);
      setFirebaseUser(cred.user);
      setIsGuest(false);
      logLogin("email");
      
      // Clear rate limit on successful login
      await clearRateLimit('auth:login', emailLower);
    } catch (error: any) {
      // Don't clear rate limit on failed login - let it accumulate
      throw error;
    }
  }, [buildAppUser]);

  const continueAsGuest = useCallback(() => {
    if (!GUEST_LOGIN_ENABLED) {
      setFirebaseUser(null);
      setUser(null);
      setIsGuest(false);
      setLoading(false);
      throw new Error("Guest access is disabled in production builds.");
    }

    setFirebaseUser(null);
    setUser(null);
    setIsGuest(true);
    // Must clear loading so the auth guard can navigate to (tabs)
    setLoading(false);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    // Rate limit check
    const emailLower = email.trim().toLowerCase();
    const rateLimit = await checkRateLimit('auth:register', emailLower);
    if (!rateLimit.allowed) {
      throw new Error(`Too many registration attempts. Please try again in ${formatRetryAfter(rateLimit.retryAfter!)}`);
    }

    // Validate input
    const validation = safeValidate(registerSchema, { email, password, fullName });
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const { email: validEmail, password: validPassword, fullName: validFullName } = validation.data;

    const normalizedEmail = validEmail;
    const displayName = validFullName;
    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, validPassword);
    await Promise.all([
      updateProfile(cred.user, { displayName }),
      // Create user doc WITHOUT onboardingCompleted — the onboarding flow sets it
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules binds users/{uid} to request.auth.uid and blocks client-owned admin/role fields.
      setDoc(doc(db, "users", cred.user.uid), {
        email: normalizedEmail,
        emailLower: normalizedEmail.toLowerCase(),
        displayName,
        fullName: displayName,
        imageUrl: null,
        photoURL: null,
        provider: "password",
        onboardingCompleted: false,
        schemaVersion: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ]);
    const appUser: AppUser = {
      id: cred.user.uid,
      email: normalizedEmail,
      name: displayName,
      picture: "",
      isAdmin: false,
    };
    setUser(appUser);
    setFirebaseUser(cred.user);
    setIsGuest(false);
    logSignUp("email");
    
    // Clear rate limit on successful registration
    await clearRateLimit('auth:register', emailLower);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      const googleUserData = {
        email: fbUser.email || "",
        emailLower: (fbUser.email || "").toLowerCase(),
        displayName: fbUser.displayName || "",
        fullName: fbUser.displayName || "",
        imageUrl: fbUser.photoURL || null,
        photoURL: fbUser.photoURL || null,
        provider: "google.com",
        schemaVersion: 2,
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      if (!userDocSnap.exists()) {
        // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules binds users/{uid} to request.auth.uid and blocks client-owned admin/role fields.
        await setDoc(userDocRef, {
          ...googleUserData,
          createdAt: serverTimestamp(),
        });
        logSignUp("google");
      } else {
        // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules keeps auth/authorization fields immutable for user profile updates.
        await setDoc(userDocRef, googleUserData, { merge: true });
        logLogin("google");
      }
      const appUser = await buildAppUser(fbUser);
      setUser(appUser);
      setFirebaseUser(fbUser);
      setIsGuest(false);
    } else {
      throw new Error("Google Sign-In on native should use the mobile Google sign-in flow.");
    }
  }, [buildAppUser]);

  const signInWithGoogleCredential = useCallback(async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const fbUser = result.user;
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    const googleUserData = {
      email: fbUser.email || "",
      emailLower: (fbUser.email || "").toLowerCase(),
      displayName: fbUser.displayName || "",
      fullName: fbUser.displayName || "",
      imageUrl: fbUser.photoURL || null,
      photoURL: fbUser.photoURL || null,
      provider: "google.com",
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    if (!userDocSnap.exists()) {
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules binds users/{uid} to request.auth.uid and blocks client-owned admin/role fields.
      await setDoc(userDocRef, {
        ...googleUserData,
        createdAt: serverTimestamp(),
      });
      logSignUp("google");
    } else {
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules keeps auth/authorization fields immutable for user profile updates.
      await setDoc(userDocRef, googleUserData, { merge: true });
      logLogin("google");
    }
    const appUser = await buildAppUser(fbUser);
    setUser(appUser);
    setFirebaseUser(fbUser);
    setIsGuest(false);
  }, [buildAppUser]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== "web") {
      throw new Error("Apple Sign-In on native should use the Apple device sign-in flow.");
    }

    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");

    const result = await signInWithPopup(auth, provider);
    const fbUser = result.user;
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    const displayName = fbUser.displayName || "";
    const email = fbUser.email || "";
    const appleUserData = {
      email,
      emailLower: email.toLowerCase(),
      displayName,
      fullName: displayName,
      imageUrl: fbUser.photoURL || null,
      photoURL: fbUser.photoURL || null,
      provider: "apple.com",
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    if (!userDocSnap.exists()) {
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules binds users/{uid} to request.auth.uid and blocks client-owned admin/role fields.
      await setDoc(userDocRef, {
        ...appleUserData,
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
      });
      logSignUp("apple");
    } else {
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules keeps auth/authorization fields immutable for user profile updates.
      await setDoc(userDocRef, appleUserData, { merge: true });
      logLogin("apple");
    }

    const appUser = await buildAppUser(fbUser);
    setUser(appUser);
    setFirebaseUser(fbUser);
    setIsGuest(false);
  }, [buildAppUser]);

  const signInWithAppleCredential = useCallback(async (appleCredential: AppleMobileCredential) => {
    const provider = new OAuthProvider("apple.com");
    const credential = provider.credential({
      idToken: appleCredential.idToken,
      rawNonce: appleCredential.rawNonce,
    });
    const result = await signInWithCredential(auth, credential);
    const fbUser = result.user;
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    const displayName = appleCredential.fullName?.trim() || fbUser.displayName || "";
    const email = fbUser.email || appleCredential.email || "";

    if (displayName && !fbUser.displayName) {
      await updateProfile(fbUser, { displayName }).catch(() => {});
    }

    const appleUserData = {
      email,
      emailLower: email.toLowerCase(),
      imageUrl: fbUser.photoURL || null,
      photoURL: fbUser.photoURL || null,
      provider: "apple.com",
      appleUserId: appleCredential.user || null,
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    const appleNameData = displayName
      ? { displayName, fullName: displayName }
      : {};

    if (!userDocSnap.exists()) {
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules binds users/{uid} to request.auth.uid and blocks client-owned admin/role fields.
      await setDoc(userDocRef, {
        ...appleUserData,
        displayName,
        fullName: displayName,
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
      });
      logSignUp("apple");
    } else {
      // react-doctor-disable-next-line react-doctor/firebase-client-owned-authz-field -- firestore.rules keeps auth/authorization fields immutable for user profile updates.
      await setDoc(userDocRef, {
        ...appleUserData,
        ...appleNameData,
      }, { merge: true });
      logLogin("apple");
    }

    const appUser = await buildAppUser(fbUser);
    setUser(appUser);
    setFirebaseUser(fbUser);
    setIsGuest(false);
  }, [buildAppUser]);

  const resetPassword = useCallback(async (email: string) => {
    // Rate limit check
    const emailLower = email.trim().toLowerCase();
    const rateLimit = await checkRateLimit('auth:passwordReset', emailLower);
    if (!rateLimit.allowed) {
      throw new Error(`Too many password reset requests. Please try again in ${formatRetryAfter(rateLimit.retryAfter!)}`);
    }

    // Validate email
    const validation = safeValidate(emailSchema, email);
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const trimmedEmail = validation.data;
    if (!trimmedEmail) {
      throw new Error("Please enter your email address first.");
    }

    await sendPasswordResetEmail(auth, trimmedEmail);
    
    // Don't clear rate limit for password reset - keep the limit
  }, []);

  const deleteAccount = useCallback(async (options?: {
    password?: string;
    googleIdToken?: string;
    appleIdToken?: string;
    appleRawNonce?: string;
  }) => {
    // Rate limit check
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("No signed-in account was found.");
    }

    const userEmail = currentUser.email || '';
    const rateLimit = await checkRateLimit('auth:deleteAccount', userEmail.toLowerCase());
    if (!rateLimit.allowed) {
      throw new Error(`Too many deletion attempts. Please try again in ${formatRetryAfter(rateLimit.retryAfter!)}`);
    }

    const providerIds = compactMap(currentUser.providerData, (provider) => provider.providerId);
    const primaryProviderId = providerIds[0] || currentUser.providerId;

    if (primaryProviderId === "password") {
      const email = currentUser.email?.trim();
      const password = options?.password?.trim();

      if (!email) {
        throw new Error("This account is missing an email address.");
      }

      if (!password) {
        throw new Error("Please enter your password to confirm deletion.");
      }

      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(currentUser, credential);
    } else if (primaryProviderId === "google.com") {
      if (Platform.OS === "web") {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(currentUser, provider);
      } else {
        const googleIdToken = options?.googleIdToken?.trim();
        if (!googleIdToken) {
          throw new Error("Please confirm with Google before deleting your account.");
        }

        const credential = GoogleAuthProvider.credential(googleIdToken);
        await reauthenticateWithCredential(currentUser, credential);
      }
    } else if (primaryProviderId === "apple.com") {
      const provider = new OAuthProvider("apple.com");

      if (Platform.OS === "web") {
        await reauthenticateWithPopup(currentUser, provider);
      } else {
        const appleIdToken = options?.appleIdToken?.trim();
        const appleRawNonce = options?.appleRawNonce?.trim();

        if (!appleIdToken || !appleRawNonce) {
          throw new Error("Please confirm with Apple before deleting your account.");
        }

        const credential = provider.credential({
          idToken: appleIdToken,
          rawNonce: appleRawNonce,
        });
        await reauthenticateWithCredential(currentUser, credential);
      }
    }

    await Promise.all([
      deleteUserFirestoreData(currentUser.uid),
      clearAppStorage(),
    ]);
    await deleteUser(currentUser);
    clearAuthState(currentUser.uid);
    
    // Clear rate limit after successful deletion
    await clearRateLimit('auth:deleteAccount', userEmail.toLowerCase());
  }, [clearAuthState]);

  const logout = useCallback(async () => {
    const currentUserId = auth.currentUser?.uid || firebaseUser?.uid || user?.id;
    try {
      await firebaseSignOut(auth);
    } catch {}
    clearAuthState(currentUserId);
  }, [clearAuthState, firebaseUser?.uid, user?.id]);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      const appUser = await buildAppUser(auth.currentUser);
      setUser(appUser);
    }
  }, [buildAppUser]);

  return useMemo(() => ({
    user,
    firebaseUser,
    loading,
    isAuthenticated: !!user,
    isGuest,
    continueAsGuest,
    login,
    register,
    signInWithGoogle,
    signInWithGoogleCredential,
    signInWithApple,
    signInWithAppleCredential,
    resetPassword,
    deleteAccount,
    logout,
    refreshUser,
  }), [user, firebaseUser, loading, isGuest, continueAsGuest, login, register, signInWithGoogle, signInWithGoogleCredential, signInWithApple, signInWithAppleCredential, resetPassword, deleteAccount, logout, refreshUser]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthProviderState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
