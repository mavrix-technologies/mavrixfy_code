# Setup Android Automotive Emulator - Step by Step

## 🎯 Goal
Run Mavrixfy on Android Automotive OS emulator to see the Android Auto interface directly in Android Studio.

## 📋 Prerequisites
- Android Studio installed
- At least 8GB RAM available
- 10GB free disk space

---

## Step 1: Open Device Manager

1. Open **Android Studio**
2. Click **Tools** in the top menu
3. Select **Device Manager** (or press **Ctrl+Shift+A** and type "Device Manager")

**Alternative**: Look for the phone icon in the top-right toolbar

---

## Step 2: Create New Virtual Device

1. In Device Manager window, click **Create Device** button (+ icon)
2. You'll see "Select Hardware" screen

---

## Step 3: Select Automotive Hardware

1. In the left sidebar, click **Automotive** category
2. Select **Automotive (1024p landscape)** from the list
   - Screen: 1024 x 768
   - Density: mdpi
3. Click **Next** button

**Note**: You can also choose other automotive profiles like:
- Automotive (1080p landscape) - for higher resolution
- Polestar 2 - for specific car model

---

## Step 4: Select System Image

1. You'll see "System Image" screen
2. Click on **Recommended** tab
3. Look for **API Level 33** (Android 13.0) or higher with **Automotive** tag
4. If not downloaded, click **Download** next to the system image
   - Wait for download to complete (may take 5-10 minutes)
5. Select the downloaded system image
6. Click **Next**

**Recommended System Images**:
- ✅ API 33 (Android 13.0) - Automotive
- ✅ API 34 (Android 14.0) - Automotive
- ✅ API 35 (Android 15.0) - Automotive

---

## Step 5: Configure AVD

1. You'll see "Android Virtual Device (AVD)" configuration screen
2. **AVD Name**: Keep default or rename to "Mavrixfy_Automotive"
3. **Startup orientation**: Landscape (should be default)
4. **Graphics**: Automatic (recommended)
5. Click **Show Advanced Settings** (optional)
   - **RAM**: 2048 MB minimum (4096 MB recommended)
   - **Internal Storage**: 2048 MB minimum
6. Click **Finish**

---

## Step 6: Start the Emulator

1. In Device Manager, find your newly created automotive emulator
2. Click the **Play** button (▶️) next to it
3. Wait for emulator to boot (first boot may take 2-3 minutes)
4. You'll see the Android Automotive OS home screen

**What you'll see**:
- Car-style interface
- Large icons optimized for touch
- Media, Navigation, Phone apps at bottom
- Different from regular Android phone interface

---

## Step 7: Build and Run Your App

### Option A: Using Run Button

1. Make sure emulator is running
2. In Android Studio, click **Run** button (▶️) or press **Shift + F10**
3. Select your **Automotive emulator** from the device list
4. Wait for app to build and install
5. App will launch automatically

### Option B: Using Gradle

```bash
# In Android Studio Terminal
cd android
./gradlew installDebug
```

Then manually launch the app on the emulator.

---

## Step 8: Open Media App

1. On the emulator home screen, look for **Media** app icon
2. Click on **Media** app
3. You should see **Mavrixfy** in the list of media apps
4. Click on **Mavrixfy**

**If Mavrixfy doesn't appear**:
- Swipe down from top to open notifications
- Look for "Mavrixfy" notification
- Or open app drawer and find Mavrixfy

---

## Step 9: Test Your Interface

### Browse Categories
1. You should see 5 categories:
   - Trending Now
   - Most Viral
   - New Arrivals
   - Most Played
   - Top Dhurandhar

2. Click on any category (e.g., "Trending Now")
3. You'll see real playlists from JioSaavn
4. Click on a playlist
5. You'll see tracks in that playlist

### Test Playback
1. Click on a track to play
2. You'll see playback controls:
   - Play/Pause button
   - Skip Previous button
   - Skip Next button
   - Progress bar
   - Album artwork
   - Track title and artist

### Test Search
1. Look for search icon (magnifying glass)
2. Click it
3. Type a song name (e.g., "hindi songs")
4. Results will appear
5. Click a result to play

---

## 🎨 What Your Interface Should Look Like

### Home Screen
```
┌─────────────────────────────────────┐
│  Android Automotive OS              │
│                                     │
│  [Maps]  [Media]  [Phone]  [Apps]  │
│                                     │
│  Time: 2:30 PM                      │
└─────────────────────────────────────┘
```

### Media App List
```
┌─────────────────────────────────────┐
│  Media                              │
│                                     │
│  📱 Mavrixfy                        │
│  🎵 Spotify                         │
│  🎧 YouTube Music                   │
│                                     │
└─────────────────────────────────────┘
```

### Mavrixfy Categories
```
┌─────────────────────────────────────┐
│  ← Mavrixfy                         │
│                                     │
│  🔥 Trending Now                    │
│     Fresh playlists for the road    │
│                                     │
│  ⚡ Most Viral                      │
│     Viral hits and reels songs      │
│                                     │
│  🆕 New Arrivals                    │
│     Latest music releases           │
│                                     │
│  ⭐ Most Played                     │
│     Popular playlists               │
│                                     │
│  🎵 Top Dhurandhar                  │
│     Hindi superhits                 │
└─────────────────────────────────────┘
```

