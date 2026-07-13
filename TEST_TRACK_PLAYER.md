# Test Track Player - Basic Functionality

Your app is now configured with **basic react-native-track-player** functionality.

## ✅ What Should Work

### 1. Notification Controls
When a song plays, you should see:
- **Media notification** with:
  - Song title
  - Artist name
  - Album artwork
  - Play/Pause button
  - Next button
  - Previous button

### 2. Lock Screen Controls
- Same controls appear on lock screen
- Artwork displays
- Song info displays

### 3. External Controls
- **Bluetooth headphones/car**: Play, pause, next, previous
- **Wired headphones**: Play/pause with button click
- **System media controls**: Work from notification shade

### 4. Background Playback
- Music continues when app is in background
- Music continues when screen is off
- App doesn't get killed while playing

## 🧪 How to Test

### Test 1: Basic Playback
```
1. Open the app
2. Play any song
3. Check notification appears ✓
4. Tap pause in notification ✓
5. Tap play in notification ✓
```

### Test 2: Lock Screen
```
1. Play a song
2. Lock your phone (press power button)
3. Wake phone (don't unlock)
4. You should see music controls on lock screen ✓
5. Tap next/previous ✓
```

### Test 3: Background
```
1. Play a song
2. Press home button (go to home screen)
3. Music should keep playing ✓
4. Open another app
5. Music should keep playing ✓
```

### Test 4: Bluetooth/Headphones
```
1. Connect Bluetooth headphones or car
2. Play a song
3. Use physical controls on headphones ✓
4. Should work: play, pause, next, previous
```

## 🔍 Verify Setup

Run this command to check the service is running:
```bash
adb shell dumpsys activity services | findstr MusicService
```

Should show:
```
ServiceRecord{...} com.mavrixfy.app/com.doublesymmetry.trackplayer.service.MusicService
```

## 📱 Expected Behavior

### Notification Should Show:
- ✅ Song title
- ✅ Artist name  
- ✅ Album artwork (if available)
- ✅ Play/Pause toggle
- ✅ Next track button
- ✅ Previous track button

### Capabilities Enabled:
- ✅ Play
- ✅ Pause
- ✅ Skip to Next
- ✅ Skip to Previous
- ✅ Seek (drag progress bar)
- ✅ Stop

## ❌ Troubleshooting

### No notification appearing?
```bash
# Check permissions
adb shell dumpsys notification | findstr "com.mavrixfy.app"

# Reinstall app
cd android
gradlew uninstallDebug
gradlew installDebug
```

### Notification appears but controls don't work?
- Check `index.js` has `registerPlaybackService` ✓
- Check `trackPlayerService.ts` has event listeners ✓
- Rebuild the app

### Music stops when screen locks?
- Check `android:foregroundServiceType="mediaPlayback"` in manifest ✓
- Check `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission ✓

### Audio focus issues (stops when other app plays)?
- This is normal Android behavior
- Your app should auto-pause when another app needs audio
- Should resume when other app finishes

## 🎯 Current Configuration

Your app has:
- ✅ react-native-track-player properly configured
- ✅ MusicService declared in AndroidManifest.xml
- ✅ Playback service registered in index.js
- ✅ Event listeners set up in trackPlayerService.ts
- ✅ All required permissions

No Android Auto complexity - just simple, working media controls!
