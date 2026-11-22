import { auth, db } from "@/lib/firebase";
import type { User } from "firebase/auth";
import { doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  isAdmin: boolean;
}

interface ProfileDetails {
  fullName?: string;
  email?: string;
  appleUserId?: string;
}

export function toAppUser(user: User, data: Record<string, unknown> = {}): AppUser {
  return {
    id: user.uid,
    email: user.email || "",
    name: String(data.fullName || data.displayName || user.displayName || ""),
    picture: String(data.imageUrl || data.photoURL || user.photoURL || ""),
    isAdmin: data.isAdmin === true || data.admin === true || String(data.role || "").toLowerCase() === "admin",
  };
}

/** Profile synchronization never decides whether Firebase authentication succeeded. */
export async function syncUserProfile(user: User, details: ProfileDetails = {}): Promise<void> {
  if (auth.currentUser?.uid !== user.uid) return;
  const ref = doc(db, "users", user.uid);
  const name = details.fullName?.trim() || user.displayName || "";
  const email = user.email || details.email || "";
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (auth.currentUser?.uid !== user.uid) return;
    if (!snapshot.exists()) {
      transaction.set(ref, {
        email,
        emailLower: email.toLowerCase(),
        displayName: name,
        fullName: name,
        imageUrl: user.photoURL || null,
        photoURL: user.photoURL || null,
        provider: user.providerData[0]?.providerId || "password",
        ...(details.appleUserId ? { appleUserId: details.appleUserId } : {}),
        onboardingCompleted: false,
        schemaVersion: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } else {
      const data = snapshot.data();
      // Preserve profile edits and the identity/authorization fields enforced by rules.
      transaction.update(ref, {
        ...(!data.fullName && name ? { fullName: name } : {}),
        ...(!data.displayName && name ? { displayName: name } : {}),
        ...(!data.appleUserId && details.appleUserId ? { appleUserId: details.appleUserId } : {}),
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export function subscribeToUserProfile(
  user: User,
  onProfile: (profile: AppUser) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let syncing = false;
  let synced = false;
  const unsubscribe = onSnapshot(doc(db, "users", user.uid), { includeMetadataChanges: true }, (snapshot) => {
    if (!active || auth.currentUser?.uid !== user.uid) return;
    onProfile(toAppUser(user, snapshot.exists() ? snapshot.data() : undefined));
    // An empty local cache is not proof that a user's remote profile is missing.
    if (snapshot.metadata.fromCache || syncing || synced) return;
    syncing = true;
    void syncUserProfile(user).then(() => { synced = true; }).catch((error: unknown) => {
      if (active && auth.currentUser?.uid === user.uid) onError(error);
    }).finally(() => { syncing = false; });
  }, (error) => {
    if (active && auth.currentUser?.uid === user.uid) onError(error);
  });
  return () => { active = false; unsubscribe(); };
}
