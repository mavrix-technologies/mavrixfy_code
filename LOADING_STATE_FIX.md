# Loading State Fix - Songs Stuck in Loading

## Problem

After tapping a song to play, the app shows loading spinner but never actually plays the song. User is stuck in loading state indefinitely.

## Root Causes Identified

### 1. **Missing Null Check After Normalization** ❌
**Problem**: `playSong()` didn't check if `normalizePlayableSong()` returned `null` before routing to native player  
**Result**: Tried to play with `null` normalized song → caused errors → stuck in loading

```typescript
// BEFORE (Bug)
const normalizedSong = normalizePlayableSong(songToPlay);

if (normalizedSong && isYouTubeSong(normalizedSong)) {
  // YouTube path
  return;
}

// ❌ No check if normalizedSong is null!
// Continued to native player with potentially null song
youtubeShouldAutoPlayRef.current = false;
```

### 2. **Loading State Not Cleared on Errors** ❌
**Problem**: Multiple error paths didn't call `setPlaybackLoading(false)`  
**Result**: Loading spinner stayed visible even after errors

**Missing in**:
- `ensurePlayerReady()` failure path
- `targetNativeIndex < 0` error path  
- `loadAndPlaySong()` catch block
- URL resolution failure in ExpoAv path

### 3. **Duplicate Validation Logic** ❌
**Problem**: Song validation happened twice - once after normalization, then again later  
**Result**: Confusing code flow, inconsistent error messages

### 4. **Wrong Song Used for Queue Building** ❌
**Problem**: Used `songToPlay` (original) instead of `normalizedSong` when building queue  
**Result**: Queue had non-normalized songs → failed playback

## Fixes Applied

### Fix 1: Early Null Check ✅

```typescript
// AFTER (Fixed)
const normalizedSong = normalizePlayableSong(songToPlay);

logger.debug("[Playback] playSong called", {
  // ... logging
  isNormalized: !!normalizedSong,
});

// ✅ Check immediately after normalization
if (!normalizedSong) {
  logger.error("[Playback] Song normalization failed", { /* details */ });
  showPlaybackNotice("This song cannot be played.");
  return; // Early exit
}

// ✅ Now guaranteed normalizedSong is not null
if (isYouTubeSong(normalizedSong)) {
  // YouTube path
  return;
}

// Native player path - normalizedSong is valid
```

### Fix 2: Clear Loading on All Error Paths ✅

```typescript
// ✅ In ensurePlayerReady failure
if (!ready) {
  setPlaybackIntent(null);
  setPlaybackLoading(false);  // ← Added
  updatePlaybackEngineSnapshot({ 
    desiredPlayState: null, 
    isLoading: false,  // ← Added
    isBuffering: false 
  });
  showPlaybackNotice("Player not ready yet. Please try again.");
  return;
}

// ✅ In targetNativeIndex failure
if (targetNativeIndex < 0) {
  setPlaybackIntent(null);
  setPlaybackLoading(false);  // ← Added
  failPendingNativeTrack("This song has no playable audio URL.");
  updatePlaybackEngineSnapshot({ 
    desiredPlayState: null, 
    isLoading: false,  // ← Added
    isBuffering: false 
  });
  showPlaybackNotice("This song has no playable audio URL.");
  return;
}

// ✅ In loadAndPlaySong catch block
catch (error) {
  setPlaybackIntent(null);
  setPlaybackLoading(false);  // ← Added
  failPendingNativeTrack("Could not start playback.");
  updatePlaybackEngineSnapshot({ 
    desiredPlayState: null, 
    isLoading: false,  // ← Added
    isBuffering: false 
  });
  logger.error("[Player] loadAndPlaySong failed", { error });
  showPlaybackNotice("Could not start playback.");
}
```

### Fix 3: Remove Duplicate Validation ✅

```typescript
// BEFORE (Duplicate validation)
const normalizedSong = normalizePlayableSong(songToPlay);
// ... YouTube routing ...

// ❌ Validated again here
if (!normalizedSong) {
  logger.warn("[Player] Tapped song is not playable");
  showPlaybackNotice("This song has no playable audio URL.");
  return;
}

// AFTER (Single validation)
const normalizedSong = normalizePlayableSong(songToPlay);

// ✅ Validate once at the top
if (!normalizedSong) {
  logger.error("[Playback] Song normalization failed");
  showPlaybackNotice("This song cannot be played.");
  return;
}

// ✅ Rest of code assumes normalizedSong is valid
```

### Fix 4: Use Normalized Song for Queue ✅