### Playlist View
```
┌─────────────────────────────────────┐
│  ← Trending Now                     │
│                                     │
│  🎵 Top 50 - 2026                   │
│     50 songs                        │
│                                     │
│  🎵 Viral Hits                      │
│     45 songs                        │
│                                     │
│  🎵 Bollywood Chartbusters          │
│     60 songs                        │
│                                     │
└─────────────────────────────────────┘
```

### Now Playing
```
┌─────────────────────────────────────┐
│  [Album Art]                        │
│                                     │
│  Song Title                         │
│  Artist Name                        │
│                                     │
│  ──────●─────────                   │
│  1:23        3:45                   │
│                                     │
│  [⏮] [⏸] [⏭]                       │
└─────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Emulator Won't Start

**Error**: "Emulator: Process finished with exit code 1"

**Solution**:
1. Open **Tools → SDK Manager**
2. Go to **SDK Tools** tab
3. Check **Intel x86 Emulator Accelerator (HAXM)** or **Android Emulator Hypervisor Driver**
4. Click **Apply** and install
5. Restart Android Studio
6. Try starting emulator again

### App Not Installing

**Error**: "Installation failed"

**Solution**:
```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew assembleDebug

# Or in Android Studio: Build → Clean Project → Rebuild Project
```

### Mavrixfy Not Appearing in Media App

**Solution 1**: Check manifest
```bash
# Verify service is registered
cat android/app/src/main/AndroidManifest.xml | grep MavrixfyAutoService
```

**Solution 2**: Reinstall app
```bash
# Uninstall first
adb uninstall com.mavrixfy.app

# Then run from Android Studio again
```

**Solution 3**: Check logs
```bash
# View logs
adb logcat | grep MavrixfyAuto
```

### No Content Loading

**Solution**: Check internet connection
1. Emulator needs internet access
2. Check if emulator has network connectivity
3. Try opening browser in emulator
4. If no internet, restart emulator

### Emulator is Slow

**Solution**: Increase resources
1. **Tools → Device Manager**
2. Click **Edit** (pencil icon) on your automotive device
3. Click **Show Advanced Settings**
4. Increase **RAM** to 4096 MB
5. Enable **Hardware - GLES 2.0**
6. Click **Finish**
7. Restart emulator

---

## 📊 Verify Installation

### Check Service is Running

```bash
# Check if service is registered
adb shell dumpsys activity services | grep MavrixfyAuto

# Expected output:
# ServiceRecord{...com.mavrixfy.app/.auto.MavrixfyAutoService}
```

### Check Media Session

```bash
# Check media session
adb shell dumpsys media_session

# Look for: com.mavrixfy.app
```

### View Logs

```bash
# View all Mavrixfy Auto logs
adb logcat | grep MavrixfyAuto

# View service creation
adb logcat | grep "MavrixfyAuto.*onCreate"

# View content loading
adb logcat | grep "MavrixfyAuto.*playlists"
```

---

## 🎬 Video Walkthrough Commands

If you want to record your testing:

```bash
# Start screen recording
adb shell screenrecord /sdcard/mavrixfy_auto_test.mp4

# Stop recording (Ctrl+C after testing)

# Pull video to computer
adb pull /sdcard/mavrixfy_auto_test.mp4 .
```

---

## 📸 Take Screenshots

```bash
# Take screenshot
adb shell screencap /sdcard/screenshot.png

# Pull to computer
adb pull /sdcard/screenshot.png .
```

---

## ⚡ Quick Commands Reference

```bash
# Start emulator from command line
emulator -avd Mavrixfy_Automotive

# List all emulators
emulator -list-avds

# Install app
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Uninstall app
adb uninstall com.mavrixfy.app

# View logs
adb logcat | grep MavrixfyAuto

# Clear app data
adb shell pm clear com.mavrixfy.app

# Force stop app
adb shell am force-stop com.mavrixfy.app

# Check service status
adb shell dumpsys activity services | grep MavrixfyAuto
```

---

## ✅ Success Checklist

After setup, verify:

- [ ] Emulator starts successfully
- [ ] App installs without errors
- [ ] Mavrixfy appears in Media app
- [ ] Categories load (5 categories visible)
- [ ] Playlists load when clicking category
- [ ] Tracks load when clicking playlist
- [ ] Playback works (audio plays)
- [ ] Play/Pause button works
- [ ] Skip buttons work
- [ ] Album artwork displays
- [ ] No demo/sample content (all real data)

---

## 🎯 Next Steps

Once emulator is working:

1. **Test all features** using the checklist above
2. **Check logs** for any errors
3. **Test voice commands** (if emulator supports)
4. **Test search functionality**
5. **Verify real data** is loading (no sample tracks)

---

## 📞 Need Help?

If you encounter issues:

1. Check **Logcat** for errors
2. Verify **internet connection** in emulator
3. Ensure **service is registered** in manifest
4. Try **clean and rebuild** project
5. **Restart emulator** and try again

---

**Estimated Setup Time**: 15-20 minutes (including downloads)  
**Difficulty**: Medium  
**Requirements**: Android Studio, 8GB RAM, 10GB disk space
