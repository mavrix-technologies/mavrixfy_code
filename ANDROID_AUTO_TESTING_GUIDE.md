# Android Auto Testing Guide for Android Studio

## Overview

This guide explains how to test your Android Auto integration using Android Studio and the Desktop Head Unit (DHU).

## Prerequisites

- Android Studio installed
- Android SDK installed
- Physical Android device (Android 6.0+) or emulator
- USB cable for physical device

## Method 1: Desktop Head Unit (DHU) - Recommended

The DHU simulates an Android Auto head unit on your computer.

### Step 1: Install Android Auto DHU

#### Option A: Using SDK Manager (Recommended)

1. Open Android Studio
2. Go to **Tools → SDK Manager**
3. Click on **SDK Tools** tab
4. Check **Google Play services**
5. Scroll down and check **Android Auto Desktop Head Unit**
6. Click **Apply** and wait for installation

#### Option B: Using Command Line

```bash
# Windows
%ANDROID_HOME%\tools\bin\sdkmanager.bat "extras;google;auto"

# Mac/Linux
$ANDROID_HOME/tools/bin/sdkmanager "extras;google;auto"
```

### Step 2: Enable Developer Mode on Your Phone

1. Install **Android Auto** app from Play Store on your phone
2. Open Android Auto app
3. Tap on the **version number** at the bottom **10 times**
4. A toast message will appear: "Developer mode enabled"
5. Tap the **three-dot menu** (⋮) in the top right
6. Select **Developer settings**
7. Enable **Unknown sources**
8. (Optional) Enable **Developer mode** toggle

### Step 3: Connect Your Phone

1. Connect your phone to your computer via USB
2. Enable **USB debugging** on your phone:
   - Go to **Settings → About phone**
   - Tap **Build number** 7 times to enable Developer options
   - Go to **Settings → Developer options**
   - Enable **USB debugging**
3. Accept the USB debugging prompt on your phone

### Step 4: Run the DHU

#### Option A: Using Android Studio Terminal

```bash
# Windows
%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe

# Mac
~/Library/Android/sdk/extras/google/auto/desktop-head-unit

# Linux
$ANDROID_HOME/extras/google/auto/desktop-head-unit
```

#### Option B: Direct Path

Navigate to:
- **Windows**: `C:\Users\[YourUsername]\AppData\Local\Android\Sdk\extras\google\auto\`
- **Mac**: `~/Library/Android/sdk/extras/google/auto/`
- **Linux**: `~/Android/Sdk/extras/google/auto/`

Double-click `desktop-head-unit.exe` (Windows) or run `./desktop-head-unit` (Mac/Linux)

### Step 5: Launch Your App

1. In Android Studio, click **Run** (▶️) or press **Shift + F10**
2. Select your connected device
3. Wait for the app to install and launch
4. The DHU window should show the Android Auto interface
5. Navigate to **Media** in the DHU
6. You should see **Mavrixfy** in the list

### Step 6: Test Features

#### Test Browsing
1. Click on **Mavrixfy** in the DHU
2. Browse through categories (Trending Now, Most Viral, etc.)
3. Select a playlist
4. Select a track to play

#### Test Playback
1. Play a track
2. Test **Play/Pause** button
3. Test **Skip Next/Previous** buttons
4. Test **Seek** by dragging the progress bar

#### Test Voice Commands
1. Click the **microphone** icon in DHU
2. Say: "Play [song name]"
3. Say: "Pause"
4. Say: "Skip"

#### Test Search
1. Click the **search** icon in DHU
2. Type a song or artist name
3. Select a result to play

## Method 2: Android Automotive OS Emulator

For testing on Android Automotive OS (built-in car systems).

### Step 1: Create Automotive Emulator

1. Open Android Studio
2. Go to **Tools → Device Manager**
3. Click **Create Device**
4. Select **Automotive** category
5. Choose a device (e.g., "Automotive (1024p landscape)")
6. Click **Next**
7. Select a system image (API 29+ recommended)
8. Click **Next** → **Finish**

### Step 2: Run on Automotive Emulator

1. Start the Automotive emulator
2. In Android Studio, click **Run** (▶️)
3. Select the Automotive emulator
4. Wait for installation
5. Open the **Media** app in the emulator
6. Select **Mavrixfy**

## Method 3: Real Car Testing

### Prerequisites
- Car with Android Auto support
- USB cable or Bluetooth connection

### Steps

1. **Build Release APK**:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

2. **Install on Phone**:
   - Transfer APK to phone
   - Install the APK
   - Or use `adb install`

3. **Connect to Car**:
   - Connect phone to car via USB or Bluetooth
   - Launch Android Auto on car display
   - Navigate to Media → Mavrixfy

4. **Test in Car**:
   - Browse categories
   - Play music
   - Test voice commands
   - Test steering wheel controls

## Debugging

### View Logs in Android Studio

1. Open **Logcat** (View → Tool Windows → Logcat)
2. Filter by tag: `MavrixfyAuto`
3. Watch for errors or warnings

### Common Log Filters

```
# Service lifecycle
tag:MavrixfyAuto

# Media session
tag:MediaSession

# ExoPlayer
tag:ExoPlayer

# All Android Auto
tag:AndroidAuto
```

### Using ADB Commands

```bash
# View logs
adb logcat | grep MavrixfyAuto

# Check if service is running
adb shell dumpsys activity services | grep MavrixfyAuto

# Force stop app
adb shell am force-stop com.mavrixfy.app

# Clear app data
adb shell pm clear com.mavrixfy.app

