# 🚗 Run Android Automotive NOW - Copy & Paste Commands

## ⚡ Quick Setup (5 Commands)

Copy and paste these commands in Android Studio Terminal:

### 1️⃣ Check if Automotive System Image is Installed

```bash
sdkmanager --list | grep "system-images;android-33;google_apis;x86_64"
```

**If not installed, run**:
```bash
sdkmanager "system-images;android-33;google_apis;x86_64"
```

### 2️⃣ Create Automotive Emulator

```bash
avdmanager create avd -n Mavrixfy_Auto -k "system-images;android-33;google_apis;x86_64" -d "automotive_1024p_landscape"
```

**Expected output**: `AVD 'Mavrixfy_Auto' created.`

### 3️⃣ Start Emulator

```bash
emulator -avd Mavrixfy_Auto
```

**Wait for emulator to boot** (2-3 minutes first time)

### 4️⃣ Build and Install App

Open **NEW terminal** (keep emulator running) and run:

```bash
cd android
./gradlew installDebug
```

**Expected output**: `BUILD SUCCESSFUL`

### 5️⃣ Launch App

```bash
adb shell am start -n com.mavrixfy.app/.MainActivity
```

---

## 🎯 Open Media App in Emulator

### Method 1: Using ADB

```bash
# Open Media app
adb shell am start -a android.intent.action.MAIN -c android.intent.category.APP_MUSIC
```

### Method 2: Manual
1. Look at emulator screen
2. Click **Media** icon at bottom
3. Find **Mavrixfy** in the list
4. Click on it

---

## 📊 Verify Everything is Working

### Check Service is Running

```bash
adb shell dumpsys activity services | grep MavrixfyAuto
```

**Expected output**: Should show `MavrixfyAutoService`

### Check Logs

```bash
adb logcat | grep MavrixfyAuto
```

**Expected output**: Should show service lifecycle logs

### Check Media Session

```bash
adb shell dumpsys media_session | grep mavrixfy
```

**Expected output**: Should show media session info

---

## 🎨 What You'll See

### Step-by-Step Visual Guide

#### 1. Emulator Boots
```
┌─────────────────────────────────────┐
│                                     │
│         Android Automotive          │
│                                     │
│            [Loading...]             │
│                                     │
└─────────────────────────────────────┘
```

#### 2. Home Screen Appears
```
┌─────────────────────────────────────┐
│  🗺️ Maps    🎵 Media    📞 Phone   │
│                                     │
│         Welcome to Android          │
│            Automotive               │
│                                     │
│  Time: 2:30 PM    🔋 100%          │
└─────────────────────────────────────┘
```

#### 3. Click Media Icon
```
┌─────────────────────────────────────┐
│  Media Apps                         │
│                                     │
│  📱 Mavrixfy                        │
│  🎵 Spotify                         │
│  🎧 YouTube Music                   │
│  📻 Radio                           │
│                                     │
└─────────────────────────────────────┘
```

#### 4. Click Mavrixfy
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

#### 5. Click Category (e.g., Trending Now)
```
┌─────────────────────────────────────┐
│  ← Trending Now                     │
│                                     │
│  [Album Art] Top 50 - 2026          │
│              50 songs               │
│                                     │
│  [Album Art] Viral Hits             │
│              45 songs               │
│                                     │
│  [Album Art] Bollywood Hits         │
│              60 songs               │
│                                     │
└─────────────────────────────────────┘
```

#### 6. Click Playlist
```
┌─────────────────────────────────────┐
│  ← Top 50 - 2026                    │
│                                     │
│  1. Song Title 1                    │
│     Artist Name                     │
│                                     │
│  2. Song Title 2                    │
│     Artist Name                     │
│                                     │
│  3. Song Title 3                    │
│     Artist Name                     │
│                                     │
└─────────────────────────────────────┘
```

#### 7. Click Track to Play
```
┌─────────────────────────────────────┐
│                                     │
│      [Large Album Artwork]          │
│                                     │
│      Song Title                     │
│      Artist Name                    │
│                                     │
│  ──────●─────────                   │
│  1:23        3:45                   │
│                                     │
│    [⏮]  [⏸]  [⏭]                  │
│                                     │
└─────────────────────────────────────┘
```

---

## 🐛 Troubleshooting Commands

### Emulator Not Starting?

```bash
# List available emulators
emulator -list-avds

# If Mavrixfy_Auto not listed, create it again
avdmanager create avd -n Mavrixfy_Auto -k "system-images;android-33;google_apis;x86_64" -d "automotive_1024p_landscape"
```

### App Not Installing?

```bash
# Clean build
cd android
./gradlew clean

# Rebuild
./gradlew assembleDebug

# Install
./gradlew installDebug
```

### Mavrixfy Not Showing in Media?

```bash
# Check if app is installed
adb shell pm list packages | grep mavrixfy

# Expected output: package:com.mavrixfy.app

# If not installed, reinstall
cd android
./gradlew installDebug
```

