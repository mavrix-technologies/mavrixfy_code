# 🔴 CRITICAL: YouTube Playback Not Working

## Error

```
INFO  [YouTube Music] Resolving stream for 2u2Z07ujyD8 via backend
INFO  [NativeResolve] Got stream response for 2u2Z07ujyD8 
      {"hasStream": false, "hasUrl": false, "url": undefined, "urlTrusted": false}
ERROR [NativeResolve] Could not resolve YouTube stream
```

## Root Cause

Your backend API (`https://mavrixfy-song-api.vercel.app`) **does NOT have YouTube stream resolution endpoints**.

Looking at your backend code:
- `e:\Mavrixfy\mavrixfy-song-api\` - This is a **JioSaavn API** only
- It has endpoints for: `/songs`, `/albums`, `/artists`, `/playlists`, `/search`
- It does **NOT** have: `/stream/:videoId` or `/api/youtube-music/stream/` endpoints

But your app is trying to play **YouTube Music tracks** and calling:
```
GET https://mavrixfy-song-api.vercel.app/api/youtube-music/stream/2u2Z07ujyD8
```

This endpoint doesn't exist in your backend → returns undefined → playback fails.

---

## Why It Works in Dev Mode

In development, you might have:
1. A local backend running with YouTube support
2. Different API configuration
3. Cached stream URLs

But in production APK/IPA, the backend doesn't support YouTube streams.

---

## Solutions

### ✅ Solution 1: Use Only JioSaavn Songs (Quick Fix)

**Disable YouTube Music entirely** and only use JioSaavn:

1. **Modify your search** to filter out YouTube results
2. **Remove YouTube sources** from playlists
3. **Use only JioSaavn API responses**

**Pros:**
- ✅ Works immediately with existing backend
- ✅ No backend changes needed
- ✅ Reliable playback

**Cons:**
- ❌ Loses YouTube Music catalog
- ❌ Smaller music library

---

### ✅ Solution 2: Add YouTube Stream Resolution to Backend (Recommended)

Add YouTube stream resolution endpoints to your backend.

#### Option A: Use `youtube-sr` or `ytdl-core`

**Install dependencies:**
```bash
cd e:\Mavrixfy\mavrixfy-song-api\mavrixfy-song-api
npm install youtube-sr
# or
npm install ytdl-core
```

**Create stream controller:**
```typescript
// src/modules/youtube/controllers/youtube-stream.controller.ts
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import ytdl from 'ytdl-core' // or use youtube-sr

export class YouTubeStreamController {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/stream/:videoId',
        tags: ['YouTube'],
        summary: 'Get YouTube audio stream URL',
        request: {
          params: z.object({
            videoId: z.string()
          }),
          query: z.object({
            platform: z.string().optional(),
            strictAudioOnly: z.string().optional(),
            allowMuxedFallback: z.string().optional()
          })
        },
        responses: {
          200: {
            description: 'Stream URL resolved',
            content: {
              'application/json': {
                schema: z.object({
                  videoId: z.string(),
                  url: z.string(),
                  expiresAt: z.number(),
                  headers: z.record(z.string()),
                  mimeType: z.string().optional(),
                  bitrateKbps: z.number().optional(),
                  duration: z.number().optional()
                })
              }
            }
          }
        }
      }),
      async (ctx) => {
        const { videoId } = ctx.req.param()
        
        try {
          const info = await ytdl.getInfo(`https://youtube.com/watch?v=${videoId}`)
          
          // Find best audio format
          const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
          const bestAudio = audioFormats.sort((a, b) => 
            (b.audioBitrate || 0) - (a.audioBitrate || 0)
          )[0]
          
          if (!bestAudio || !bestAudio.url) {
            return ctx.json({ error: 'No audio stream found' }, 404)
          }

          // Parse expiry from URL
          const url = new URL(bestAudio.url)
          const expire = url.searchParams.get('expire')
          const expiresAt = expire ? Number(expire) * 1000 : Date.now() + 6 * 60 * 60 * 1000

          return ctx.json({
            videoId,
            url: bestAudio.url,
            expiresAt,
            headers: {},
            mimeType: bestAudio.mimeType,
            bitrateKbps: bestAudio.audioBitrate,
            duration: Number(info.videoDetails.lengthSeconds)
          })
        } catch (error) {
          console.error('YouTube stream error:', error)
          return ctx.json({ error: 'Failed to resolve stream' }, 500)
        }
      }
    )
  }
}
```

**Register in app:**
```typescript
// src/api/index.ts
import { YouTubeStreamController } from '../modules/youtube/controllers'

