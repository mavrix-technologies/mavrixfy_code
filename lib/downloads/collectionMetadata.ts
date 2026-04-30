/**
 * Collection Metadata Storage
 * 
 * Stores playlist/album metadata (name, image) for downloaded collections
 * so we can display proper playlist cards in the downloads screen.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib/logger";

const COLLECTION_METADATA_KEY = "@mavrixfy/collection_metadata";

export interface CollectionMetadata {
  id: string;
  name: string;
  imageUrl: string;
  type?: "playlist" | "album";
  songCount?: number;
  createdAt: string;
}

type CollectionMetadataMap = Record<string, CollectionMetadata>;

/**
 * Save collection metadata
 */
export async function saveCollectionMetadata(
  collectionId: string,
  metadata: Omit<CollectionMetadata, "id" | "createdAt">
): Promise<void> {
  try {
    const existing = await loadAllCollectionMetadata();
    existing[collectionId] = {
      id: collectionId,
      ...metadata,
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(COLLECTION_METADATA_KEY, JSON.stringify(existing));
  } catch (err) {
    logger.error("[CollectionMetadata] saveCollectionMetadata failed", err);
  }
}

/**
 * Load collection metadata by ID
 */
export async function loadCollectionMetadata(
  collectionId: string
): Promise<CollectionMetadata | null> {
  try {
    const all = await loadAllCollectionMetadata();
    return all[collectionId] ?? null;
  } catch (err) {
    logger.error("[CollectionMetadata] loadCollectionMetadata failed", err);
    return null;
  }
}

/**
 * Load all collection metadata
 */
export async function loadAllCollectionMetadata(): Promise<CollectionMetadataMap> {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_METADATA_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CollectionMetadataMap;
  } catch (err) {
    logger.error("[CollectionMetadata] loadAllCollectionMetadata failed", err);
    return {};
  }
}

/**
 * Delete collection metadata
 */
export async function deleteCollectionMetadata(collectionId: string): Promise<void> {
  try {
    const existing = await loadAllCollectionMetadata();
    delete existing[collectionId];
    await AsyncStorage.setItem(COLLECTION_METADATA_KEY, JSON.stringify(existing));
  } catch (err) {
    logger.error("[CollectionMetadata] deleteCollectionMetadata failed", err);
  }
}

/**
 * Clear all collection metadata
 */
export async function clearAllCollectionMetadata(): Promise<void> {
  try {
    await AsyncStorage.removeItem(COLLECTION_METADATA_KEY);
  } catch (err) {
    logger.error("[CollectionMetadata] clearAllCollectionMetadata failed", err);
  }
}
