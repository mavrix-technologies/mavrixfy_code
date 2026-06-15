# yt-dlp Integration Test Example

This is a **TEST ONLY** document showing how to use yt-dlp to fetch YouTube stream URLs and video IDs for your music app.

## Overview

yt-dlp is a command-line tool that can extract direct stream URLs from YouTube videos. It's more reliable than web scraping and handles various YouTube formats.

## Installation

```bash
# Using pip
pip install yt-dlp

# Or using npm wrapper
npm install yt-dlp-wrap
```

## Method 1: Command Line Usage (For Testing)

### Get Video Info as JSON
```bash
# Get all video information including stream URLs
yt-dlp -j "https://www.youtube.com/watch?v=VIDEO_ID"

# Or just dump JSON without downloading
yt-dlp --dump-json --no-download "https://www.youtube.com/watch?v=VIDEO_ID"

# Get only audio stream info
yt-dlp -j -f "bestaudio" "https://www.youtube.com/watch?v=VIDEO_ID"
```

### Extract Specific Stream URL
```bash
# Get best audio stream URL
yt-dlp -f "bestaudio" -g "https://www.youtube.com/watch?v=VIDEO_ID"

# Get specific quality (e.g., 128k audio)
yt-dlp -f "bestaudio[abr<=128]" -g "https://www.youtube.com/watch?v=VIDEO_ID"

# The -g flag outputs only the direct URL
```

## Method 2: Python Backend API (Recommended for React Native)

Create a Python Flask/FastAPI backend that uses yt-dlp:

```python
# test_ytdlp_api.py
from flask import Flask, jsonify, request
import yt_dlp

app = Flask(__name__)

@app.route('/api/youtube/stream', methods=['GET'])
def get_stream_url():
    video_id = request.args.get('videoId')
    
    if not video_id:
        return jsonify({'error': 'videoId required'}), 400
    
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract relevant information
            result = {
                'videoId': video_id,
                'title': info.get('title'),
                'artist': info.get('artist') or info.get('uploader'),
                'duration': info.get('duration'),
                'thumbnail': info.get('thumbnail'),
                'formats': []
            }
            
            # Get all available audio formats
            for f in info.get('formats', []):
                if f.get('acodec') != 'none':  # Has audio
                    result['formats'].append({
                        'formatId': f.get('format_id'),
                        'url': f.get('url'),
                        'ext': f.get('ext'),
                        'abr': f.get('abr'),  # Audio bitrate
                        'asr': f.get('asr'),  # Audio sample rate
                        'filesize': f.get('filesize'),
                        'quality': f.get('quality'),
                    })
            
            # Get best audio URL
            best_audio = next(
                (f for f in info['formats'] if f.get('acodec') != 'none' and f.get('vcodec') == 'none'),
                None
            )
            
            if best_audio:
                result['bestAudioUrl'] = best_audio.get('url')
                result['bestAudioFormat'] = best_audio.get('ext')
                result['bestAudioBitrate'] = best_audio.get('abr')
            
            return jsonify(result)
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/info', methods=['GET'])
def get_video_info():
    """Get basic video info without extracting stream URLs"""
    video_id = request.args.get('videoId')
    
    if not video_id:
        return jsonify({'error': 'videoId required'}), 400
    
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,  # Faster, doesn't extract stream URLs
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            return jsonify({
                'videoId': video_id,
                'title': info.get('title'),
                'uploader': info.get('uploader'),
                'duration': info.get('duration'),
                'thumbnail': info.get('thumbnail'),
                'description': info.get('description'),
                'viewCount': info.get('view_count'),
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

## Method 3: Node.js Backend (Alternative)

Using the `yt-dlp-wrap` npm package:

```javascript
// test_ytdlp_server.js
const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const ytDlpWrap = new YTDlpWrap();

