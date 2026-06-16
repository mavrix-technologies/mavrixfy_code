# YouTube Music Playback Issues & Fix Plan

## Problems Identified

### 1. **YouTube Music Not Playing on First Song** ❌
**Root Cause**: 
- `normalizePlayableSong()` checks if `resolveAudioUrl()` returns a value
- YouTube Music songs have `audioUrl: ""` (empty by design)
- They pass through because `source === "youtube"` check, BUT:
- If not properly detected as YouTube, they get filtered out as "unplayable"

**Location**: `contexts/PlayerContext.tsx` lines 300-313

```typescript
function normalizePlayableSong(song: Song | null | undefined): Song | null {
  if (!song?.id) return null;

  if (song.source === "youtube") {
    return song;  // ✅ Should work BUT...
  }

  const resolvedAudioUrl = resolveAudioUrl(song as SongPlaybackSource);
  if (!resolvedAudioUrl) return null;  // ❌ Would fail for YouTube

  // ...
}
```

### 2. **Next/Previous Not Working Properly** ❌
**Root Cause**:
- `nextSong()` and `prevSong()` check `isYouTubeSong(nextTrack)`
- If detection fails, they try to play via native player
- Native player expects `audioUrl` but YouTube songs have empty string
- Results in "no playable audio URL" error

**Failure Points**:
- Lines 2759-2765 (nextSong)
- Lines 2867-2873 (prevSong)

### 3. **Inconsistent Platform Handling** ❌
**Root Cause**:
- JioSaavn songs: Direct through native audio
- YouTube songs: Through iframe player with separate state
- No unified abstraction layer
- Duplicate code in next/prev/play functions

### 4. **Video ID Extraction Fragile** ❌
**Root Cause**:
- Multiple fallback fields checked in `getYouTubeVideoIdFromSong()`
- Complex regex matching
- Can return empty string silently

## Solution Architecture

### Unified Playback Strategy

```typescript
// NEW: Unified song type detection
function getSongPlatform(song: Song): "youtube" | "native" {
  if (!song) return "native";
  if (song.source === "youtube") return "youtube";
  if (song.id?.startsWith("youtube_")) return "youtube";
  if (song.id?.startsWith("yt:")) return "youtube";
  if (song.youtubeVideoId) return "youtube";
  return "native";
}

// NEW: Unified playback router
async function playSongUnified(song: Song, queue: Song[], index: number) {
  const platform = getSongPlatform(song);
  
  if (platform === "youtube") {
    await playYouTubeSong(song, queue, index);
  } else {
    await playNativeSong(song, queue, index);
  }
}

// NEW: Extract native playback logic
async function playNativeSong(song: Song, queue: Song[], index: number) {
  // All TrackPlayer/ExpoAv logic here
  // Currently scattered in playSong(), nextSong(), prevSong()
}
```

### Reusable Components

```typescript
// lib/playbackRouter.ts (NEW FILE)

export interface PlaybackPlatform {
  play: (song: Song, queue: Song[], index: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  getPosition: () => number;
  getDuration: () => number;
}

export class YouTubeMusicPlatform implements PlaybackPlatform {
  // YouTube-specific implementation
}

export class NativeAudioPlatform implements PlaybackPlatform {
  // TrackPlayer/ExpoAv implementation
}

export function getPlatformForSong(song: Song): PlaybackPlatform {
  const type = getSongPlatform(song);
  return type === "youtube" 
    ? new YouTubeMusicPlatform()
    : new NativeAudioPlatform();
}
```

## Fixes Required

### Fix 1: Robust YouTube Detection

**File**: `contexts/PlayerContext.tsx`

```typescript
// BEFORE (fragile)
function isYouTubeSong(song: Song | null | undefined): boolean {
  if (!song) return false;
  const isYt = song.source === "youtube" || song.id?.startsWith("youtube_");
  // ... offline check ...
  return true;
}

// AFTER (robust)
function isYouTubeSong(song: Song | null | undefined): boolean {
  if (!song) return false;
  
  // Primary checks
  if (song.source === "youtube") return !isDownloadedOffline(song);
  if (song.id?.startsWith("youtube_")) return !isDownloadedOffline(song);
  if (song.id?.startsWith("yt:")) return !isDownloadedOffline(song);
  
  // Fallback: has YouTube video ID but no audio URL
  if (song.youtubeVideoId && !song.audioUrl) return !isDownloadedOffline(song);
  
  return false;
}

function isDownloadedOffline(song: Song): boolean {
  try {
    const videoId = extractYouTubeVideoId(song);
    if (!videoId) return false;
    const { isDownloadedSync } = require("@/lib/offlineDownloadService");
    return isDownloadedSync(videoId);
  } catch {
    return false;
  }
}

function extractYouTubeVideoId(song: Song): string {
  // Prioritized extraction
  if (song.youtubeVideoId) return song.youtubeVideoId;
  if (song.videoId) return song.videoId;
  
  // Extract from ID
  const id = song.id || "";
  if (id.startsWith("youtube_")) return id.replace("youtube_", "");
  if (id.startsWith("yt:")) return id.replace("yt:", "");
  
  // Validate format
  const match = id.match(/^([a-zA-Z0-9_-]{11})$/);
  return match ? match[1] : "";
}
```

### Fix 2: Unified Next/Previous

**File**: `contexts/PlayerContext.tsx`

