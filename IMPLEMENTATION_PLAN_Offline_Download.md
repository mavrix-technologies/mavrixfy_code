# 📥 Offline Playback Implementation Plan

## Current Setup (3 backends):
1. ✅ **JioSaavn API** - Songs, albums, playlists
2. ✅ **YouTube Music API** - Songs, search, metadata (Vercel backend)
3. ✅ **Firebase** - Auth, user data

## Goal:
Add **offline download** feature to **existing YouTube Music backend** (no 4th backend needed!)

---

## 🎯 Solution: Add yt-dlp endpoint to YouTube Music Backend

### Architecture:

```
┌─────────────────────────────────────────────────────────┐
│         Your Current YouTube Music Backend              │
│      (Vercel: mavrixfy-api-drab.vercel.app)            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  EXISTING ENDPOINTS:                                     │
│  ✅ GET /api/youtube-music/search                       │
│  ✅ GET /api/youtube-music/playlist/:id                 │
│  ✅ GET /api/youtube-music/artist/:id                   │
│  ✅ GET /api/youtube-music/album/:id                    │
│                                                          │
│  NEW ENDPOINT (Add this):                               │
│  🆕 GET /api/youtube-music/download/:videoId            │
│      - Uses yt-dlp to get download URL                  │
│      - Returns: Direct download link for offline        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 Implementation Steps:

### Step 1: Add yt-dlp to YouTube Music Backend

**Option A: If backend is Python (FastAPI/Flask)**

```python
# Add to your existing YouTube Music backend
# File: api/youtube-music/download.py

from flask import Flask, jsonify, request
import yt_dlp

