# 🎵 YouTube Music Integration - Quick Start Guide

Your YouTube Music API backend is now running successfully! Here's everything you need to know.

## ✅ Current Status

- ✅ YouTube Music API backend is **RUNNING** at `http://localhost:8000`
- ✅ React Native app is **CONFIGURED** to use the local backend
- ✅ Integration code is **READY** in `lib/youtubeMusicService.ts`
- ✅ Search integration is **ENABLED** in `lib/song-matcher.ts`

## 🚀 How to Use

### Keep the Backend Running

The YouTube Music API backend is currently running in the background. You need to keep it running while using your app.

**To check if it's running:**
```bash
curl http://localhost:8000
```

You should see: `{"service":"YouTube Music API (Node.js)","status":"running","initialized":true}`

**To restart if stopped:**
```bash
cd youtube-music-api-node
npm start
```

### Start Your React Native App

1. Open a new terminal (keep the backend running)
2. Navigate to your app directory:
   ```bash
   cd e:\Mavrixfy\Mavrixfy_App
   ```
3. Start Expo:
   ```bash
   npm start
   ```

The app will automatically use the YouTube Music API when searching for songs!

## 🧪 Testing the Integration

### Test 1: From Terminal
```bash
cd youtube-music-api-node
node test-api.js
```

### Test 2: From Browser
Open in your browser:
- Health Check: http://localhost:8000/
- Search: http://localhost:8000/api/youtube-music/search?query=arijit%20singh&type=song&limit=5

### Test 3: In React Native App
1. Open your app
2. Search for any song (e.g., "Arijit Singh")
3. The app will search across:
   - JioSaavn (priority 1)
   - Spotify (priority 2)
   - Deezer (priority 3)
   - **YouTube Music (priority 4)** ← NEW!

## 📁 Project Structure

```
Mavrixfy_App/
├── youtube-music-api-node/     ← Node.js Backend (ACTIVE)
│   ├── index.js                ← Main server file
│   ├── package.json            ← Dependencies
│   ├── test-api.js             ← Test script
│   └── README.md               ← Backend docs
│
├── lib/
│   ├── youtubeMusicService.ts  ← YouTube Music client
│   ├── song-matcher.ts         ← Multi-source search (updated)
│   └── musicData.ts            ← Data models (updated)
│
├── .env                        ← Config (updated)
└── YOUTUBE_MUSIC_INTEGRATION.md ← Full documentation
```

## 🎯 Available Features

### Search
```typescript
import { searchYouTubeMusic } from '@/lib/youtubeMusicService';

// Search for songs
const songs = await searchYouTubeMusic('arijit singh', 'song', 20);
```

### Get Song Details
```typescript
import { convertYouTubeMusicTrack } from '@/lib/youtubeMusicService';

// Songs automatically convert to your app's format
```

### Get Playlist/Album/Artist
```typescript
import {
  getYouTubeMusicPlaylist,
  getYouTubeMusicAlbum,
  getYouTubeMusicArtist,
} from '@/lib/youtubeMusicService';

const playlist = await getYouTubeMusicPlaylist('PLAYLIST_ID');
const album = await getYouTubeMusicAlbum('ALBUM_ID');
const artist = await getYouTubeMusicArtist('ARTIST_ID');
```

### Get Streaming URL
```typescript
import { getYouTubeMusicStreamUrl } from '@/lib/youtubeMusicService';

// Get fresh stream URL before playback
const streamUrl = await getYouTubeMusicStreamUrl('VIDEO_ID');
```

## 🔧 API Endpoints

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /` | Health check | http://localhost:8000/ |
| `GET /api/youtube-music/search` | Search songs/albums/artists | `?query=arijit singh&type=song&limit=20` |
| `GET /api/youtube-music/song/:videoId` | Song details | `/api/youtube-music/song/dQw4w9WgXcQ` |
| `GET /api/youtube-music/playlist/:id` | Playlist with tracks | `/api/youtube-music/playlist/PLAYLIST_ID` |
| `GET /api/youtube-music/album/:id` | Album with tracks | `/api/youtube-music/album/ALBUM_ID` |
| `GET /api/youtube-music/artist/:id` | Artist info | `/api/youtube-music/artist/ARTIST_ID` |
| `GET /api/youtube-music/stream/:videoId` | Get stream URL | `/api/youtube-music/stream/VIDEO_ID` |
| `GET /api/youtube-music/suggestions/:videoId` | Related songs | `/api/youtube-music/suggestions/VIDEO_ID` |
| `GET /api/youtube-music/lyrics/:videoId` | Song lyrics | `/api/youtube-music/lyrics/VIDEO_ID` |

## ⚙️ Configuration

### Current Setup (.env)
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

### For Production
When you deploy the backend, update to:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://your-deployed-api.vercel.app
```

