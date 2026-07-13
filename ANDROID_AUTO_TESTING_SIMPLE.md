# Android Auto - Simple Testing Guide

You have **3 ways** to test Android Auto support:

## ✅ Option 1: Test Without DHU (Easiest - On Phone Only)

**No DHU needed! Test directly on your phone:**

### Step 1: Install Android Auto on Phone
```
Install from Play Store:
https://play.google.com/store/apps/details?id=com.google.android.projection.gearhead
```

### Step 2: Enable Developer Mode
1. Open Android Auto app on phone
2. Go to: Settings → About
3. Tap **version number 10 times** (Developer mode unlocked!)
4. Go back to Settings → Developer settings
5. Enable:
   - ✅ **Unknown sources** (allows non-Play Store apps)
   - ✅ **Developer mode**

### Step 3: Build and Install Your App
```bash
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

### Step 4: Test on Phone
1. Open **Mavrixfy** app on phone
2. Play a song (must be actively playing!)
3. Open **Android Auto** app on phone
4. Tap the media/music icon
5. **Mavrixfy should appear** in the app list
6. Tap it to see:
   - ✅ Song title
   - ✅ Artist name  
   - ✅ Album artwork
   - ✅ Play/Pause/Next/Previous controls

**This is the simplest way to test - no car, no DHU, just your phone!**

---

## ⚙️ Option 2: Test With DHU (Desktop Emulator)

**For desktop testing with emulator:**

### Prerequisites
1. **Install DHU** (Desktop Head Unit):
   - Open Android Studio
   - Tools → SDK Manager → SDK Tools tab
   - Check "Android Auto Desktop Head Unit Emulator"
   - Click Apply

2. **Setup Android Auto on Phone** (same as Option 1 Step 1-2):
   - Install Android Auto app
   - Enable Developer mode
   - Enable "Unknown sources"

### Running DHU

**Easy way - Use the script:**
```bash
.\start-android-auto.bat
```

**Manual way:**
```bash
# 1. Setup port forwarding
adb forward tcp:5277 tcp:5277

# 2. Start Head Unit Server on phone
adb shell am start-foreground-service -a com.google.android.gms.car.service.START com.google.android.projection.gearhead/.HeadUnitService

# 3. Launch DHU
"%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

### Using DHU
1. DHU window opens on your computer
2. On your **phone**, accept the connection prompt
3. In **DHU window**, tap the media icon (🎵)
4. **Mavrixfy** should appear in the list
5. Open Mavrixfy on your phone and play a song
6. Controls should appear in DHU

### Common DHU Issues

**Error: "failed to connect"**
```bash
# Solution 1: Restart ADB server
adb kill-server
adb start-server
adb forward tcp:5277 tcp:5277

# Solution 2: Restart Android Auto on phone
adb shell am force-stop com.google.android.projection.gearhead
adb shell am start-foreground-service -a com.google.android.gms.car.service.START com.google.android.projection.gearhead/.HeadUnitService
```

**Error: "Could not load configuration"**
- This is a warning, not an error - DHU will use defaults
- You can ignore it

**App doesn't appear in DHU media list:**
```bash
# Check if MusicService is running
adb shell dumpsys activity services | findstr MusicService

# Check logs
adb logcat | findstr -i "MediaBrowser"
```

---

## 🚗 Option 3: Test in Real Car (Most Reliable)

**The ultimate test:**

### Step 1: Setup
1. Build and install Mavrixfy on your phone
2. Make sure Android Auto is installed and set up
3. Connect phone to car via USB cable
4. Accept Android Auto permissions on phone

### Step 2: Test
1. Android Auto launches on car screen
2. Tap media/music icon
3. **Mavrixfy should appear** in the app list
4. Open Mavrixfy on phone and play a song
5. Controls should work on car screen

---

## 🔍 Troubleshooting All Methods

### App Not Showing Up?

**Check 1: Is MusicService exported?**
```bash
adb shell dumpsys package com.mavrixfy.app | findstr "Service"
# Should show: com.doublesymmetry.trackplayer.service.MusicService
# Should show: exported=true
```

**Check 2: Is automotive feature declared?**
```bash
adb shell dumpsys package com.mavrixfy.app | findstr "automotive"
# Should show: android.hardware.type.automotive
```

**Check 3: Check Android Auto logs:**
```bash
adb logcat -c  # Clear logs
# Then use your app
adb logcat | findstr -i "MediaBrowser MusicService"

# Should see:
# MediaBrowserService: onGetRoot called
# MediaBrowserService: onLoadChildren called
```

### Controls Don't Work?

**Check 1: Is a song actually playing?**
- You must have an active track loaded in TrackPlayer
- Controls only appear when media is playing

**Check 2: Check TrackPlayer logs:**
```bash
adb logcat | findstr -i "TrackPlayer"
```

**Check 3: Verify capabilities:**
```typescript
// In your app, add this temporarily to check:
const capabilities = await TrackPlayer.getState();
console.log('TrackPlayer capabilities:', capabilities);
```

### No Artwork Showing?

- Use **HTTPS** URLs for artwork (not HTTP)
- Make sure artwork URLs are accessible
- Android Auto requires valid image URLs
- Test artwork URL in browser first

---

## 📊 What You Should See

### In Android Auto (Phone or DHU):
```
┌─────────────────────────────┐
│     [Album Artwork]         │
│                             │
│   Song Title Here           │
│   Artist Name               │
│                             │
│   ◀️  ⏸️  ▶️                 │
│   ━━━━●━━━━━━━━             │
│   2:34 / 4:12               │
└─────────────────────────────┘
```

### Controls Available:
- ⏸️ Play / Pause
- ▶️ Next Track  
- ◀️ Previous Track
- 🔄 Seeking via progress bar

---

## 🎯 Recommended Testing Flow

**For quick testing:**
1. Start with **Option 1** (phone only) - fastest and most reliable
2. If it works on phone, it'll work in car

**For thorough testing:**  
1. Test with **Option 1** (phone only) first
2. Then test with **Option 2** (DHU) for desktop debugging
3. Finally test in **Option 3** (real car) for production validation

**Most developers skip DHU and just test on phone + real car!**

---

## ⚡ Quick Start (Recommended)

**Skip DHU hassle - test on phone directly:**

```bash
# 1. Build app
cd android
.\gradlew.bat assembleDebug

# 2. Install app
adb install -r app\build\outputs\apk\debug\app-debug.apk

# 3. Open Android Auto app on phone (enable Developer mode first)
# 4. Open Mavrixfy and play a song
# 5. Check Android Auto app - Mavrixfy should appear!
```

**Done! No DHU needed.**

---

## 🔗 Links

- [Android Auto App (Play Store)](https://play.google.com/store/apps/details?id=com.google.android.projection.gearhead)
- [Android Auto Developer Docs](https://developer.android.com/training/cars/media)
- [react-native-track-player Docs](https://rntp.dev/)

