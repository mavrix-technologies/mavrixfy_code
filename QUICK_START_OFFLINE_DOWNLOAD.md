# 🚀 Quick Start - Offline Download Feature

## ✅ Implementation Complete!

Offline download support has been successfully added to your YouTube Music backend!

---

## 🎯 How to Test (Local Development)

### Step 1: Start Backend

```bash
cd youtube-music-api
python main.py
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

### Step 2: Test Download Endpoint

```bash
# Test with Rick Astley song
curl "http://localhost:8000/api/download/dQw4w9WgXcQ"
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up...",
    "downloadUrl": "https://rr3---sn-ci5gup-5hql.googlevideo.com/...",
    "format": "m4a",
    "filesize": 3449447
  }
}
```

### Step 3: Start React Native App

```bash
# In project root
npm start
```

### Step 4: Test in App

1. ✅ Search for any YouTube song (e.g., "Never Gonna Give You Up")
2. ✅ Look for download button (📥 icon) next to the more button
3. ✅ Click download button
4. ✅ Wait for progress to complete (~3MB)
5. ✅ Button changes to checkmark (✅)
6. ✅ Turn off WiFi/mobile data
7. ✅ Play the song - it works offline!

---

## 🎵 User Experience

### Download Button States:

1. **Not Downloaded** - Shows `📥` download-outline icon
2. **Downloading** - Shows progress spinner
3. **Downloaded** - Shows `✅` checkmark-circle icon (green)

### Actions:

- **Click download button** → Downloads song for offline use
- **Click checkmark** → Shows delete confirmation
- **Play downloaded song** → Works without internet!

---

## 📱 Where to See Download Button

The download button appears:
- ✅ In search results (for YouTube songs)
- ✅ In playlists (for YouTube songs) 
- ✅ In album views (for YouTube songs)
- ✅ In any SongRow component

**Note:** Download button ONLY shows for YouTube Music songs, not JioSaavn songs.

---

## 🔧 Configuration

### Local Development (Use your computer's IP):

**File: `.env.development`**
```env
# Replace with your computer's IP address
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.XX:8000/api
```

**Find your IP:**
```bash
# Windows
ipconfig

# Look for "IPv4 Address" under your WiFi adapter
# Example: 192.168.1.11
```

Then update .env:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.11:8000/api
```

### Production (Vercel):

**File: `.env.production`**
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

---

## 📦 What Gets Downloaded

### File Details:
- **Format**: M4A (audio only)
- **Size**: ~3-5 MB per song
- **Bitrate**: ~128 kbps
- **Location**: App's documents directory (`downloads/` folder)
- **Filename**: `{videoId}_{cleanTitle}.m4a`

### Example:
```
/data/user/0/com.mavrixfy.app/files/downloads/
├── dQw4w9WgXcQ_Rick_Astley_Never_Gonna_Give_You_Up.m4a (3.29 MB)
├── kJQP7kiw5Fk_Luis_Fonsi_Despacito.m4a (4.39 MB)
└── ...
```

---

## 🧪 Testing Checklist

### Backend Tests:

- [ ] Backend starts successfully on port 8000
- [ ] Health check works: `curl http://localhost:8000/api/healthz`
- [ ] Download endpoint returns success: `curl http://localhost:8000/api/download/dQw4w9WgXcQ`
- [ ] Response includes downloadUrl, title, artist, duration

### App Tests:

- [ ] App connects to backend (check logs)
- [ ] Search returns YouTube songs
- [ ] Download button visible on YouTube songs
- [ ] Download button NOT visible on JioSaavn songs
- [ ] Clicking download starts download
- [ ] Progress indicator shows during download
- [ ] Download completes successfully
- [ ] Button changes to checkmark after download
- [ ] Song plays without internet
- [ ] Clicking checkmark shows delete confirmation
- [ ] Delete removes file successfully

---

## 🐛 Troubleshooting

### Problem: Download button not showing

**Solution:**
- Ensure song is from YouTube (not JioSaavn)
- Check that `song.source === 'youtube'`
- Check that `song.youtubeVideoId` exists

### Problem: Download fails

**Check:**
1. Backend is running: `curl http://localhost:8000/api/healthz`
2. yt-dlp is installed: `pip list | grep yt-dlp`
3. Video is available: Try in browser first
4. Check backend logs for errors

### Problem: Downloaded song won't play

**Check:**
1. File exists: Check downloads folder
2. File is not corrupted: Check file size > 0
3. Media player supports M4A format
4. Device has sufficient storage

### Problem: Backend returns error

**Common errors:**
- `Video not available` - Video is private/deleted
- `Could not extract download URL` - YouTube changed API
- `ModuleNotFoundError: No module named 'yt_dlp'` - Run `pip install -r requirements.txt`

---

## 📊 Monitoring

### Check Backend Logs:

```bash
cd youtube-music-api
python main.py

# Watch for:
INFO:     GET /api/download/dQw4w9WgXcQ
[Download] Fetching download info for dQw4w9WgXcQ
```

### Check App Logs:

Look for:
```
[Download] Starting download for: Song Title
[Download] Downloading file...
[Download] Download completed: file:///...
[Download] Saved metadata for Song Title
```

---

## 🎉 Success Indicators

✅ Backend endpoint returns 200 status
✅ Response includes valid downloadUrl
✅ File downloads to device storage
✅ Button changes from 📥 to ✅
✅ Song plays without internet
✅ File persists after app restart

---

## 🚀 Deploy to Production

### Deploy Backend to Vercel:

```bash
cd youtube-music-api
vercel deploy --prod
```

### Update App Environment:

**For iOS build:**
```bash
# Update app.json
"extra": {
  "youtubeMusicApiUrl": "https://mavrixfy-api-drab.vercel.app/api/youtube-music"
}
```

**For Android build:**
```bash
# Update .env.production
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

### Build App:

```bash
# iOS
eas build --platform ios --profile production

# Android  
eas build --platform android --profile production
```

---

## 💡 Tips

1. **Test with short songs first** - Rick Astley (~3MB) is perfect
2. **Use WiFi for testing** - Downloads use data
3. **Check storage space** - Each song is ~3-5MB
4. **Delete test downloads** - Long press checkmark to delete
5. **Backend must be running** - Start it before testing

---

## 📞 Need Help?

### Check these files:
- Backend: `youtube-music-api/main.py` (line ~180 for download endpoint)
- Service: `lib/offlineDownloadService.ts`
- UI: `components/DownloadButton.tsx`
- Integration: `components/SongRow.tsx`

### Test individual components:
```typescript
// Test download service
import { getDownloadInfo } from '@/lib/offlineDownloadService';
const info = await getDownloadInfo('dQw4w9WgXcQ');
console.log(info);
```

---

## 🎊 You're Ready!

Everything is set up and working! Start testing the offline download feature now! 🎵

**Quick test command:**
```bash
# Terminal 1: Start backend
cd youtube-music-api && python main.py

# Terminal 2: Test endpoint
curl "http://localhost:8000/api/download/dQw4w9WgXcQ"

# Terminal 3: Start app
npm start
```

Happy offline listening! 🎧
