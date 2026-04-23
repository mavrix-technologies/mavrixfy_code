# Quick Start: Testing Android Auto in 5 Minutes

## 🚀 Fastest Way to Test

### Step 1: Install Desktop Head Unit (1 minute)

Open Android Studio Terminal and run:

```bash
# Windows
%ANDROID_HOME%\tools\bin\sdkmanager.bat "extras;google;auto"

# Mac/Linux
$ANDROID_HOME/tools/bin/sdkmanager "extras;google;auto"
```

### Step 2: Enable Developer Mode on Phone (1 minute)

1. Install **Android Auto** app from Play Store
2. Open Android Auto
3. Tap version number **10 times** at the bottom
4. Tap menu (⋮) → **Developer settings**
5. Enable **Unknown sources**

### Step 3: Connect Phone (30 seconds)

1. Connect phone to computer via USB
2. Enable **USB debugging** on phone:
   - Settings → About phone → Tap Build number 7 times
   - Settings → Developer options → Enable USB debugging

### Step 4: Run DHU (30 seconds)

In Android Studio Terminal:

```bash
# Windows
%ANDROID_HOME%\extras\google\auto\desktop-head-unit.exe

# Mac
~/Library/Android/sdk/extras/google/auto/desktop-head-unit

# Linux
$ANDROID_HOME/extras/google/auto/desktop-head-unit
```

### Step 5: Launch App (1 minute)

1. In Android Studio, click **Run** (▶️)
2. Select your connected device
3. Wait for app to launch
4. DHU window will show Android Auto interface
5. Click **Media** → **Mavrixfy**

## ✅ You're Done!

You should now see:
- Categories: Trending Now, Most Viral, New Arrivals, etc.
- Playlists when you click a category
- Tracks when you click a playlist
- Playback controls when playing

## 🎯 Quick Tests

### Test Browsing
```
DHU → Media → Mavrixfy → Trending Now → Select Playlist → Select Track
```

### Test Voice
```
Click microphone icon → Say "Play trending songs"
```

### Test Search
```
Click search icon → Type "hindi songs" → Select result
```

## 🐛 Not Working?

### App not showing in DHU?
```bash
# Restart ADB
adb kill-server && adb start-server

# Restart DHU and try again
```

### No content loading?
```bash
# Check logs
adb logcat | grep MavrixfyAuto

# Check internet connection on phone
```

### DHU not detecting phone?
- Try different USB cable
- Disable and re-enable USB debugging
- Restart phone

## 📱 Alternative: Test on Emulator

1. Tools → Device Manager → Create Device
2. Select **Automotive** category
3. Choose "Automotive (1024p landscape)"
4. Select API 29+ system image
5. Run app on emulator
6. Open Media app → Mavrixfy

## 📊 Check Logs

```bash
# View all logs
adb logcat | grep MavrixfyAuto

# Check service status
adb shell dumpsys activity services | grep MavrixfyAuto

# Check media session
adb shell dumpsys media_session
```

## 🎬 What to Expect

### First Launch
- DHU shows Android Auto home screen
- Media icon visible in bottom bar
- Mavrixfy appears in media apps list

### Browsing
- 5 categories load (Trending, Viral, New, Most Played, Dhurandhar)
- Each category shows real playlists from JioSaavn
- Each playlist shows real tracks
- Album artwork displays

### Playback
- Track plays with audio
- Notification shows on phone
- Playback controls work (play, pause, skip)
- Queue shows all tracks

### Voice
- "Play [song name]" searches and plays
- "Pause" pauses playback
- "Skip" skips to next track

## 📝 Testing Checklist

Quick checklist for 5-minute test:

- [ ] App appears in DHU media list
- [ ] Categories load
- [ ] Playlists load
- [ ] Tracks load
- [ ] Play button works
- [ ] Pause button works
- [ ] Skip works
- [ ] Voice search works

## 🔗 Full Documentation

For detailed testing guide, see: **ANDROID_AUTO_TESTING_GUIDE.md**

---

**Total Time**: ~5 minutes  
**Difficulty**: Easy  
**Requirements**: Android Studio, Phone with USB debugging