```typescript
// EXTRACT common logic
async function switchToTrackAtIndex(
  index: number, 
  direction: "next" | "prev" | "direct"
): Promise<void> {
  const cq = queueRef.current;
  if (index < 0 || index >= cq.length) return;
  
  const targetSong = cq[index];
  if (!targetSong) return;
  
  // Unified platform routing
  if (isYouTubeSong(targetSong)) {
    await playYouTubeSong(targetSong, cq, index);
    return;
  }
  
  // Stop YouTube if transitioning from YouTube
  if (youtubeVideoId) {
    youtubeShouldAutoPlayRef.current = false;
    setYoutubePlaying(false);
    setYoutubeVideoId(null);
    setIsYoutubeLoading(false);
  }
  
  // Play via native player
  await playNativeSongAtIndex(targetSong, cq, index, direction);
}

// REFACTOR nextSong
const nextSong = useCallback(async () => {
  const cq = queueRef.current;
  const ci = queueIndexRef.current;
  if (cq.length === 0) return;
  
  let ni = ci + 1;
  const rm = repeatModeRef.current;
  
  if (ni >= cq.length) {
    if (rm === "all") ni = 0;
    else return;
  }
  
  await switchToTrackAtIndex(ni, "next");
}, []);

// REFACTOR prevSong
const prevSong = useCallback(async () => {
  const cq = queueRef.current;
  const ci = queueIndexRef.current;
  if (cq.length === 0) return;
  
  // Check if should restart current song
  const shouldRestart = await shouldRestartCurrentSong();
  if (shouldRestart) {
    await restartCurrentSong();
    return;
  }
  
  let pi = ci - 1;
  const rm = repeatModeRef.current;
  
  if (pi < 0) {
    if (rm === "all") pi = cq.length - 1;
    else {
      await restartCurrentSong();
      return;
    }
  }
  
  await switchToTrackAtIndex(pi, "prev");
}, []);
```

### Fix 3: Ensure YouTube Songs Pass Normalization

**File**: `contexts/PlayerContext.tsx`

```typescript
function normalizePlayableSong(song: Song | null | undefined): Song | null {
  if (!song?.id) return null;

  // ✅ YouTube songs are ALWAYS playable (if they have videoId)
  if (song.source === "youtube") {
    const videoId = extractYouTubeVideoId(song);
    if (!videoId) {
      logger.warn("[Normalize] YouTube song missing video ID", { id: song.id });
      return null;
    }
    return {
      ...song,
      youtubeVideoId: videoId,  // Ensure it's set
    };
  }

  // ✅ For native audio, must have audioUrl
  const resolvedAudioUrl = resolveAudioUrl(song as SongPlaybackSource);
  if (!resolvedAudioUrl) {
    logger.warn("[Normalize] Native song missing audio URL", { id: song.id });
    return null;
  }

  return {
    ...song,
    audioUrl: resolvedAudioUrl,
  };
}
```

### Fix 4: Better Logging

**Add throughout**:

```typescript
logger.debug("[Playback] Playing song", {
  id: song.id,
  title: song.title,
  platform: getSongPlatform(song),
  hasAudioUrl: !!song.audioUrl,
  hasVideoId: !!song.youtubeVideoId,
});

logger.debug("[Playback] Next song", {
  currentIndex: ci,
  nextIndex: ni,
  nextSongId: nextSong.id,
  nextPlatform: getSongPlatform(nextSong),
});
```

## Implementation Plan

### Phase 1: Immediate Fixes (Critical)
1. ✅ Fix `isYouTubeSong()` detection
2. ✅ Fix `normalizePlayableSong()` for YouTube
3. ✅ Fix `extractYouTubeVideoId()` helper
4. ✅ Add logging to debug failures

### Phase 2: Refactor (Important)
5. ✅ Extract `switchToTrackAtIndex()` helper
6. ✅ Simplify `nextSong()` and `prevSong()`
7. ✅ Remove duplicate YouTube stop code

### Phase 3: Architecture (Future)
8. ⏳ Create `lib/playbackRouter.ts`
9. ⏳ Implement platform interfaces
10. ⏳ Migrate to unified router

## Testing Checklist

### YouTube Music
- [ ] Play first YouTube Music song from playlist
- [ ] Skip to next YouTube Music song
- [ ] Go back to previous YouTube Music song
- [ ] YouTube → YouTube transition
- [ ] Repeat mode works with YouTube

### Mixed Playlists
- [ ] Play JioSaavn song
- [ ] Skip to YouTube Music song (JioSaavn → YouTube)
- [ ] Skip from YouTube to JioSaavn (YouTube → JioSaavn)
- [ ] Go back through mixed queue
- [ ] Repeat works with mixed queue

### Edge Cases
- [ ] YouTube song with no video ID (should show error)
- [ ] Downloaded YouTube song (should play natively)
- [ ] Network failure during YouTube playback
- [ ] App restart resumes correct platform

## Success Criteria

✅ **YouTube Music plays immediately** on first song  
✅ **Next/Previous work reliably** in YouTube-only playlists  
✅ **Seamless transitions** between YouTube ↔ JioSaavn  
✅ **No duplicate code** between platform handlers  
✅ **Clear error messages** when playback fails  
✅ **Same user experience** regardless of platform  

## Breaking Changes

❌ **None** - All fixes are internal improvements