const app = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController(),
  new YouTubeStreamController() // ← Add this
]).getApp()
```

#### Option B: Use YouTube Music Internal API (youtubei.js)

**Install:**
```bash
npm install youtubei.js
```

**Create controller:**
```typescript
import { Innertube } from 'youtubei.js'

export class YouTubeStreamController {
  private youtube: Innertube | null = null

  async initYouTube() {
    if (!this.youtube) {
      this.youtube = await Innertube.create()
    }
    return this.youtube
  }

  async getStream(videoId: string) {
    const yt = await this.initYouTube()
    const info = await yt.music.getInfo(videoId)
    
    const format = info.streaming_data?.adaptive_formats
      ?.filter(f => f.has_audio && !f.has_video)
      ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]

    if (!format || !format.decipher(yt.session.player)) {
      throw new Error('No audio format found')
    }

    return {
      videoId,
      url: format.url,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      headers: {},
      mimeType: format.mime_type,
      bitrateKbps: Math.round((format.bitrate || 0) / 1000),
      duration: info.basic_info.duration
    }
  }
}
```

---

### ✅ Solution 3: Use a Third-Party YouTube API Service

Use an existing YouTube stream resolution service:

**Options:**
1. **Invidious API** - `https://api.invidious.io`
2. **Piped API** - `https://pipedapi.kavin.rocks`
3. **YouTube Data API** (requires API key)

**Update your app to call third-party service:**

```typescript
// lib/youtubeMusicService.ts

async function getYouTubeMusicAudioStream(
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeMusicAudioStream | null> {
  // Try your backend first
  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(`/stream/${videoId}`, ``, query),
      signal
    )
    if (json) return normalizeAudioStreamPayload(json, videoId)
  } catch (err) {
    console.warn('Backend stream failed, trying fallback')
  }

  // Fallback to Invidious API
  try {
    const response = await fetch(
      `https://invidious.io.lol/api/v1/videos/${videoId}`,
      { signal }
    )
    const data = await response.json()
    
    const audioFormat = data.adaptiveFormats
      ?.filter((f: any) => f.type?.includes('audio'))
      ?.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]

    if (audioFormat?.url) {
      return {
        videoId,
        url: audioFormat.url,
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        headers: {},
        mimeType: audioFormat.type,
        bitrateKbps: Math.round(audioFormat.bitrate / 1000),
        duration: data.lengthSeconds
      }
    }
  } catch (err) {
    console.error('Fallback failed:', err)
  }

  return null
}
```

---

### ✅ Solution 4: Disable YouTube, Enable Only When Backend Ready

**Temporary fix while you build backend:**

```typescript
// lib/youtubeMusicService.ts

