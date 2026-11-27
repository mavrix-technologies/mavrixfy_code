import { IS_WEB } from "@/constants/platform";
import { getAccountScope,setAccountScope } from "@/lib/accountScope";
import { logLogin,logSignUp } from "@/lib/analytics";
import type { AppleMobileCredential } from "@/lib/appleAuth";
import { compactMap } from "@/lib/arrayUtils";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import { clearUserCache } from "@/lib/cache";
import { resumeDownloadQueue,suspendDownloadQueue } from "@/lib/downloads/downloadQueue";
import { getDownloadsRootUri } from "@/lib/downloads/filesystem";
import { auth } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { checkRateLimit,clearRateLimit,formatRetryAfter } from "@/lib/rateLimiter";
import { clearAppStorage } from "@/lib/storage";
import { emailSchema,loginSchema,registerSchema,safeValidate } from "@/lib/validation";
import { subscribeToUserProfile,syncUserProfile,toAppUser,type AppUser } from "@/services/auth/userProfile";
import { deleteAsync } from "expo-file-system/legacy";
import {
createUserWithEmailAndPassword,
deleteUser,
EmailAuthProvider,
signOut as firebaseSignOut,
User as FirebaseUser,
GoogleAuthProvider,
getAdditionalUserInfo,
OAuthProvider,
onAuthStateChanged,
reauthenticateWithCredential,
reauthenticateWithPopup,
sendPasswordResetEmail,
signInWithCredential,
signInWithEmailAndPassword,
signInWithPopup,
updateProfile,
} from "firebase/auth";
import React,{ createContext,use,useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from "react";

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  continueAsGuest: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, preferredLanguages?: string[]) => Promise<void>;
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

// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const authGeneration = useRef(0);

  const applyAuthenticatedSnapshot = useCallback((fbUser: FirebaseUser) => {
    // React automatically batches these updates
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setFirebaseUser(fbUser);
    setIsGuest(false);
    setLoading(false);
    setUser(toAppUser(fbUser));
  }, []);

  const applySignedOutSnapshot = useCallback(() => {
    setFirebaseUser(null);
    setUser(null);
    setIsGuest(false);
    setLoading(false);
  }, []);

  // Firestore enriches the authenticated identity; it never blocks login or startup.
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeToUserProfile(firebaseUser, setUser, (error) => {
      logger.warn("[AuthContext] Profile synchronization failed:", error);
    });
  }, [firebaseUser]);

  useEffect(() => {
    let isSubscribed = true;

    // Failsafe timeout: 15 seconds to ensure the app never hangs indefinitely
    // in rare native storage lockups, while giving cellular networks plenty of time.
    const safetyTimeout = setTimeout(() => {
      if (!isSubscribed) return;
      logger.warn("[AuthContext] Firebase auth initialization took over 15s. Checking currentUser...");
      if (auth.currentUser) {
        applyAuthenticatedSnapshot(auth.currentUser);
      } else {
        setLoading(false);
      }
    }, 15000);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (fbUser) => {
        clearTimeout(safetyTimeout);
        if (!isSubscribed) return;
        const generation = ++authGeneration.current;
        const uid = fbUser?.uid ?? null;
        if (getAccountScope().accountId !== uid) {
          setLoading(true);
          await suspendDownloadQueue();
          if (!isSubscribed || generation !== authGeneration.current) return;
          setAccountScope(uid);
          resumeDownloadQueue();
        }

        if (fbUser) {
          // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
          applyAuthenticatedSnapshot(fbUser);
        } else {
          applySignedOutSnapshot();
        }
      },
      (error) => {
        clearTimeout(safetyTimeout);
        logger.error("[AuthContext] onAuthStateChanged error:", error);
        if (isSubscribed) {
          // In case of a network or transient error during token refresh on cellular,
          // never sign out if auth.currentUser is already active.
          if (auth.currentUser) {
            applyAuthenticatedSnapshot(auth.currentUser);
          } else {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      isSubscribed = false;
      authGeneration.current += 1;
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, [applyAuthenticatedSnapshot, applySignedOutSnapshot]);

  const login = useCallback(async (email: string, password: string) => {
    // Validate input
    const validation = safeValidate(loginSchema, { email, password });
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const { email: validEmail, password: validPassword } = validation.data;

    // Firebase handles server-side brute-force protection
    await signInWithEmailAndPassword(auth, validEmail, validPassword);
    logLogin("email");
  }, []);

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

  const register = useCallback(async (email: string, password: string, fullName: string, preferredLanguages?: string[]) => {
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
    void updateProfile(cred.user, { displayName }).catch((error) => {
      logger.warn("[AuthContext] Auth display name update failed:", error);
    });
    void syncUserProfile(cred.user, {
      fullName: displayName,
      ...(preferredLanguages?.length ? { preferredLanguages } : {}),
    }).catch((error) => {
      logger.warn("[AuthContext] New profile synchronization failed:", error);
    });
    logSignUp("email");
    
    // Clear rate limit on successful registration
    void clearRateLimit('auth:register', emailLower).catch(() => {});
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!IS_WEB) throw new Error("Google Sign-In on native should use the native Google flow.");
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    if (getAdditionalUserInfo(result)?.isNewUser) logSignUp("google");
    else logLogin("google");
  }, []);

  const signInWithGoogleCredential = useCallback(async (idToken: string) => {
    const result = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    if (getAdditionalUserInfo(result)?.isNewUser) logSignUp("google");
    else logLogin("google");
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!IS_WEB) throw new Error("Apple Sign-In on native should use the Apple device sign-in flow.");
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const result = await signInWithPopup(auth, provider);
    if (getAdditionalUserInfo(result)?.isNewUser) logSignUp("apple");
    else logLogin("apple");
  }, []);

  const signInWithAppleCredential = useCallback(async (appleCredential: AppleMobileCredential) => {
    const provider = new OAuthProvider("apple.com");
    const result = await signInWithCredential(auth, provider.credential({
      idToken: appleCredential.idToken,
      rawNonce: appleCredential.rawNonce,
    }));
    const displayName = appleCredential.fullName?.trim() || result.user.displayName || "";
    if (displayName && !result.user.displayName) {
      void updateProfile(result.user, { displayName }).catch((error) => {
        logger.warn("[AuthContext] Apple display name update failed:", error);
      });
    }
    void syncUserProfile(result.user, {
      fullName: displayName,
      email: appleCredential.email || undefined,
      appleUserId: appleCredential.user || undefined,
    }).catch((error) => {
      logger.warn("[AuthContext] Apple profile synchronization failed:", error);
    });
    if (getAdditionalUserInfo(result)?.isNewUser) logSignUp("apple");
    else logLogin("apple");
  }, []);

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
      const password = options?.password;

      if (!email) {
        throw new Error("This account is missing an email address.");
      }

      if (!password) {
        throw new Error("Please enter your password to confirm deletion.");
      }

      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(currentUser, credential);
    } else if (primaryProviderId === "google.com") {
      if (IS_WEB) {
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

      if (IS_WEB) {
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

    await deleteUser(currentUser).then(() =>
      Promise.all([
        clearAppStorage({ userId: currentUser.uid }),
        deleteAsync(getDownloadsRootUri(currentUser.uid), { idempotent: true }),
        clearRateLimit('auth:deleteAccount', userEmail.toLowerCase()),
      ])
    );
    clearUserCache(currentUser.uid);
  }, []);

  const logout = useCallback(async () => {
    const currentUserId = auth.currentUser?.uid || firebaseUser?.uid || user?.id;
    authGeneration.current += 1;
    await firebaseSignOut(auth);
    if (currentUserId) clearUserCache(currentUserId);
  }, [firebaseUser?.uid, user?.id]);

  const refreshUser = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    // The live listener applies the result; a pending server write must not lock the caller.
    void syncUserProfile(currentUser).catch((error) => {
      logger.warn("[AuthContext] Profile refresh failed:", error);
    });
  }, []);

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
    signInWithApple,
    signInWithAppleCredential,
    resetPassword,
    deleteAccount,
    logout,
    refreshUser,
  }), [user, firebaseUser, loading, isGuest, continueAsGuest, login, register, signInWithGoogle, signInWithGoogleCredential, signInWithApple, signInWithAppleCredential, resetPassword, deleteAccount, logout, refreshUser]);

  return <AuthContext.Provider value={value}><React.Fragment key={user?.id ?? "guest"}>{loading ? null : children}</React.Fragment></AuthContext.Provider>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