app.get('/api/youtube/stream', async (req, res) => {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'videoId required' });
  }
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    // Get video metadata
    const metadata = await ytDlpWrap.getVideoInfo(url);
    
    // Extract audio formats
    const audioFormats = metadata.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .map(f => ({
        formatId: f.format_id,
        url: f.url,
        ext: f.ext,
        abr: f.abr,
        filesize: f.filesize,
      }));
    
    // Get best audio format
    const bestAudio = audioFormats.reduce((best, current) => {
      return (current.abr > (best?.abr || 0)) ? current : best;
    }, null);
    
    res.json({
      videoId,
      title: metadata.title,
      artist: metadata.artist || metadata.uploader,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      formats: audioFormats,
      bestAudioUrl: bestAudio?.url,
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## Method 4: Direct TypeScript Service (For Testing)

```typescript
// TEST_ytdlpService.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface YouTubeStreamInfo {
  videoId: string;
  title: string;
  artist?: string;
  duration: number;
  thumbnail: string;
  audioUrl: string;
  audioFormat: string;
  audioBitrate?: number;
}

/**
 * TEST ONLY - Extract YouTube audio stream URL using yt-dlp
 * Note: Requires yt-dlp to be installed on the system
 */
export async function getYouTubeStreamUrl(videoId: string): Promise<YouTubeStreamInfo | null> {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Execute yt-dlp with JSON output
    const { stdout } = await execAsync(
      `yt-dlp -j --no-warnings --format "bestaudio" "${url}"`
    );
    
    const info = JSON.parse(stdout);
    
    return {
      videoId,
      title: info.title || '',
      artist: info.artist || info.uploader || '',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      audioUrl: info.url || '',
      audioFormat: info.ext || 'mp4',
      audioBitrate: info.abr || undefined,
    };
    
  } catch (error) {
    console.error('Failed to extract YouTube stream:', error);
    return null;
  }
}

/**
 * TEST ONLY - Get multiple quality options
 */
export async function getYouTubeStreamFormats(videoId: string): Promise<any[]> {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    const { stdout } = await execAsync(
      `yt-dlp -j --no-warnings "${url}"`
    );
    
    const info = JSON.parse(stdout);
    
    // Filter for audio-only formats
    const audioFormats = (info.formats || [])
      .filter((f: any) => f.acodec !== 'none' && f.vcodec === 'none')
      .map((f: any) => ({
        formatId: f.format_id,
        url: f.url,
        ext: f.ext,
        bitrate: f.abr,
        filesize: f.filesize,
        quality: f.quality,
      }));
    
    return audioFormats;
    
  } catch (error) {
    console.error('Failed to extract formats:', error);
    return [];
  }
}

// Example usage:
async function testYtDlp() {
  const videoId = 'dQw4w9WgXcQ'; // Example video ID
  
  console.log('Testing yt-dlp integration...');
  
  const streamInfo = await getYouTubeStreamUrl(videoId);
  console.log('Stream Info:', streamInfo);
  
  const formats = await getYouTubeStreamFormats(videoId);
  console.log('Available Formats:', formats);
}

// Uncomment to test:
// testYtDlp();
```

## How to Integrate with Your App

### Option A: Backend API (Recommended)
1. Set up a Python/Node.js backend with yt-dlp
2. Your React Native app calls the backend API
3. Backend returns the stream URL
4. Play the stream URL in your audio player

```typescript
// In your app
async function playYouTubeMusic(videoId: string) {
  const response = await fetch(
    `https://your-backend.com/api/youtube/stream?videoId=${videoId}`
  );
  const data = await response.json();
  
  // Play the audio URL
  await audioPlayer.play({
    url: data.bestAudioUrl,
    title: data.title,
    artist: data.artist,
  });
}
```

### Option B: Serverless Functions
Deploy the yt-dlp logic to:
- Vercel/Netlify Functions
- AWS Lambda
- Google Cloud Functions
- Azure Functions

## Important Notes

1. **Stream URL Expiration**: YouTube stream URLs expire after a few hours. You need to refresh them when they expire.

2. **Legal Compliance**: Ensure your usage complies with YouTube's Terms of Service and local laws.

3. **Rate Limiting**: Implement caching and rate limiting to avoid being blocked.

4. **Performance**: Stream URL extraction takes 1-3 seconds. Cache results.

5. **Error Handling**: YouTube frequently changes their API. yt-dlp updates regularly to handle these changes.

## Testing Commands

```bash
# Test with a specific video
yt-dlp -j "https://www.youtube.com/watch?v=dQw4w9WgXcQ" | jq .

# Test audio extraction
yt-dlp -f "bestaudio" -g "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Test with your video ID
yt-dlp -j "https://www.youtube.com/watch?v=YOUR_VIDEO_ID" | jq '.title, .duration, .url'
```

## Expected JSON Output Structure

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "uploader": "Rick Astley",
  "duration": 212,
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "formats": [
    {
      "format_id": "251",
      "url": "https://rr3---sn-q4fl6nez.googlevideo.com/...",
      "ext": "webm",
      "acodec": "opus",
      "abr": 160,
      "vcodec": "none"
    }
  ]
}
```

---

**This is a TEST document only. Do not implement in production without proper testing and legal review.**
