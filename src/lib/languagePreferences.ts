import { auth, db } from "@/lib/firebase";
import { clearFeaturedArtistsCache } from "@/data/providers/ArtistProvider";
import { clearCatalogPlaylistCache } from "@/data/providers/MusicCatalogCategoryService";
import { clearDailyNewReleaseSongCache } from "@/data/providers/NewReleaseProvider";
import { notifyHomeCacheInvalidated } from "@/lib/homeCache";
import {
  DEFAULT_PREFERRED_LANGUAGES,
  INDIA_COUNTRY_CODE,
  type MusicLanguageId,
  normalizeMusicLanguages,
} from "@/lib/musicLanguages";
import { clearSearchRepositoryCache } from "@/lib/searchRepository";
import { getSettings, saveSettings } from "@/lib/storage";
import { clearYouTubeSearchCache } from "@/services/youtube/YouTubeMusic";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

export async function loadPreferredLanguages(): Promise<MusicLanguageId[]> {
  try {
    const settings = await getSettings();
    return normalizeMusicLanguages(settings.preferredLanguages);
  } catch {
    return [...DEFAULT_PREFERRED_LANGUAGES];
  }
}

export async function savePreferredLanguages(
  languages: readonly string[],
  userId?: string | null
): Promise<MusicLanguageId[]> {
  const normalized = normalizeMusicLanguages(languages);
  await saveSettings({ preferredLanguages: normalized });
  clearSearchRepositoryCache();
  clearYouTubeSearchCache();
  await Promise.allSettled([
    clearDailyNewReleaseSongCache(),
    clearCatalogPlaylistCache(),
    clearFeaturedArtistsCache(),
  ]);
  notifyHomeCacheInvalidated();

  const uid = userId || auth.currentUser?.uid;
  if (uid) {
    void setDoc(
      doc(db, "users", uid),
      {
        preferredLanguages: normalized,
        country: INDIA_COUNTRY_CODE,
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  }

  return normalized;
}

export async function syncProfileLanguagesToLocal(
  profileLanguages?: readonly string[]
): Promise<MusicLanguageId[] | null> {
  if (!Array.isArray(profileLanguages) || profileLanguages.length === 0) return null;
  const normalized = normalizeMusicLanguages(profileLanguages);
  const current = await getSettings().catch(() => null);
  const currentNorm = normalizeMusicLanguages(current?.preferredLanguages);
  if (
    currentNorm.length === normalized.length &&
    currentNorm.every((item, idx) => item === normalized[idx])
  ) {
    return normalized;
  }
  await saveSettings({ preferredLanguages: normalized });
  clearSearchRepositoryCache();
  clearYouTubeSearchCache();
  notifyHomeCacheInvalidated();
  return normalized;
}
