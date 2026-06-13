# YouTube Music API Integration Guide

This document explains the YouTube Music API integration for the Mavrixfy app.

## 📋 Overview

The integration consists of two parts:
1. **Backend Service** (Python FastAPI) - Wraps the ytmusicapi library
2. **React Native Client** (TypeScript) - Integrates with the app's existing music services

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   Mavrixfy React Native App        │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  lib/youtubeMusicService.ts  │  │
│  │  - Search                    │  │
│  │  - Playlists                 │  │
│  │  - Albums                    │  │
│  │  - Artists                   │  │
│  │  - Stream URLs               │  │
│  └──────────┬───────────────────┘  │
└─────────────┼───────────────────────┘
              │ HTTP/REST API
              │
┌─────────────▼───────────────────────┐
│   Python Backend (FastAPI)          │
│                                     │
│  ┌──────────────────────────────┐  │
│  │    ytmusicapi Library        │  │
│  │  (sigma67/ytmusicapi)        │  │
│  └──────────────────────────────┘  │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│      YouTube Music API              │
│   (Unofficial, via ytmusicapi)      │
└─────────────────────────────────────┘
```

## 📁 Files Created

### React Native App
- `lib/youtubeMusicService.ts` - Client service for YouTube Music
- Updated `lib/song-matcher.ts` - Added YouTube Music to search
- Updated `lib/musicData.ts` - Added "youtube" source type
- Updated `.env.example` - Added YouTube Music API URL config

### Backend Service (new folder: `youtube-music-api/`)
- `main.py` - FastAPI application
- `requirements.txt` - Python dependencies
- `Dockerfile` - Container configuration
- `vercel.json` - Vercel deployment config
- `.gitignore` - Python/env ignores
- `README.md` - Backend documentation

## 🚀 Setup Instructions

### Step 1: Deploy the Backend

#### Option A: Local Development

1. Navigate to the backend directory:
```bash
cd youtube-music-api
```

2. Create a virtual environment:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # macOS/Linux
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

#### Option B: Deploy to Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
cd youtube-music-api
vercel
```

3. Copy the deployment URL (e.g., `https://your-app.vercel.app`)

#### Option C: Deploy to Railway

1. Create account at https://railway.app
2. Install Railway CLI:
```bash
npm install -g @railway/cli
```
3. Deploy:
```bash
cd youtube-music-api
railway login
railway init
railway up
```

### Step 2: Configure the React Native App

1. Copy `.env.example` to `.env` if you haven't already:
```bash
copy .env.example .env  # Windows
# or
cp .env.example .env    # macOS/Linux
```

2. Update the YouTube Music API URL in `.env`:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://your-deployed-api.vercel.app
```

For local development:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

3. Restart your Expo development server:
```bash
npm start
```

## 🎯 Features

### Search Integration
YouTube Music is now integrated into the multi-source search in `song-matcher.ts`. When searching for songs, the app will:
1. Search JioSaavn (priority 1)
2. Search Spotify (priority 2)
3. Search Deezer (priority 3)
4. Search YouTube Music (priority 4)

### Available Functions

```typescript
import {
  searchYouTubeMusic,
  getYouTubeMusicPlaylist,
  getYouTubeMusicAlbum,
  getYouTubeMusicArtist,
  getYouTubeMusicStreamUrl,
  getYouTubeMusicTrending,
  convertYouTubeMusicTrack,
  convertYouTubeMusicTrackToJioSaavn,
} from '@/lib/youtubeMusicService';

// Search for songs
const songs = await searchYouTubeMusic('arijit singh', 'song', 20);

// Get playlist details
const playlist = await getYouTubeMusicPlaylist('RDCLAK5uy_...');

// Get album
const album = await getYouTubeMusicAlbum('MPREb_...');

// Get artist info
const artist = await getYouTubeMusicArtist('UCmYTM9...');

// Get streaming URL for playback
const streamUrl = await getYouTubeMusicStreamUrl('dQw4w9WgXcQ');

