# Android Auto Media Control Fix - v2

## Problem
Android Auto media controls not showing after music starts playing.

## Root Cause Analysis

After reviewing logs, the issue is:

1. ✅ **Android Auto IS discovering the app** - Icon loads correctly
2. ✅ **Android Auto IS connecting to MediaBrowserService** - `onGetRoot` is called
3. ❌ **MediaSession token is NOT being provided** - Due to SecurityException when trying to access MediaSessionManager
4. ❌ **Token retrieval was failing** - The previous approach using `MediaSessionManager.getActiveSessions()` requires notification listener permission

### Key Log Evidence:
```
08-16 14:58:26.409 onGetRoot called by package: com.google.android.projection.gearhead
08-16 14:58:29.614 SecurityException: Missing permission to control media
08-16 14:58:30.116 Max retry attempts reached, session token not found
```

## Solution Implemented - Direct Reflection Access

Instead of using MediaSessionManager (which requires special permissions), we now:

1. **Bind to RNTP's MusicService** directly
2. **Use reflection** to access the internal `QueuedAudioPlayer.mediaSession` field
3. **Extract the MediaSessionCompat.Token** directly from the player
4. **Forward it to Android Auto** via `setSessionToken()`

### Implementation Details

**File**: `android/app/src/main/java/com/mavrixfy/app/MavrixfyMediaBrowserService.kt`

```kotlin
private fun tryExtractTokenFromMusicService() {
    // Get MusicService instance from binder
    val binderClass = musicServiceBinder.javaClass
    val thisField = binderClass.getDeclaredField("this\$0")
    thisField.isAccessible = true
    val musicService = thisField.get(musicServiceBinder)
    
    // Get the `player` field from MusicService
    val playerField = musicService.javaClass.getDeclaredField("player")
    playerField.isAccessible = true
    val player = playerField.get(musicService)
    
    // Get the `mediaSession` field from QueuedAudioPlayer
    val mediaSessionField = player.javaClass.superclass?.getDeclaredField("mediaSession")
    mediaSessionField.isAccessible = true
    val mediaSession = mediaSessionField.get(player) as? MediaSessionCompat
    
    // Apply the token
    applySessionToken(mediaSession.sessionToken)
}
```

### Why This Works

- ✅ **No special permissions required** - We own both services
- ✅ **Direct access** - Gets the exact MediaSession RNTP creates
- ✅ **Retry mechanism** - Handles timing when player isn't initialized yet (up to 15 attempts)
- ✅ **Android Auto compliant** - Provides valid session token when `onGetRoot` is called

## Testing Steps

### 1. Clean Build and Install
   ```bash
   npx expo run:android
   ```

2. **Enable Android Auto Developer Mode**:
   - Install "Android Auto" app from Play Store
   - Tap version number 10 times to enable developer mode
   - Go to Developer settings
   - Enable "Unknown sources"

3. **Test with Desktop Head Unit (DHU)**:
   ```bash
   # Start DHU
   ./start-dhu-simple.bat
   
   # Or manually:
   "%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
   ```

4. **Connect and Test**:
   - Connect phone via USB
   - Start Android Auto (DHU or physical head unit)
   - Play music in Mavrixfy app
   - Check that media controls appear in Android Auto
   - Verify controls work: play, pause, next, previous

5. **Check Logs**:
   ```bash
   adb logcat | findstr "MavrixfyMediaBrowser\|TrackPlayer\|MediaSession"
   ```

## Expected Behavior After Fix

1. ✅ App appears in Android Auto media apps list
2. ✅ Media controls show immediately when playback starts
3. ✅ Album art displays correctly
4. ✅ Track metadata (title, artist) shows properly
5. ✅ Play/Pause toggle works
6. ✅ Next/Previous buttons work
7. ✅ Controls remain visible during playback

## Debugging

If media controls still don't appear:

1. **Check MediaSession is created**:
   ```bash
   adb logcat | findstr "MediaSession"
   ```
   Look for: "MediaSession found with state: X, actions: Y"

2. **Verify MediaBrowserService connects**:
   ```bash
   adb logcat | findstr "onGetRoot\|onLoadChildren"
   ```
   Should see: "onGetRoot called by package: com.google.android.projection.gearhead"

3. **Check session token is set**:
   ```bash
   adb logcat | findstr "token successfully applied"
   ```

4. **Verify playback state**:
   The MediaSession must have:
   - State: STATE_PLAYING (when playing) or STATE_PAUSED (when paused)
   - Actions: Must include ACTION_PLAY, ACTION_PAUSE, ACTION_SKIP_TO_NEXT, ACTION_SKIP_TO_PREVIOUS

## References

- [Android Auto Media Apps Overview](https://developer.android.com/training/cars/media)
- [Enable Playback Control](https://developer.android.com/training/cars/media/enable-playback)
- [Using a Media Session](https://developer.android.com/media/legacy/mediasession)
- [React Native Track Player Documentation](https://rntp.dev/)
- [KotlinAudio Library](https://github.com/doublesymmetry/KotlinAudio)

## Implementation Notes

### Why This Approach Works

1. **Leverages RNTP's MediaSession**: Instead of creating a duplicate session, we discover and reuse the one RNTP creates
2. **Proper Timing Handling**: Retry mechanism ensures we find the session even if MusicService starts late
3. **Android Auto Compliance**: Follows official Android documentation requirements
4. **Zero Playback Logic Duplication**: All playback control remains in RNTP's MusicService

### Architecture

```
Android Auto
     │
     └──> MavrixfyMediaBrowserService (provides session token)
              │
              └──> MediaSession Token
                        │
                        └──> React Native Track Player's MusicService
                                  └──> KotlinAudio
                                        └──> MediaSession (actual playback control)
```

The MediaBrowserService acts as a bridge, allowing Android Auto to discover and control the MediaSession that RNTP manages internally.
