# 🔧 iOS IPA Build - Songs Not Playing Fix

## Problem

✅ **Expo Dev Mode**: Songs play perfectly  
❌ **Built IPA**: Songs don't play on iOS devices

This is a **common iOS build configuration issue** related to:
1. Audio session permissions
2. Network security policies  
3. Background audio configuration
4. Audio URL protocol restrictions

---

## Root Causes Analysis

### 1. **Audio URLs from JioSaavn API**
Your audio URLs come from JioSaavn API (`downloadUrl`/`audioUrl` fields). These URLs might be:
- HTTP instead of HTTPS (iOS blocks HTTP by default)
- Expired streaming tokens
- Require specific headers iOS doesn't send
- Blocked by iOS network security policies

### 2. **iOS Build Optimizations**
Your `eas.json` has aggressive optimizations:
```json
"SWIFT_OPTIMIZATION_LEVEL": "-O",
"GCC_OPTIMIZATION_LEVEL": "s",
"DEAD_CODE_STRIPPING": "YES",
"STRIP_INSTALLED_PRODUCT": "YES"
```
These might be stripping necessary audio playback code.

### 3. **react-native-track-player Configuration**
The audio player needs proper iOS permissions and background modes.

---

## 🔧 Solutions (Apply ALL of These)

### Solution 1: Add Explicit ATS Exception for Audio Domains

Update your `app.json` iOS configuration:

```json
"ios": {
  "infoPlist": {
    "UIBackgroundModes": ["audio"],
    "NSCameraUsageDescription": "This app uses the camera to upload profile pictures.",
    "NSPhotoLibraryUsageDescription": "This app needs access to your photo library to upload images.",
    "NSAppleMusicUsageDescription": "This app streams music content.",
    "NSUserTrackingUsageDescription": "This identifier will be used to deliver personalized ads to you.",
    "ITSAppUsesNonExemptEncryption": false,
    "NSAppTransportSecurity": {
      "NSAllowsArbitraryLoads": true,
      "NSAllowsArbitraryLoadsInWebContent": true,
      "NSExceptionDomains": {
        "jiosaavn.com": {
          "NSExceptionAllowsInsecureHTTPLoads": true,
          "NSIncludesSubdomains": true,
          "NSExceptionRequiresForwardSecrecy": false
        },
        "savacdn.com": {
          "NSExceptionAllowsInsecureHTTPLoads": true,
          "NSIncludesSubdomains": true,
          "NSExceptionRequiresForwardSecrecy": false
        },
        "saavncdn.com": {
          "NSExceptionAllowsInsecureHTTPLoads": true,
          "NSIncludesSubdomains": true,
          "NSExceptionRequiresForwardSecrecy": false
        },
        "akamaihd.net": {
          "NSExceptionAllowsInsecureHTTPLoads": true,
          "NSIncludesSubdomains": true,
          "NSExceptionRequiresForwardSecrecy": false
        }
      }
    }
  }
}
```

**Why**: JioSaavn audio streaming URLs might use HTTP or mixed content. This explicitly allows those domains.

---

### Solution 2: Reduce Build Optimizations (Temporarily)

In your `eas.json`, under `ios-ipa` or `ios-unsigned` profile, modify:

```json
"ios": {
  "buildConfiguration": "Release",
  "simulator": false,
  "resourceClass": "m-medium"
}
```

And in `app.json`, update `expo-build-properties`:

```json
["expo-build-properties", {
  "ios": {
    "deploymentTarget": "15.1",
    "useFrameworks": "static",
    "extraBuildProperties": {
      "GCC_WARN_INHIBIT_ALL_WARNINGS": "YES",
      "CLANG_WARN_DOCUMENTATION_COMMENTS": "NO",
      "CLANG_WARN_STRICT_PROTOTYPES": "NO",
      "SWIFT_SUPPRESS_WARNINGS": "YES",
      "SWIFT_COMPILATION_MODE": "wholemodule",
      "SWIFT_OPTIMIZATION_LEVEL": "-Onone",  // ← Changed from "-O"
      "GCC_OPTIMIZATION_LEVEL": "0",         // ← Changed from "s"
      "DEAD_CODE_STRIPPING": "NO",           // ← Changed from "YES"
      "STRIP_INSTALLED_PRODUCT": "NO",       // ← Changed from "YES"
      "ENABLE_BITCODE": "NO"
    }
  }
}]
```

**Why**: Aggressive optimizations might strip audio playback code. Test with debug-like settings first.

---

### Solution 3: Verify react-native-track-player Plugin

Check your `plugins/withTrackPlayer` configuration. It should properly configure audio capabilities:

If the plugin doesn't exist or is incomplete, the iOS build might not have proper audio session setup.

---

### Solution 4: Add Audio Session Logging

To debug what's happening, add logging to track player initialization.

Check if you have a playback engine setup file (like `lib/playbackEngine.ts`). Add console logs:

```typescript
// In playback initialization
console.log('[Playback] Initializing audio session...');
console.log('[Playback] Audio URL:', audioUrl);
console.log('[Playback] Is HTTPS:', audioUrl?.startsWith('https://'));
```

---

### Solution 5: Ensure Audio URLs are HTTPS

Check your backend API response. Modify the song API helper to force HTTPS:

