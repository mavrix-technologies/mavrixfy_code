/**
 * Offline Download Service
 * 
 * Provides functionality to download YouTube Music songs for offline playback
 */

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getYouTubeMusicApiUrl } from '@/lib/api-config';
import { logger } from '@/lib/logger';
import type { Song } from '@/lib/musicData';

// Constants
const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const DOWNLOADS_METADATA_KEY = '@mavrixfy_downloads';

export interface DownloadInfo {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  downloadUrl: string;
  format: string;
  filesize?: number;
  bitrate?: number;
  sampleRate?: number;
}

export interface DownloadedSong {
  videoId: string;
  songId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  localUri: string;
  filesize: number;
  format: string;
  downloadedAt: number;
}

/**
 * Initialize downloads directory
 */
async function ensureDownloadsDirExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
      logger.info('[Download] Created downloads directory');
    }
  } catch (error) {
    logger.error('[Download] Failed to create downloads directory:', error);
    throw error;
  }
}

/**
 * Get download metadata from backend
 */
export async function getDownloadInfo(videoId: string): Promise<DownloadInfo | null> {
  try {
    const apiUrl = getYouTubeMusicApiUrl();
    const url = `${apiUrl}download/${videoId}`;
    
    logger.info(`[Download] Fetching download info for ${videoId}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error('Invalid response from backend');
    }
    
    return data.data;
    
  } catch (error: any) {
    logger.error('[Download] Failed to get download info:', error);
    return null;
  }
}

/**
 * Download audio file to device storage
 */
export async function downloadAudioFile(
  song: Song,
  onProgress?: (progress: number) => void
): Promise<string | null> {
  try {
    if (!song.youtubeVideoId) {
      throw new Error('Song must have youtubeVideoId');
    }
    
    await ensureDownloadsDirExists();
    
    // Get download URL from backend
    logger.info(`[Download] Starting download for: ${song.title}`);
    const info = await getDownloadInfo(song.youtubeVideoId);
    
    if (!info) {
      throw new Error('Failed to get download URL');
    }
    
    // Generate safe filename
    const safeTitle = song.title.replace(/[^a-zA-Z0-9_\s-]/g, '').substring(0, 50);
    const filename = `${song.youtubeVideoId}_${safeTitle}.${info.format}`;
    const localUri = `${DOWNLOADS_DIR}${filename}`;
    
    // Check if already downloaded
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      logger.info('[Download] File already exists, skipping download');
      await saveDownloadMetadata(song, info, localUri);
      return localUri;
    }
    
    // Download file with progress tracking
    logger.info('[Download] Downloading file...');
    
    const downloadResumable = FileSystem.createDownloadResumable(
      info.downloadUrl,
      localUri,
      {},
      (downloadProgress) => {
        const progress = 
          downloadProgress.totalBytesWritten / 
          downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );
    
    const result = await downloadResumable.downloadAsync();
    
    if (!result) {
      throw new Error('Download failed');
    }
    
    logger.info(`[Download] Download completed: ${result.uri}`);
    
    // Save metadata
    await saveDownloadMetadata(song, info, result.uri);
    
    return result.uri;
    
  } catch (error: any) {
    logger.error('[Download] Download failed:', error);
    return null;
  }
}

/**
 * Save download metadata to AsyncStorage
 */
async function saveDownloadMetadata(
  song: Song,
  info: DownloadInfo,
  localUri: string
): Promise<void> {
  try {
    const downloads = await getAllDownloads();
    
    const downloadedSong: DownloadedSong = {
      videoId: info.videoId,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      duration: info.duration,
      thumbnail: song.coverUrl || info.thumbnail,
      localUri,
      filesize: info.filesize || 0,
      format: info.format,
      downloadedAt: Date.now(),
    };
    
    // Add or update
    const existing = downloads.findIndex(d => d.videoId === info.videoId);
    if (existing !== -1) {
      downloads[existing] = downloadedSong;
    } else {
      downloads.push(downloadedSong);
    }
    
    await AsyncStorage.setItem(DOWNLOADS_METADATA_KEY, JSON.stringify(downloads));
    logger.info('[Download] Saved metadata for', song.title);
    
  } catch (error) {
    logger.error('[Download] Failed to save metadata:', error);
  }
}

/**
 * Get all downloaded songs metadata
 */
export async function getAllDownloads(): Promise<DownloadedSong[]> {
  try {
    const data = await AsyncStorage.getItem(DOWNLOADS_METADATA_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    logger.error('[Download] Failed to get downloads:', error);
    return [];
  }
}

/**
 * Check if a song is downloaded
 */
export async function isDownloaded(videoId: string): Promise<DownloadedSong | null> {
  try {
    const downloads = await getAllDownloads();
    const downloaded = downloads.find(d => d.videoId === videoId);
    
    if (downloaded) {
      // Verify file still exists
      const fileInfo = await FileSystem.getInfoAsync(downloaded.localUri);
      if (fileInfo.exists) {
        return downloaded;
      } else {
        // File was deleted, remove from metadata
        await deleteDownload(videoId);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('[Download] Failed to check download status:', error);
    return null;
  }
}

/**
 * Delete downloaded file and metadata
 */
export async function deleteDownload(videoId: string): Promise<boolean> {
  try {
    const downloads = await getAllDownloads();
    const download = downloads.find(d => d.videoId === videoId);
    
    if (!download) {
      return false;
    }
    
    // Delete file
    const fileInfo = await FileSystem.getInfoAsync(download.localUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(download.localUri);
      logger.info('[Download] Deleted file:', download.localUri);
    }
    
    // Remove from metadata
    const updated = downloads.filter(d => d.videoId !== videoId);
    await AsyncStorage.setItem(DOWNLOADS_METADATA_KEY, JSON.stringify(updated));
    logger.info('[Download] Removed metadata for', videoId);
    
    return true;
    
  } catch (error) {
    logger.error('[Download] Failed to delete download:', error);
    return false;
  }
}

/**
 * Get total size of all downloads
 */
export async function getTotalDownloadSize(): Promise<number> {
  try {
    const downloads = await getAllDownloads();
    return downloads.reduce((total, d) => total + (d.filesize || 0), 0);
  } catch (error) {
    return 0;
  }
}

/**
 * Clear all downloads
 */
export async function clearAllDownloads(): Promise<boolean> {
  try {
    const downloads = await getAllDownloads();
    
    // Delete all files
    for (const download of downloads) {
      const fileInfo = await FileSystem.getInfoAsync(download.localUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(download.localUri);
      }
    }
    
    // Clear metadata
    await AsyncStorage.removeItem(DOWNLOADS_METADATA_KEY);
    logger.info('[Download] Cleared all downloads');
    
    return true;
  } catch (error) {
    logger.error('[Download] Failed to clear downloads:', error);
    return false;
  }
}