# Check media session
adb shell dumpsys media_session
```

## Troubleshooting

### DHU Not Detecting Phone

**Solution**:
1. Disconnect and reconnect USB
2. Restart ADB: `adb kill-server && adb start-server`
3. Check USB debugging is enabled
4. Try a different USB cable/port

### App Not Appearing in DHU

**Solution**:
1. Check manifest has `MediaBrowserService` intent filter
2. Verify `automotive_app_desc.xml` exists
3. Ensure service is exported: `android:exported="true"`
4. Check "Unknown sources" is enabled in Android Auto developer settings
5. Restart the app

### No Content Showing

**Solution**:
1. Check internet connection
2. Verify API endpoints are accessible
3. Check Logcat for API errors
4. Test API manually: `https://spotify-api-drab.vercel.app/api/jiosaavn/search/playlists?query=trending&limit=8`

### Voice Commands Not Working

**Solution**:
1. Ensure `onPlayFromSearch` is implemented
2. Check media items have proper metadata
3. Test with simple queries first: "Play music"
4. Check microphone permissions

### Playback Issues

**Solution**:
1. Check audio URLs are valid
2. Verify ExoPlayer is initialized
3. Check media session state
4. Look for ExoPlayer errors in Logcat

## Testing Checklist

### ✅ Basic Functionality
- [ ] App appears in Android Auto media list
- [ ] Categories load and display
- [ ] Playlists load and display
- [ ] Tracks load and display
- [ ] Album artwork displays correctly

### ✅ Playback
- [ ] Play button works
- [ ] Pause button works
- [ ] Skip next works
- [ ] Skip previous works
- [ ] Seek works
- [ ] Queue displays correctly
- [ ] Background playback works
- [ ] Notification shows correctly

### ✅ Voice Commands
- [ ] "Play [song name]" works
- [ ] "Play [artist name]" works
- [ ] "Pause" works
- [ ] "Skip" works
- [ ] Search results are relevant

### ✅ Search
- [ ] Search UI appears
- [ ] Search returns results
- [ ] Search results are playable
- [ ] Empty search handled gracefully

### ✅ Error Handling
- [ ] No internet: Shows empty state (no fake content)
- [ ] API timeout: Uses cached data
- [ ] Invalid track: Skips to next
- [ ] Empty playlist: Shows empty state

### ✅ Performance
- [ ] App launches < 10 seconds
- [ ] Content loads < 10 seconds
- [ ] Buttons respond < 2 seconds
- [ ] No lag or stuttering

### ✅ Policy Compliance
- [ ] No animations while driving
- [ ] No text ads
- [ ] Only album art displayed
- [ ] No autoplay on startup
- [ ] Proper contrast ratios

## Performance Testing

### Measure Launch Time

```kotlin
// Add to MavrixfyAutoService.onCreate()
val startTime = System.currentTimeMillis()
// ... initialization code ...
val endTime = System.currentTimeMillis()
Log.d("MavrixfyAuto", "Service launch time: ${endTime - startTime}ms")
```

### Measure Content Load Time

```kotlin
// Add to loadCategoryChildren()
val startTime = System.currentTimeMillis()
val playlists = catalogRepository.getCategoryPlaylists(categoryId)
val endTime = System.currentTimeMillis()
Log.d("MavrixfyAuto", "Content load time: ${endTime - startTime}ms")
```

### Monitor Memory Usage

```bash
# Check memory usage
adb shell dumpsys meminfo com.mavrixfy.app

# Monitor in real-time
adb shell top | grep com.mavrixfy.app
```

## Automated Testing

### Unit Tests

Create tests for the catalog repository:

```kotlin
// android/app/src/test/java/com/mavrixfy/app/auto/AutoCatalogRepositoryTest.kt
@Test
fun testGetCategoryPlaylists() {
    // Test implementation
}
```

### Integration Tests

Test the service lifecycle:

```kotlin
// android/app/src/androidTest/java/com/mavrixfy/app/auto/MavrixfyAutoServiceTest.kt
@Test
fun testServiceConnection() {
    // Test implementation
}
```

## Best Practices

1. **Always test on real device**: Emulators may not accurately simulate Android Auto
2. **Test with DHU first**: Faster iteration than real car testing
3. **Monitor logs**: Watch for errors and warnings
4. **Test offline**: Verify cached content works
5. **Test voice commands**: Essential for car safety
6. **Test different screen sizes**: DHU supports multiple resolutions
7. **Test dark mode**: Cars often use dark themes
8. **Test with poor network**: Simulate slow/unstable connections

## Resources

- [Android Auto Developer Guide](https://developer.android.com/training/cars/media)
- [Desktop Head Unit Documentation](https://developer.android.com/training/cars/testing)
- [Media Apps for Auto](https://developer.android.com/training/cars/media)
- [Car App Quality Guidelines](https://developer.android.com/docs/quality-guidelines/car-app-quality)

## Quick Reference Commands

```bash
# Install DHU
sdkmanager "extras;google;auto"

# Run DHU (Windows)
%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe

# Run DHU (Mac/Linux)
$ANDROID_HOME/extras/google/auto/desktop-head-unit

# View logs
adb logcat | grep MavrixfyAuto

# Restart ADB
adb kill-server && adb start-server

# Build debug APK
cd android && ./gradlew assembleDebug

# Install APK
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

**Need Help?**
- Check Logcat for errors
- Verify all prerequisites are met
- Ensure phone is in developer mode
- Try restarting DHU and phone
- Check the troubleshooting section above
