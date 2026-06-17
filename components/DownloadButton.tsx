/**
 * Download Button Component
 * 
 * Shows download/delete button for YouTube Music and JioSaavn songs
 * Supports offline playback
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View, Alert, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useDownloads, useSongDownload } from '@/contexts/DownloadContext';
import type { Song } from '@/lib/musicData';
import {
  downloadAudioFile,
  isDownloaded as isYtDownloaded,
  deleteDownload as deleteYtDownload,
  getDownloadInfo,
  type DownloadedSong,
} from '@/lib/offlineDownloadService';
import { logger } from '@/lib/logger';
import { formatBytes } from '@/lib/downloads/storagePolicy';

function resolveSongAudioUrl(song: Song): string {
  if (song.audioUrl) return song.audioUrl;
  
  // @ts-ignore
  const directCandidates = [song.url, song.uri, song.streamUrl, song.downloadUrl];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  // @ts-ignore
  const downloadUrlValue = song.downloadUrl;
  if (downloadUrlValue && typeof downloadUrlValue === 'object') {
    const nested = (downloadUrlValue as any).url || (downloadUrlValue as any).link;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }

  return '';
}

interface DownloadButtonProps {
  song: Song;
  size?: number;
  color?: string;
  onDownloadComplete?: (localUri: string) => void;
  onDownloadDeleted?: () => void;
  style?: any;
  showLabel?: boolean;
}

export default function DownloadButton({
  song,
  size = 24,
  color = Colors.text,
  onDownloadComplete,
  onDownloadDeleted,
  style,
  showLabel = false,
}: DownloadButtonProps) {
  const { refreshDownloads, downloadSong, removeDownload } = useDownloads();
  const jioDownload = useSongDownload(song.id);

  // Local state for YouTube download tracking
  const [ytDownloading, setYtDownloading] = useState(false);
  const [ytProgress, setYtProgress] = useState(0);
  const [ytDownloadedInfo, setYtDownloadedInfo] = useState<DownloadedSong | null>(null);

  const checkYtDownloadStatus = useCallback(async () => {
    if (song.source === 'youtube' && song.youtubeVideoId) {
      const info = await isYtDownloaded(song.youtubeVideoId);
      setYtDownloadedInfo(info);
    }
  }, [song.source, song.youtubeVideoId]);

  // Sync YouTube download status on mount/song change
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-derived-state
    checkYtDownloadStatus();
  }, [checkYtDownloadStatus]);

  // Derive unified states
  const isJio = song.source !== 'youtube';

  const isDownloaded = isJio
    ? jioDownload?.status === 'completed'
    : !!ytDownloadedInfo;

  const isDownloading = isJio
    ? (jioDownload?.status === 'downloading' ||
       jioDownload?.status === 'queued' ||
       jioDownload?.status === 'waiting_for_wifi' ||
       jioDownload?.status === 'waiting_for_charging')
    : ytDownloading;

  const progress = isJio
    ? (jioDownload?.progress ?? 0) / 100
    : ytProgress;

  async function handleDownload() {
    if (isDownloading) return;

    if (isJio) {
      // JioSaavn download confirmation (Fetch actual size using HEAD request, fall back to estimate)
      setYtDownloading(true);
      try {
        let sizeLabel = 'unknown size';
        let actualSize: number | null = null;
        
        const audioUrl = resolveSongAudioUrl(song);
        if (audioUrl) {
          try {
            const response = await fetch(audioUrl, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
              actualSize = parseInt(contentLength, 10);
              sizeLabel = formatBytes(actualSize);
            }
          } catch (err) {
            logger.warn('[DownloadButton] Failed to fetch JioSaavn actual size:', err);
          }
        }

        if (!actualSize) {
          const estimatedBytes = (song.duration || 0) * 25_000;
          sizeLabel = estimatedBytes > 0 ? `~${formatBytes(estimatedBytes)}` : 'unknown size';
        }

        setYtDownloading(false);

        Alert.alert(
          'Download Song',
          `Download "${song.title}" for offline playback?\n\nSize: ${sizeLabel}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Download',
              onPress: async () => {
                try {
                  const res = await downloadSong(song);
                  if (!res.ok) {
                    Alert.alert('Download Failed', res.reason || 'Could not queue download');
                  }
                } catch (err: any) {
                  Alert.alert('Download Failed', err.message || 'An error occurred');
                }
              }
            }
          ]
        );
      } catch (err: any) {
        setYtDownloading(false);
        Alert.alert('Download Failed', err.message || 'An error occurred');
      }
    } else {
      // YouTube download confirmation (Fetch actual size from backend first)
      if (!song.youtubeVideoId) {
        Alert.alert('Error', 'This song cannot be downloaded');
        return;
      }

      setYtDownloading(true);
      setYtProgress(0);

      try {
        const info = await getDownloadInfo(song.youtubeVideoId);
        if (!info) {
          throw new Error('Failed to get download details');
        }

        const sizeLabel = info.filesize ? formatBytes(info.filesize) : 'unknown size';

        Alert.alert(
          'Download Song',
          `Download "${song.title}" for offline playback?\n\nSize: ${sizeLabel}`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setYtDownloading(false);
                setYtProgress(0);
              }
            },
            {
              text: 'Download',
              onPress: async () => {
                try {
                  const localUri = await downloadAudioFile(
                    song,
                    (p) => setYtProgress(p)
                  );

                  if (localUri) {
                    await checkYtDownloadStatus();
                    await refreshDownloads?.();
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
                } catch (err: any) {
                  logger.error('[DownloadButton] YouTube download failed:', err);
                  Alert.alert(
                    'Download Failed',
                    err.message || 'An error occurred during download',
                    [{ text: 'OK' }]
                  );
                } finally {
                  setYtDownloading(false);
                  setYtProgress(0);
                }
              }
            }
          ]
        );
      } catch (error: any) {
        setYtDownloading(false);
        setYtProgress(0);
        logger.error('[DownloadButton] Fetch info error:', error);
        Alert.alert('Download Failed', error.message || 'Could not fetch song details');
      }
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Download',
      `Remove "${song.title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (isJio) {
              await removeDownload(song.id);
              onDownloadDeleted?.();
            } else {
              if (!song.youtubeVideoId) return;
              const success = await deleteYtDownload(song.youtubeVideoId);
              if (success) {
                setYtDownloadedInfo(null);
                await refreshDownloads?.();
                onDownloadDeleted?.();
              } else {
                Alert.alert('Error', 'Failed to delete download');
              }
            }
          }
        }
      ]
    );
  }

  return (
    <Pressable
      onPress={isDownloaded ? handleDelete : handleDownload}
      disabled={isDownloading}
      style={({ pressed }) => [
        showLabel ? styles.rowButton : styles.button,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      <View style={showLabel ? styles.iconContainer : null}>
        {isDownloading ? (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            {progress > 0 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>
        ) : (
          <Ionicons
            name={isDownloaded ? 'checkmark-circle' : 'download-outline'}
            size={size}
            color={isDownloaded ? Colors.primary : color}
          />
        )}
      </View>
      {showLabel && (
        <Text style={[styles.rowText, isDownloaded && styles.labelActive]}>
          {isDownloading
            ? `Downloading...`
            : isDownloaded
            ? `Downloaded`
            : `Download`}
        </Text>
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
  rowButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 32,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  labelActive: {
    color: Colors.primary,
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
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
});
