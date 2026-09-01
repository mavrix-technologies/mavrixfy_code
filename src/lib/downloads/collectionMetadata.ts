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

async function loadAllCollectionMetadata(): Promise<CollectionMetadataMap> {
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