export async function getYouTubeAudioStreamForPlayback(
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeMusicAudioStream | null> {
  // Temporarily disable YouTube playback
  logger.warn('[YouTube] Playback temporarily disabled - backend not ready')
  return null
  
  // Original code commented out:
  // const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  // if (!cleanVideoId) return null;
  // ...
}
```

And update search to filter YouTube:

```typescript
// In your search/playlist code
const songs = allSongs.filter(song => song.source !== 'youtube')
```

---

## Recommended Implementation Path

### Phase 1: Quick Fix (5 minutes)
1. **Disable YouTube playback** in app (Solution 4)
2. **Filter out YouTube songs** from search results
3. **Test** - JioSaavn songs should play perfectly

### Phase 2: Backend Implementation (1-2 hours)
1. **Choose**: `ytdl-core` or `youtubei.js`
2. **Add stream endpoint** to backend
3. **Test locally** with Postman
4. **Deploy to Vercel**
5. **Re-enable YouTube** in app
6. **Test** on device

### Phase 3: Production (30 minutes)
1. **Update DNS/environment** if needed
2. **Monitor errors** in Vercel logs
3. **Add rate limiting** to prevent abuse
4. **Add caching** for stream URLs (5-minute TTL)

---

## Testing Your Fix

### Test Backend Endpoint

```bash
# Test your new endpoint
curl https://mavrixfy-song-api.vercel.app/api/youtube-music/stream/2u2Z07ujyD8

# Should return:
{
  "videoId": "2u2Z07ujyD8",
  "url": "https://rr1---sn-....googlevideo.com/videoplayback?...",
  "expiresAt": 1234567890000,
  "headers": {},
  "mimeType": "audio/mp4",
  "bitrateKbps": 128,
  "duration": 210
}
```

### Test in App

1. **Rebuild app** with updated backend
2. **Try playing** a YouTube song
3. **Check logs** - should see:
   ```
   [YouTube Music] Got direct playable stream from backend
   [NativeResolve] Stream resolved for 2u2Z07ujyD8
   ```

---

## Why Current Backend Doesn't Work

Your `mavrixfy-song-api` is built for **JioSaavn only**:

```typescript
// src/api/index.ts
const app = new App([
  new SearchController(),    // JioSaavn search
  new SongController(),       // JioSaavn songs
  new AlbumController(),      // JioSaavn albums
  new ArtistController(),     // JioSaavn artists
  new PlaylistController()    // JioSaavn playlists
]).getApp()

// Missing: YouTubeStreamController!
```

The `/stream/:videoId` endpoint doesn't exist, so:
```
App → GET /api/youtube-music/stream/2u2Z07ujyD8
Backend → 404 Not Found
App → undefined response → playback fails
```

---

## Vercel Deployment Notes

If you add YouTube stream resolution:

1. **Increase timeout** in `vercel.json`:
```json
{
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  }
}
```

2. **Add environment variables** (if using YouTube Data API):
```
YOUTUBE_API_KEY=your_key_here
```

3. **Monitor usage** - YouTube stream resolution can be API-intensive

---

## Summary

| Solution | Time | Difficulty | Pros | Cons |
|----------|------|------------|------|------|
| **1. Disable YouTube** | 5 min | Easy | ✅ Works immediately | ❌ No YouTube music |
| **2. Add Backend Endpoint** | 1-2 hrs | Medium | ✅ Full control | ⚠️ Requires deployment |
| **3. Third-Party API** | 30 min | Easy | ✅ No backend work | ⚠️ Depends on external service |
| **4. Temporary Disable** | 5 min | Easy | ✅ Quick workaround | ❌ Temporary only |

---

## Immediate Action Required

**Right now, do this:**

1. **Disable YouTube playback temporarily**:
```typescript
// lib/youtubeMusicService.ts line ~1227
export async function getYouTubeAudioStreamForPlayback(
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeMusicAudioStream | null> {
  logger.warn('[YouTube] Disabled - backend endpoint not implemented')
  return null // ← Add this
}
```

2. **Filter YouTube from search**:
```typescript
// Wherever you display search results
const playableSongs = songs.filter(s => s.source !== 'youtube')
```

3. **Rebuild and test** - JioSaavn songs will work perfectly

---

**Status:** 🔴 BLOCKING ISSUE  
**Priority:** CRITICAL  
**Fix Time:** 5 minutes (temporary) or 1-2 hours (permanent)  
**Next Step:** Choose a solution and implement