In `e:\Mavrixfy\mavrixfy-song-api\mavrixfy-song-api\src\modules\songs\helpers`:

```typescript
// Add this helper function
function ensureHttps(url: string): string {
  if (!url) return url;
  // Force upgrade HTTP to HTTPS for iOS
  return url.replace(/^http:\/\//i, 'https://');
}

// Use it when creating song payload
export function createSongPayload(song: SongAPIResponseModel) {
  // ... existing code
  const audioUrl = getBestAudioUrl(song.downloadUrl);
  
  return {
    // ... existing fields
    audioUrl: ensureHttps(audioUrl),  // ← Force HTTPS
    // ... rest of fields
  };
}
```

---

## 📝 Step-by-Step Fix Process

### Step 1: Update app.json
```bash
# Edit app.json and add the NSExceptionDomains configuration above
```

### Step 2: Temporarily Disable Optimizations
```bash
# Edit app.json expo-build-properties as shown above
```

### Step 3: Rebuild the IPA
```bash
# Run your GitHub Actions workflow
# Or locally:
npx expo prebuild --platform ios --clean
# Then build
```

### Step 4: Test on Device
1. Install the new IPA
2. Try playing a song
3. If still not working, check device console logs

### Step 5: Check Device Logs (if still failing)

**On macOS:**
```bash
# Connect iPhone via USB
# Open Console.app
# Filter by "Mavrixfy" or "AVPlayer"
# Look for errors like:
# - "NSURLErrorDomain"
# - "App Transport Security"
# - "HTTP load failed"
```

---

## 🐛 Debugging Checklist

If songs still don't play after applying fixes:

### Check 1: Verify Audio URL Format
```typescript
// Add to your playback code
console.log('Audio URL:', song.audioUrl);
console.log('Is valid URL:', /^https?:\/\/.+/.test(song.audioUrl));
console.log('URL protocol:', new URL(song.audioUrl).protocol);
```

### Check 2: Test with Known Working URL
```typescript
// Temporarily hardcode a test URL
const testUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
// Try playing this - if it works, issue is with JioSaavn URLs
```

### Check 3: Verify Network Permissions
```json
// In app.json, ensure:
"ios": {
  "infoPlist": {
    "NSAppTransportSecurity": {
      "NSAllowsArbitraryLoads": true  // Must be true
    }
  }
}
```

### Check 4: Test Audio Session
```typescript
// In your playback engine
import { Audio } from 'expo-av';

await Audio.setAudioModeAsync({
  allowsRecordingIOS: false,
  staysActiveInBackground: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
});
```

---

## 🎯 Most Likely Causes (In Order)

1. **HTTP URLs being blocked** (80% probability)
   - Solution: Force HTTPS in backend or app
   
2. **Missing ATS exceptions for audio CDNs** (60% probability)
   - Solution: Add NSExceptionDomains

3. **Expired streaming tokens** (40% probability)
   - Solution: Fetch fresh URLs before playback

4. **Audio session not configured** (30% probability)
   - Solution: Verify track player plugin

5. **Build optimizations stripping code** (20% probability)
   - Solution: Disable optimizations temporarily

---

## ✅ Quick Test

After applying fixes, test with this simple check:

```typescript
// Add this to your player component
useEffect(() => {
  console.log('=== PLAYBACK DEBUG ===');
  console.log('Current song:', currentSong?.title);
  console.log('Audio URL:', currentSong?.audioUrl);
  console.log('URL starts with HTTPS:', currentSong?.audioUrl?.startsWith('https://'));
  console.log('URL length:', currentSong?.audioUrl?.length);
  console.log('=====================');
}, [currentSong]);
```

Build IPA → Install → Check logs → Verify URL format

---

## 🚀 Expected Results

After applying all fixes:

- ✅ Audio URLs are HTTPS
- ✅ iOS allows network requests to audio domains
- ✅ Background audio works
- ✅ Songs play immediately
- ✅ No "Network request failed" errors

---

## 📊 Build Configuration Comparison

| Setting | Development (Working) | Production (Broken) | Fixed |
|---------|----------------------|---------------------|-------|
| **ATS** | Lenient | Lenient | Lenient + Exceptions |
| **Optimizations** | Debug (-O0) | Aggressive (-O, strip) | Debug (-Onone) |
| **Audio URLs** | May be HTTP | HTTP blocked | Force HTTPS |
| **Background Audio** | Configured | Might be stripped | Explicitly kept |

---

## 🔄 After Fixing

1. **Rebuild IPA** with updated configuration
2. **Test on real device** - songs should play
3. **Re-enable optimizations gradually** once working:
   - Start with `-Onone` (working)
   - Try `-O` (test)
   - Add stripping back (test each change)

---

## 📝 Summary

**Root Cause:**  
iOS production builds have stricter security policies than dev mode. Audio URLs from JioSaavn might be HTTP or require special ATS exceptions.

**Primary Fix:**  
Add NSExceptionDomains for audio CDNs + ensure HTTPS URLs

**Secondary Fix:**  
Reduce build optimizations to prevent code stripping

**Verification:**  
Test IPA on device → Check console logs → Verify audio playback

---

**Status:** 🔧 NEEDS IMPLEMENTATION  
**Priority:** 🔴 HIGH  
**Next Step:** Update app.json with NSExceptionDomains
