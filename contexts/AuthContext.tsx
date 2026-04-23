import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logLogin, logSignUp } from "@/lib/analytics";
import { Platform } from "react-native";
import { deleteUserFirestoreData } from "@/lib/firestore";
import { clearAppStorage } from "@/lib/storage";
import { clearUserCache } from "@/lib/cache";

interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string;
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
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: (options?: { password?: string; googleIdToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
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
      }
    } catch {}

    return {
      id: fbUser.uid,
      email: fbUser.email || "",
      name,
      picture,
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        const appUser = await buildAppUser(fbUser);
        setUser(appUser);
        setIsGuest(false);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setIsGuest(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [buildAppUser]);

  const login = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const appUser = await buildAppUser(cred.user);
    setUser(appUser);
    setFirebaseUser(cred.user);
    setIsGuest(false);
    logLogin("email");
  }, [buildAppUser]);

  const continueAsGuest = useCallback(() => {
    setFirebaseUser(null);
    setUser(null);
    setIsGuest(true);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    // Create user doc WITHOUT onboardingCompleted — the onboarding flow sets it
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      fullName,
      imageUrl: null,
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
    });
    const appUser: AppUser = {
      id: cred.user.uid,
      email,
      name: fullName,
      picture: "",
    };
    setUser(appUser);
    setFirebaseUser(cred.user);
    setIsGuest(false);
    logSignUp("email");
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          email: fbUser.email,
          fullName: fbUser.displayName || "",
          imageUrl: fbUser.photoURL || null,
          uid: fbUser.uid,
          createdAt: new Date().toISOString(),
        });
        logSignUp("google");
      } else {
        logLogin("google");
      }
      const appUser = await buildAppUser(fbUser);
      setUser(appUser);
      setFirebaseUser(fbUser);
      setIsGuest(false);
    } else {
      throw new Error("Google Sign-In on native requires expo-auth-session. Use the mobile Google Sign-In button instead.");
    }
  }, [buildAppUser]);

  const signInWithGoogleCredential = useCallback(async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const fbUser = result.user;
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      await setDoc(userDocRef, {
        email: fbUser.email,
        fullName: fbUser.displayName || "",
        imageUrl: fbUser.photoURL || null,
        uid: fbUser.uid,
        createdAt: new Date().toISOString(),
      });
      logSignUp("google");
    } else {
      logLogin("google");
    }
    const appUser = await buildAppUser(fbUser);
    setUser(appUser);
    setFirebaseUser(fbUser);
    setIsGuest(false);
  }, [buildAppUser]);

  const resetPassword = useCallback(async (email: string) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      throw new Error("Please enter your email address first.");
    }

    await sendPasswordResetEmail(auth, trimmedEmail);
  }, []);

  const deleteAccount = useCallback(async (options?: { password?: string; googleIdToken?: string }) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("No signed-in account was found.");
    }

    const providerIds = currentUser.providerData
      .map((provider) => provider.providerId)
      .filter(Boolean);
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
    }

    await deleteUserFirestoreData(currentUser.uid);
    await clearAppStorage();
    await deleteUser(currentUser);
    clearAuthState(currentUser.uid);
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

  const value = useMemo(() => ({
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
    resetPassword,
    deleteAccount,
    logout,
    refreshUser,
  }), [user, firebaseUser, loading, isGuest, continueAsGuest, login, register, signInWithGoogle, signInWithGoogleCredential, resetPassword, deleteAccount, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
