# YouTube Music Debug Guide - Comprehensive Testing

## Added Comprehensive Logging ✅

### New Logs Added

1. **`onYoutubeReady` callback**
   - Logs when callback fires
   - Logs `shouldAutoPlay` state
   - Logs video ID
   - Logs quality setting attempts
   - Logs delayed playback initiation

2. **`onYoutubeStateChange` callback**
   - Logs every state change
   - Logs `shouldAutoPlay` at each state
   - Logs video ID
   - Logs specific actions for each state

3. **`onYoutubeError` callback**
   - Enhanced error logging
   - Includes video ID
   - Includes current song ID

## How to Debug

### Step 1: Enable Debug Logging

**Android**:
```bash
# Clear logs first
adb logcat -c

# Start watching logs
adb logcat | grep -E "\[YouTube\]|\[Playback\]|\[Normalize\]"
```

**iOS**:
```bash
# In Xcode or terminal
npx react-native log-ios | grep -E "\[YouTube\]|\[Playback\]|\[Normalize\]"
```

### Step 2: Tap YouTube Music Song

When you tap a YouTube song, you should see this sequence:

```
✅ EXPECTED LOG SEQUENCE:

1. [Playback] playSong called
   { 
     id: "youtube_ABC123",
     source: "youtube",
     hasVideoId: true,
     isNormalized: true
   }

2. [Playback] Routing to YouTube player
   { id: "youtube_ABC123" }

3. [YouTube] playYouTubeSong
   {
     songId: "youtube_ABC123",
     songTitle: "Song Name",
     videoId: "ABC123DEF45",
     queueSize: 1,
     targetIndex: 0
   }

4. [YouTube] onReady callback fired
   {
     shouldAutoPlay: true,
     videoId: "ABC123DEF45"
   }

5. [YouTube] Set playback quality to auto

6. [YouTube] Preparing to start playback in 50ms

7. [YouTube] Starting playback now

8. [YouTube] State changed
   { state: "buffering", shouldAutoPlay: true, videoId: "ABC123DEF45" }

9. [YouTube] Buffering

10. [YouTube] State changed
    { state: "playing", shouldAutoPlay: true, videoId: "ABC123DEF45" }

11. [YouTube] Now playing

✅ Song should be playing now!
```

### Step 3: Check for Issues

#### Issue 1: onReady Never Fires ❌

**Logs show**:
```
[YouTube] playYouTubeSong { ... }
// ❌ NO onReady callback
```

**Possible causes**:
- YouTube player failed to initialize
- Video ID is invalid
- Network issues loading player
- WebView issues

**Debug**:
```bash
# Check for YouTube player errors
adb logcat | grep -i "youtube"

# Check for WebView errors  
adb logcat | grep -i "webview"
```

#### Issue 2: onReady Fires but shouldAutoPlay is False ❌

**Logs show**:
```
[YouTube] onReady callback fired { shouldAutoPlay: false, ... }
[YouTube] onReady but shouldAutoPlay is false, skipping
```

**Cause**: Something cleared `youtubeShouldAutoPlayRef` before ready
**Fix**: Check if another function is interfering

#### Issue 3: State Stuck in "buffering" ❌

**Logs show**:
```
[YouTube] State changed { state: "buffering", ... }
[YouTube] Buffering
// ❌ Never transitions to "playing"
```

**Possible causes**:
- Network too slow
- Video blocked in region
- Video age-restricted
- Video removed

**Debug**:
- Try different video
- Check network speed
- Look for error callbacks

#### Issue 4: YouTube Player Error ❌

**Logs show**:
```
[YoutubePlayer] Error occurred { code: 150, ... }
```

**Error codes**:
- `2`: Invalid video ID
- `5`: HTML5 player error
- `100`: Video not found / removed
- `101`: Video owner doesn't allow embedding
- `150`: Same as 101
- `UNKNOWN`: General error

### Step 4: Check Video ID Extraction

```bash
# Filter for normalization logs
adb logcat | grep "\[Normalize\]"
```

**Should see**:
```
[Playback] playSong called
  { 
    id: "youtube_ABC123",
    hasVideoId: true,  // ✅ Should be true
    normalizedSource: "youtube",
    isNormalized: true // ✅ Should be true
  }
```

**If video ID missing**:
```
[Normalize] YouTube song missing video ID
  { id: "youtube_ABC123", title: "Song Name" }
```

**Fix**: Check `convertYouTubeMusicTrack()` in `youtubeMusicService.ts`

### Step 5: Monitor State Transitions

**Complete state flow**:
```
unstarted → buffering → playing
          OR
unstarted → video cued → buffering → playing
          OR  
unstarted → paused (if network slow) → buffering → playing
```

**Watch for**:
```bash
adb logcat | grep "State changed"
```

### Step 6: Check Player Component

**Verify player is rendering**:
```bash
adb logcat | grep -i "youtubeplayer"
```