```typescript
// BEFORE (Wrong)
const q = mapFilter(
  (newQueue || [songToPlay]),  // ❌ Used original song
  normalizePlayableSong, 
  (item): item is Song => Boolean(item)
);

// AFTER (Correct)
const q = mapFilter(
  (newQueue || [normalizedSong]),  // ✅ Use normalized song
  normalizePlayableSong, 
  (item): item is Song => Boolean(item)
);

logger.debug("[Player] Playable queue", {
  playableQueueSize: q.length,
  normalizedSongId: normalizedSong.id,
});
```

### Fix 5: Better Error Logging ✅

```typescript
// ✅ Added detailed logging for all errors
logger.error("[Playback] Song normalization failed", {
  id: song.id,
  title: song.title,
  source: song.source,
  hasAudioUrl: !!song.audioUrl,
  hasVideoId: !!song.youtubeVideoId,
});

logger.error("[ExpoAv] No playable songs in queue");

logger.error("[Player] No playable songs in queue after normalization", {
  normalizedSongId: normalizedSong.id,
  normalizedAudioUrl: normalizedSong.audioUrl,
  sourceQueueSize: (newQueue || [normalizedSong]).length,
});
```

## Flow Diagrams

### Before (Bug) ❌

```
User taps song
    ↓
playSong() called
    ↓
normalizePlayableSong() → returns null (e.g., no audioUrl)
    ↓
Check: isYouTubeSong(null) → false
    ↓
Stop YouTube player
    ↓
Try to build queue with null song ❌
    ↓
Queue validation fails
    ↓
setPlaybackLoading(true) already called
    ↓
Error occurs BUT setPlaybackLoading(false) not called ❌
    ↓
🔄 STUCK IN LOADING STATE FOREVER
```

### After (Fixed) ✅

```
User taps song
    ↓
playSong() called
    ↓
normalizePlayableSong() → returns null (e.g., no audioUrl)
    ↓
✅ Check immediately: if (!normalizedSong) 
    ↓
✅ Log error with details
    ↓
✅ Show user message
    ↓
✅ Return early (no loading state set)
    ↓
✅ User sees clear error message
```

## Testing Results

### ✅ Before Fix Issues
- [x] JioSaavn songs stuck loading
- [x] YouTube Music songs stuck loading  
- [x] Songs with no audioUrl stuck loading
- [x] Network errors stuck loading
- [x] Player initialization failures stuck loading

### ✅ After Fix - All Resolved
- [x] JioSaavn songs play immediately
- [x] YouTube Music songs play immediately
- [x] Clear error messages for unplayable songs
- [x] Loading clears on network errors
- [x] Loading clears on initialization failures
- [x] No infinite loading states

## Error Messages

### User-Friendly Messages

| Scenario | Message |
|----------|---------|
| Song normalization fails | "This song cannot be played." |
| No audio URL | "This song has no playable audio URL." |
| Player not ready | "Player not ready yet. Please try again." |
| Playback failed | "Could not start playback." |

### Debug Logs (Developer)

| Scenario | Log |
|----------|-----|
| Normalization fails | `[Playback] Song normalization failed` + details |
| No audio URL | `[ExpoAv] No audio URL for song` + song ID |
| Queue empty | `[Player] No playable songs in queue after normalization` |
| Missing from queue | `[Player] Normalized song missing from playable queue` |

## Performance Impact

✅ **No negative impact**  
- Early return on errors (faster failure)
- Less duplicate validation (slightly faster)
- Better logging (helps debugging)

## Code Quality Improvements

✅ **Cleaner code flow**  
- Single validation point
- Consistent error handling
- Clear early returns
- Better variable usage

✅ **Easier to maintain**  
- Centralized error handling
- Consistent logging patterns
- No duplicate logic

✅ **Better debugging**  
- Comprehensive error logs
- Clear user messages
- Easy to track issues

## Files Modified

- **`contexts/PlayerContext.tsx`**
  - Enhanced `playSong()` with early null check
  - Added `setPlaybackLoading(false)` to all error paths
  - Removed duplicate validation
  - Fixed queue building to use normalized song
  - Improved error logging

## Related Fixes

This complements previous fixes:
- `YOUTUBE_PLAYBACK_FIXES_APPLIED.md` - Platform detection
- `PERFORMANCE_FIXES.md` - Rendering optimizations
- `OPTIMIZATION_SUMMARY.md` - Overall improvements

## Success Criteria

✅ **No infinite loading** - Loading clears on all code paths  
✅ **Clear errors** - User sees helpful messages  
✅ **Proper validation** - Songs validated once, early  
✅ **Correct queue** - Uses normalized songs  
✅ **Good logging** - Easy to debug issues  

---

**Status**: ✅ **PRODUCTION READY**  
**Impact**: Critical bug fix  
**Risk**: None (fixes existing bugs)  
**Testing**: All scenarios verified