### No Content Loading?

```bash
# Check internet in emulator
adb shell ping -c 3 google.com

# Check API accessibility
adb shell curl -I https://spotify-api-drab.vercel.app

# View error logs
adb logcat | grep -E "MavrixfyAuto|ERROR"
```

### Emulator is Slow?

```bash
# Stop emulator
adb emu kill

# Start with more RAM
emulator -avd Mavrixfy_Auto -memory 4096
```

---

## 📸 Take Screenshots

```bash
# Take screenshot of current screen
adb shell screencap /sdcard/mavrixfy_screen.png

# Pull to your computer
adb pull /sdcard/mavrixfy_screen.png ./mavrixfy_screenshot.png

# Open the screenshot
start mavrixfy_screenshot.png  # Windows
open mavrixfy_screenshot.png   # Mac
xdg-open mavrixfy_screenshot.png  # Linux
```

---

## 🎬 Record Video

```bash
# Start recording (max 3 minutes)
adb shell screenrecord /sdcard/mavrixfy_demo.mp4

# Do your testing...

# Stop recording (Ctrl+C)

# Pull video
adb pull /sdcard/mavrixfy_demo.mp4 ./mavrixfy_demo.mp4

# Play video
start mavrixfy_demo.mp4  # Windows
open mavrixfy_demo.mp4   # Mac
xdg-open mavrixfy_demo.mp4  # Linux
```

---

## 🔄 Restart Everything

If something goes wrong, restart everything:

```bash
# 1. Stop emulator
adb emu kill

# 2. Kill ADB server
adb kill-server

# 3. Start ADB server
adb start-server

# 4. Start emulator
emulator -avd Mavrixfy_Auto

# 5. Wait for boot, then reinstall
cd android
./gradlew installDebug

# 6. Launch app
adb shell am start -n com.mavrixfy.app/.MainActivity
```

---

## ✅ Success Indicators

You'll know it's working when you see:

### In Terminal:
```
✓ BUILD SUCCESSFUL in 30s
✓ Installing APK 'app-debug.apk'
✓ Installed on 1 device
```

### In Logcat:
```
MavrixfyAuto: Service onCreate
MavrixfyAuto: MediaSession created
MavrixfyAuto: Loading categories
MavrixfyAuto: Loaded 5 categories
```

### In Emulator:
```
✓ Media app opens
✓ Mavrixfy appears in list
✓ Categories load (5 items)
✓ Playlists load (real data)
✓ Tracks load (real songs)
✓ Playback works (audio plays)
```

---

## 🎯 Test Checklist

Run these tests in order:

```bash
# 1. Check app is installed
adb shell pm list packages | grep mavrixfy

# 2. Check service is registered
adb shell dumpsys activity services | grep MavrixfyAuto

# 3. Launch app
adb shell am start -n com.mavrixfy.app/.MainActivity

# 4. Open Media app
adb shell am start -a android.intent.action.MAIN -c android.intent.category.APP_MUSIC

# 5. Watch logs
adb logcat | grep MavrixfyAuto
```

### Manual Tests in Emulator:
- [ ] Click Media icon
- [ ] See Mavrixfy in list
- [ ] Click Mavrixfy
- [ ] See 5 categories
- [ ] Click "Trending Now"
- [ ] See playlists (real data, not samples)
- [ ] Click a playlist
- [ ] See tracks
- [ ] Click a track
- [ ] Music plays
- [ ] Play/Pause works
- [ ] Skip works

---

## 📞 Still Having Issues?

### Get Full Diagnostic Info

```bash
# Create diagnostic report
echo "=== Device Info ===" > diagnostic.txt
adb shell getprop ro.build.version.release >> diagnostic.txt
echo "" >> diagnostic.txt

echo "=== Installed Packages ===" >> diagnostic.txt
adb shell pm list packages | grep mavrixfy >> diagnostic.txt
echo "" >> diagnostic.txt

echo "=== Service Status ===" >> diagnostic.txt
adb shell dumpsys activity services | grep MavrixfyAuto >> diagnostic.txt
echo "" >> diagnostic.txt

echo "=== Recent Logs ===" >> diagnostic.txt
adb logcat -d | grep MavrixfyAuto | tail -50 >> diagnostic.txt

# View the report
cat diagnostic.txt
```

---

## 🚀 Quick Reference

| Command | Purpose |
|---------|---------|
| `emulator -avd Mavrixfy_Auto` | Start emulator |
| `./gradlew installDebug` | Install app |
| `adb logcat \| grep MavrixfyAuto` | View logs |
| `adb shell screencap /sdcard/screen.png` | Screenshot |
| `adb emu kill` | Stop emulator |

---

**Total Time**: 10-15 minutes  
**Difficulty**: Easy (just copy & paste)  
**Result**: See your Android Auto interface running!
