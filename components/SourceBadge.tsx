import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SourceBadgeProps {
  source?: 'jiosaavn' | 'youtube' | string;
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
}

export function SourceBadge({ source, size = 'small', showText = true }: SourceBadgeProps) {
  const isJioSaavn = source === 'jiosaavn';
  const isYouTube = source === 'youtube';

  if (!isJioSaavn && !isYouTube) {
    return null;
  }

  const sizeStyles = {
    small: { fontSize: 10, padding: 4, iconSize: 12 },
    medium: { fontSize: 11, padding: 6, iconSize: 14 },
    large: { fontSize: 12, padding: 8, iconSize: 16 },
  };

  const config = sizeStyles[size];

  return (
    <View style={[
      styles.badge,
      isJioSaavn ? styles.badgeJioSaavn : styles.badgeYouTube,
      { padding: config.padding }
    ]}>
      <Ionicons
        name={isJioSaavn ? 'download-outline' : 'wifi-outline'}
        size={config.iconSize}
        color={isJioSaavn ? '#FF6B00' : '#FF0000'}
        style={styles.icon}
      />
      {showText && (
        <Text style={[styles.badgeText, { fontSize: config.fontSize }]}>
          {isJioSaavn ? 'Download' : 'Stream'}
        </Text>
      )}
    </View>
  );
}

interface DownloadStatusProps {
  source?: 'jiosaavn' | 'youtube' | string;
  isDownloaded?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function DownloadStatus({ source, isDownloaded, size = 'small' }: DownloadStatusProps) {
  const isJioSaavn = source === 'jiosaavn';
  const isYouTube = source === 'youtube';

  const sizeStyles = {
    small: { iconSize: 16 },
    medium: { iconSize: 18 },
    large: { iconSize: 20 },
  };

  const config = sizeStyles[size];

  if (isYouTube) {
    // YouTube = Stream only
    return (
      <View style={styles.statusContainer}>
        <Ionicons name="wifi-outline" size={config.iconSize} color="#FF0000" />
      </View>
    );
  }

  if (isJioSaavn) {
    // JioSaavn = Downloadable
    return (
      <View style={styles.statusContainer}>
        <Ionicons
          name={isDownloaded ? 'checkmark-circle' : 'download-outline'}
          size={config.iconSize}
          color={isDownloaded ? '#4CAF50' : '#FF6B00'}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeJioSaavn: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF6B00',
  },
  badgeYouTube: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FF0000',
  },
  icon: {
    marginRight: 4,
  },
  badgeText: {
    fontWeight: '600',
    color: '#000',
  },
  statusContainer: {
    padding: 4,
  },
});