// Get trending songs
const trending = await getYouTubeMusicTrending('US');
```

### Caching

All YouTube Music API calls are cached using AsyncStorage:
- Search results: 30 minutes
- Playlist/Album/Artist data: 2 hours
- Stream URLs: Not cached (expire after ~6 hours)

## 📊 API Endpoints

The backend provides these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/youtube-music/search` | GET | Search for songs, albums, artists, playlists |
| `/api/youtube-music/song/{video_id}` | GET | Get song details |
| `/api/youtube-music/playlist/{playlist_id}` | GET | Get playlist with tracks |
| `/api/youtube-music/album/{album_id}` | GET | Get album with tracks |
| `/api/youtube-music/artist/{artist_id}` | GET | Get artist details |
| `/api/youtube-music/stream/{video_id}` | GET | Get streaming URL |
| `/api/youtube-music/charts` | GET | Get trending/chart songs |
| `/api/youtube-music/lyrics/{browse_id}` | GET | Get song lyrics |

## 🔧 Extending the Integration

### Add YouTube Music to Home Feed

Edit `lib/recommendationService.ts` to add YouTube Music playlists:

```typescript
import { searchYouTubeMusic } from './youtubeMusicService';

// Add to your recommendation queries
const ytSongs = await searchYouTubeMusic('trending hindi songs 2026', 'song', 12);
```

### Add YouTube Music Browse UI

Create components similar to your JioSaavn UI:
- `components/YouTubeMusicPlaylistCard.tsx`
- `components/YouTubeMusicArtistCard.tsx`
- `app/(tabs)/explore/youtube.tsx` - Browse page

### Update Player Context

Edit `contexts/PlayerContext.tsx` to resolve YouTube Music stream URLs:

```typescript
// In resolvePlaybackUrl function
if (song.source === 'youtube' && song.id.startsWith('youtube_')) {
  const videoId = song.id.replace('youtube_', '');
  const streamUrl = await getYouTubeMusicStreamUrl(videoId);
  return streamUrl || song.audioUrl;
}
```

## ⚠️ Important Notes

### Stream URL Expiration
YouTube Music streaming URLs expire after approximately 6 hours. Always call `getYouTubeMusicStreamUrl()` just before playback, not in advance.

### Rate Limiting
The unofficial YouTube Music API may have rate limits. The client-side caching helps minimize requests.

### Legal Considerations
This integration uses the unofficial YouTube Music API (ytmusicapi). Ensure compliance with YouTube's Terms of Service for your use case.

### Audio Quality
The backend returns the highest bitrate audio format available. Typical formats:
- Opus: 48-256 kbps
- AAC: 128-256 kbps

## 🐛 Troubleshooting

### Backend Issues

**Problem**: "YTMusic client not initialized"
- **Solution**: Check Python version (3.8+) and ensure ytmusicapi is installed correctly

**Problem**: Stream URLs not working
- **Solution**: Request a fresh URL just before playback; URLs expire quickly

**Problem**: Search returns no results
- **Solution**: Verify query encoding and filter type (songs, albums, artists, playlists)

### React Native Issues

**Problem**: API requests timing out
- **Solution**: Check backend URL in `.env`, ensure backend is running and accessible

**Problem**: Songs not playing
- **Solution**: Implement stream URL resolution in PlayerContext (see "Update Player Context" section)

**Problem**: Duplicate songs in search
- **Solution**: The app returns the first successful result from [JioSaavn, Spotify, Deezer, YouTube Music]

## 📈 Next Steps

1. **Implement Playback**: Update `PlayerContext.tsx` to handle YouTube Music streams
2. **Add UI**: Create YouTube Music-specific browse screens
3. **Enhance Search**: Add YouTube Music as a dedicated search tab
4. **Add to Recommendations**: Include YouTube Music in home feed recommendations
5. **Lyrics Integration**: Use the lyrics endpoint for karaoke features
6. **Charts Integration**: Add trending YouTube Music charts to explore page

## 🔐 Security

For production deployment:
- Add authentication to the backend API
- Implement rate limiting (e.g., using FastAPI middleware)
- Restrict CORS origins to your app's domain
- Use environment variables for sensitive configuration
- Monitor API usage and costs

## 📝 License

The ytmusicapi library is licensed under MIT License. Ensure your use case complies with YouTube's Terms of Service.

## 🤝 Contributing

When adding features:
1. Follow the existing service pattern (see `jioSaavnService.ts`)
2. Add caching with appropriate TTL
3. Handle errors gracefully with fallbacks
4. Update this documentation
5. Test with various queries and edge cases

## 📚 Resources

- [ytmusicapi Documentation](https://ytmusicapi.readthedocs.io/)
- [ytmusicapi GitHub](https://github.com/sigma67/ytmusicapi)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [YouTube Music](https://music.youtube.com/)
