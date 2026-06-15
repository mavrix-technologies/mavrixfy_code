/**
 * Download Button Component
 * 
 * Shows download/delete button for YouTube Music songs
 * Supports offline playback
 */

import React, { useState, useEffect } from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import type { Song } from '@/lib/musicData';
import {
  downloadAudioFile,
  isDownloaded,
  deleteDownload,
  type DownloadedSong,
} from '@/lib/offlineDownloadService';
import { logger } from '@/lib/logger';

interface DownloadButtonProps {
  song: Song;
  size?: number;
  color?: string;
  onDownloadComplete?: (localUri: string) => void;
  onDownloadDeleted?: () => void;
}

export default function DownloadButton({
  song,
  size = 24,
  color = Colors.text.primary,
  onDownloadComplete,
  onDownloadDeleted,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedInfo, setDownloadedInfo] = useState<DownloadedSong | null>(null);

  useEffect(() => {
    checkDownloadStatus();
  }, [song.id]);

  async function checkDownloadStatus() {
    if (song.source === 'youtube' && song.youtubeVideoId) {
      const info = await isDownloaded(song.youtubeVideoId);
      setDownloadedInfo(info);
    }
  }

  async function handleDownload() {
    if (!song.youtubeVideoId) {
      Alert.alert('Error', 'This song cannot be downloaded');
      return;
    }

    if (isDownloading) {
      return; // Already downloading
    }

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const localUri = await downloadAudioFile(
        song,
        (progress) => {
          setDownloadProgress(progress);
        }
      );

      if (localUri) {
        // Refresh download status
        await checkDownloadStatus();
        onDownloadComplete?.(localUri);
        
        Alert.alert(
          'Download Complete',
          `"${song.title}" is now available offline`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Download Failed',
          'Could not download this song. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      logger.error('[DownloadButton] Download error:', error);
      Alert.alert(
        'Download Failed',
        error.message || 'An error occurred during download',
        [{ text: 'OK' }]
      );
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  }

  async function handleDelete() {
    if (!song.youtubeVideoId) {
      return;
    }

    Alert.alert(
      'Delete Download',
      `Remove "${song.title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteDownload(song.youtubeVideoId!);
            if (success) {
              setDownloadedInfo(null);
              onDownloadDeleted?.();
            } else {
              Alert.alert('Error', 'Failed to delete download');
            }
          },
        },
      ]
    );
  }

  // Only show for YouTube songs
  if (song.source !== 'youtube' || !song.youtubeVideoId) {
    return null;
  }

  return (
    <Pressable
      onPress={downloadedInfo ? handleDelete : handleDownload}
      disabled={isDownloading}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
    >
      {isDownloading ? (
        <View style={styles.progressContainer}>
          <ActivityIndicator size="small" color={Colors.accent.primary} />
          {downloadProgress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
            </View>
          )}
        </View>
      ) : (
        <Ionicons
          name={downloadedInfo ? 'checkmark-circle' : 'download-outline'}
          size={size}
          color={downloadedInfo ? Colors.accent.primary : color}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  progressContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent.primary,
    borderRadius: 1,
  },
});