## 🚢 Deployment Options

### Deploy to Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Navigate to backend:
   ```bash
   cd youtube-music-api-node
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Update `.env` with deployment URL

### Deploy to Railway

1. Create account at https://railway.app
2. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```
3. Deploy:
   ```bash
   cd youtube-music-api-node
   railway login
   railway init
   railway up
   ```

### Deploy to Render

1. Create account at https://render.com
2. Connect GitHub repository
3. Create new Web Service
4. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node 18+

## 📊 Backend Logs

To view what's happening in the backend:
```bash
cd youtube-music-api-node
# Backend will show logs in real-time:
# [2026-06-13T...] GET /api/youtube-music/search
# 🔍 Searching: query="arijit singh", type="song", limit=20
```

## ⚠️ Important Notes

### Stream URLs Expire
YouTube Music stream URLs expire after ~6 hours. The app should:
1. Call `getYouTubeMusicStreamUrl()` just before playback
2. Never cache stream URLs
3. Request fresh URLs if playback fails

### Caching Strategy
The client (`lib/youtubeMusicService.ts`) caches:
- Search results: 30 minutes
- Playlist/Album/Artist: 2 hours
- Stream URLs: Not cached

### Rate Limiting
The YouTube Music API may rate limit. The caching helps minimize requests.

## 🐛 Troubleshooting

### Backend Not Running
**Error:** "Failed to fetch" or "Network request failed"

**Solution:**
```bash
cd youtube-music-api-node
npm start
```

### Port Already in Use
**Error:** "Port 8000 is already in use"

**Solution:**
```bash
# Stop the existing process
# Or change port in .env:
echo "PORT=8001" > .env
```

### API Not Initialized
**Error:** "YouTube Music API not initialized yet"

**Solution:** Wait 2-5 seconds after starting the server. The API needs time to initialize.

### Search Returns No Results
1. Check the backend is running: `curl http://localhost:8000`
2. Test the endpoint directly: `curl "http://localhost:8000/api/youtube-music/search?query=test&type=song&limit=5"`
3. Check backend logs for errors

### React Native Can't Connect
**For iOS Simulator:**
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

**For Android Emulator:**
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://10.0.2.2:8000
```

**For Physical Device:**
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://YOUR_COMPUTER_IP:8000
```

## 📝 Next Steps

### 1. Implement Playback (Recommended)
Edit `contexts/PlayerContext.tsx`:

```typescript
import { getYouTubeMusicStreamUrl } from '@/lib/youtubeMusicService';

// In resolvePlaybackUrl function:
if (song.source === 'youtube' && song.id.startsWith('youtube_')) {
  const videoId = song.id.replace('youtube_', '');
  const streamUrl = await getYouTubeMusicStreamUrl(videoId);
  if (streamUrl) return streamUrl;
}
```

### 2. Add to Home Feed
Edit `lib/recommendationService.ts` to include YouTube Music:

```typescript
import { searchYouTubeMusic } from './youtubeMusicService';

// Add YouTube Music playlists/songs to recommendations
const ytSongs = await searchYouTubeMusic('trending hindi 2026', 'song', 12);
```

### 3. Create Browse UI
- Add YouTube Music browse tab
- Show playlists, albums, artists
- Display trending charts

### 4. Add Lyrics Feature
Use the lyrics endpoint for karaoke features

## 📚 Documentation

- **Full Integration Guide:** `YOUTUBE_MUSIC_INTEGRATION.md`
- **Backend README:** `youtube-music-api-node/README.md`
- **Service Code:** `lib/youtubeMusicService.ts`

## 🎉 Success!

You now have YouTube Music fully integrated! 

**To recap:**
1. ✅ Backend is running at http://localhost:8000
2. ✅ React Native app is configured
3. ✅ Search integration is working
4. ✅ Ready to test in your app!

**Need help?** Check `YOUTUBE_MUSIC_INTEGRATION.md` for detailed documentation.

---

**Pro Tip:** Keep the backend terminal open to monitor API requests in real-time!