@app.route('/api/youtube-music/download/<video_id>', methods=['GET'])
def download_audio(video_id):
    """
    Get download URL for offline playback
    Returns direct download link that app can use to download audio file
    """
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]',
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            return jsonify({
                'success': True,
                'data': {
                    'videoId': video_id,
                    'title': info.get('title'),
                    'artist': info.get('artist') or info.get('uploader'),
                    'duration': info.get('duration'),
                    'downloadUrl': info.get('url'),  # Direct download URL
                    'format': info.get('ext'),
                    'filesize': info.get('filesize'),
                    'bitrate': info.get('abr'),
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
```

**Option B: If backend is Node.js (Express)**

```javascript
// Add to your existing YouTube Music backend
// File: api/youtube-music/download.js

const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;

const router = express.Router();
const ytDlpWrap = new YTDlpWrap();

router.get('/download/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const info = await ytDlpWrap.getVideoInfo(url);
    
    // Get best audio format
    const audioFormat = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    
    res.json({
      success: true,
      data: {
        videoId,
        title: info.title,
        artist: info.artist || info.uploader,
        duration: info.duration,
        downloadUrl: audioFormat.url,
        format: audioFormat.ext,
        filesize: audioFormat.filesize,
        bitrate: audioFormat.abr,
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

---

### Step 2: Add Download Service to React Native App

```typescript
// lib/youtubeDownloadService.ts

import { getYouTubeMusicApiUrl } from '@/lib/api-config';
import * as FileSystem from 'expo-file-system';
import { logger } from '@/lib/logger';

export interface DownloadInfo {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  downloadUrl: string;
  format: string;
  filesize?: number;
  bitrate?: number;
}

/**
 * Get download URL from backend
 */
export async function getYouTubeDownloadUrl(videoId: string): Promise<DownloadInfo | null> {
  try {
    const apiUrl = getYouTubeMusicApiUrl();
    const response = await fetch(`${apiUrl}download/${videoId}`);
    const data = await response.json();
    
    if (!data.success) {
      logger.error('Failed to get download URL:', data.error);
      return null;
    }
    
    return data.data;
  } catch (error) {
    logger.error('Error fetching download URL:', error);
    return null;
  }
}

/**
 * Download audio file to device storage
 */
export async function downloadAudioFile(
  videoId: string,
  onProgress?: (progress: number) => void
): Promise<string | null> {
  try {
    // Get download URL from backend
    const info = await getYouTubeDownloadUrl(videoId);
    if (!info) {
      throw new Error('Failed to get download URL');
    }
    
    // Create downloads directory
    const downloadsDir = `${FileSystem.documentDirectory}downloads/`;
    const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
    }
    
    // Clean filename
    const filename = `${info.title.replace(/[^a-z0-9]/gi, '_')}.${info.format}`;
    const localUri = `${downloadsDir}${filename}`;
    
    // Download file
    logger.info('Downloading audio file:', filename);
    
    const downloadResumable = FileSystem.createDownloadResumable(
      info.downloadUrl,
      localUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );
    
    const result = await downloadResumable.downloadAsync();
    
    if (result) {
      logger.info('Download completed:', result.uri);
      return result.uri;
    }
    
    return null;
    
  } catch (error) {
    logger.error('Download failed:', error);
    return null;
  }
}

/**
 * Check if song is already downloaded
 */
export async function isDownloaded(videoId: string): Promise<string | null> {
  try {
    const downloadsDir = `${FileSystem.documentDirectory}downloads/`;
    const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
    
    if (!dirInfo.exists) {
      return null;
    }
    
    const files = await FileSystem.readDirectoryAsync(downloadsDir);
    const matchingFile = files.find(f => f.includes(videoId));
    
    if (matchingFile) {
      return `${downloadsDir}${matchingFile}`;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Delete downloaded file
 */
export async function deleteDownload(localUri: string): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(localUri);
    logger.info('Deleted download:', localUri);
    return true;
  } catch (error) {
    logger.error('Failed to delete download:', error);
    return false;
  }
}
```

---

### Step 3: Update Song Type to Support Offline

```typescript
// lib/musicData.ts - Add these fields

export interface Song {
  // ... existing fields ...
  
  // Offline support
  isDownloaded?: boolean;
  localUri?: string;  // Local file path if downloaded
  downloadProgress?: number;  // 0-1 for download progress
}
```

---

### Step 4: Add Download Button to UI

```typescript
// components/DownloadButton.tsx

import React, { useState, useEffect } from 'react';
import { Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadAudioFile, isDownloaded, deleteDownload } from '@/lib/youtubeDownloadService';
import { Song } from '@/lib/musicData';

interface DownloadButtonProps {
  song: Song;
  onDownloadComplete?: (localUri: string) => void;
}

export default function DownloadButton({ song, onDownloadComplete }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  
  useEffect(() => {
    checkIfDownloaded();
  }, [song.id]);
  
  async function checkIfDownloaded() {
    if (song.source === 'youtube' && song.youtubeVideoId) {
      const uri = await isDownloaded(song.youtubeVideoId);
      setLocalUri(uri);
    }
  }
  
  async function handleDownload() {
    if (!song.youtubeVideoId) return;
    
    setIsDownloading(true);
    
    const uri = await downloadAudioFile(
      song.youtubeVideoId,
      (p) => setProgress(p)
    );
    
    setIsDownloading(false);
    
    if (uri) {
      setLocalUri(uri);
      onDownloadComplete?.(uri);
    }
  }
  
  async function handleDelete() {
    if (localUri) {
      const success = await deleteDownload(localUri);
      if (success) {
        setLocalUri(null);
      }
    }
  }
  
  // Only show for YouTube songs
  if (song.source !== 'youtube') {
    return null;
  }
  
  if (isDownloading) {
    return (
      <Pressable style={{ padding: 8 }}>
        <ActivityIndicator size="small" color="#1DB954" />
      </Pressable>
    );
  }
  
  return (
    <Pressable
      onPress={localUri ? handleDelete : handleDownload}
      style={{ padding: 8 }}
    >
      <Ionicons
        name={localUri ? "checkmark-circle" : "download-outline"}
        size={24}
        color={localUri ? "#1DB954" : "#ffffff"}
      />
    </Pressable>
  );
}
```

---

## 🎵 How It Works:

### User Flow:

1. **Search & Browse** (Online)
   - User searches songs via YouTube Music API
   - Shows normal results

2. **Download for Offline** (One-time)
   - User clicks download button
   - App calls: `GET /api/youtube-music/download/VIDEO_ID`
   - Backend uses yt-dlp to get download URL
   - App downloads file to device storage
   - ✅ Song saved locally!

3. **Play Anytime** (Offline/Online)
   ```typescript
   function playSong(song: Song) {
     if (song.isDownloaded && song.localUri) {
       // Play from local file - NO INTERNET
       playLocal(song.localUri);
     } else {
       // Play online stream
       playOnline(song);
     }
   }
   ```

---

## ✅ Benefits:

1. **No extra backend** - Uses your existing YouTube Music backend
2. **One endpoint** - Just add `/download/:videoId`
3. **Works with JioSaavn** - JioSaavn can also add download endpoint
4. **Unified approach** - Same pattern for both services
5. **Offline forever** - Downloaded files never expire

---

## 📦 Required Dependencies:

```bash
# Backend (if not already installed)
npm install yt-dlp-wrap
# or
pip install yt-dlp

# React Native (if not already installed)
npx expo install expo-file-system
```

---

## 🎯 Summary:

**ONE new endpoint** in your existing YouTube Music backend = Full offline support!

```
Your App → YouTube Music Backend → yt-dlp → Download URL → Save to device → Play offline ✅
```

No 4th backend needed! 🚀