**Player should have**:
- `play={true}` when playing
- Valid `videoId` (11 characters)
- `onReady` callback wired
- `onChangeState` callback wired  
- `onError` callback wired

## Common Issues & Solutions

### Issue: "Could not play this YouTube Music song"

**Check logs for**:
```
[YouTube] No video ID found
```

**Solution**:
1. Verify song has `youtubeVideoId` field
2. Check `convertYouTubeMusicTrack()` sets it correctly
3. Ensure ID format is 11 characters

### Issue: Infinite loading spinner

**Check logs for**:
```
[YouTube] Starting playback now
// ❌ But no "State changed" after
```

**Solution**:
1. Check network connection
2. Try different video
3. Check YouTube player library version
4. Verify WebView is working

### Issue: "YouTube video blocked or unavailable"

**Logs show**:
```
[YoutubePlayer] Error occurred { code: 150, ... }
```

**Solution**:
1. Video is region-locked or embeddable
2. Try playing from YouTube app
3. Use alternative video ID

### Issue: Player loads but no sound

**Check**:
1. Device volume
2. App audio permissions
3. Other apps using audio
4. YouTube player muted

## Testing Commands

### Full Log Capture
```bash
# Start logging to file
adb logcat | grep -E "\[YouTube\]|\[Playback\]|\[Normalize\]" | tee youtube_debug.log

# Play a song, then Ctrl+C to stop

# Review the file
cat youtube_debug.log
```

### Filter Specific Issues
```bash
# Only errors
adb logcat | grep -E "ERROR|WARN" | grep -i youtube

# Only state changes  
adb logcat | grep "State changed"

# Only video ID issues
adb logcat | grep "video ID"
```

### Check Performance
```bash
# Monitor memory
adb shell dumpsys meminfo com.mavrixfy.app | grep -A 10 "App Summary"

# Monitor CPU
adb shell top | grep mavrixfy
```

## Verification Checklist

When YouTube Music playback works correctly:

- [x] Logs show `onReady` fires
- [x] Logs show `shouldAutoPlay: true`
- [x] Logs show state transitions
- [x] Final state is `"playing"`
- [x] Loading spinner disappears
- [x] Song plays with audio
- [x] Progress updates
- [x] Next/Previous works

## Advanced Debugging

### Enable React DevTools

```bash
# Install if not installed
npm install -g react-devtools

# Start devtools
react-devtools
```

**Check**:
1. PlayerContext state
2. `youtubeVideoId` value
3. `youtubePlaying` value
4. `youtubeShouldAutoPlayRef.current` value

### Check Native Module

```bash
# Android - Check YouTube player library
adb shell pm list packages | grep youtube

# Check WebView version
adb shell pm list packages | grep webview
```

### Network Debugging

```bash
# Use Charles Proxy or similar to monitor:
# - YouTube API calls
# - Video loading requests
# - Any blocked requests
```

## Expected Behavior

### Successful Playback Flow

```
User taps YouTube song
    ↓
[Playback] playSong called ✅
    ↓
[Playback] Routing to YouTube player ✅
    ↓
[YouTube] playYouTubeSong ✅
    ↓
    Set youtubeVideoId state
    Set youtubePlaying = true
    Set youtubeShouldAutoPlayRef = true
    ↓
YouTube player re-renders with new videoId
    ↓
[YouTube] onReady callback fired ✅
    ↓
    Delay 50ms for player initialization
    ↓
[YouTube] Starting playback now ✅
    ↓
[YouTube] State changed: buffering ✅
    ↓
    Loading spinner shows
    ↓
[YouTube] State changed: playing ✅
    ↓
    Loading spinner hides
    🎵 MUSIC PLAYS! ✅
```

## What Was Fixed

### 1. Enhanced Logging
- ✅ Added detailed logs to `onYoutubeReady`
- ✅ Added detailed logs to `onYoutubeStateChange`
- ✅ Added enhanced error logging
- ✅ Logs now include video ID and context

### 2. Better State Tracking
- ✅ Logs `shouldAutoPlay` at critical points
- ✅ Logs all state transitions
- ✅ Easier to identify where flow breaks

### 3. Debug-Friendly
- ✅ Clear log prefixes `[YouTube]`
- ✅ Structured log data
- ✅ Easy to grep and filter

## Next Steps

1. **Run the app** with logging enabled
2. **Tap a YouTube song** 
3. **Watch the logs** - follow the expected sequence
4. **Identify where it stops** - last log line shows the issue
5. **Check solutions** - match the issue to fixes above

## Support

If issues persist after following this guide:

1. Capture full log output
2. Note exact step where it fails
3. Include:
   - Device info
   - OS version
   - Network type
   - Video ID attempted
   - Complete log sequence

---

**Status**: ✅ Enhanced logging applied  
**Ready**: ✅ Debug and test  
**Documentation**: ✅ Comprehensive
