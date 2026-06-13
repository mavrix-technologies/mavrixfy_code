# 🚀 How to Run Mavrixfy App with YouTube Music

Your app has **custom native modules** (TrackPlayer, Google Sign-In) and **cannot run in Expo Go**. You need a development build.

---

## ✅ Quick Start

### Step 1: Start YouTube Music Backend
```bash
cd youtube-music-api-node
npm start
```

**Wait for**: `✅ YouTube Music API initialized successfully`

### Step 2: Start Metro Bundler
Open a new terminal:
```bash
cd e:\Mavrixfy\Mavrixfy_App
npx expo start
```

**Wait for**: QR code to appear

### Step 3: Run on Device

Choose one option below:

---

## 📱 Option A: Android (Recommended)

### Prerequisite: Android Studio Installed

1. **Open Android Emulator** (or connect physical device via USB)

2. **Run the app**:
   ```bash
   npx expo run:android
   ```

3. **Wait** ~2-5 minutes for first build

4. **App will launch** with YouTube Music integration working!

---

## 🍎 Option B: iOS (Mac Only)

### Prerequisite: Xcode Installed

1. **Run the app**:
   ```bash
   npx expo run:ios
   ```

2. **Wait** ~5-10 minutes for first build

3. **App will launch** on iOS simulator

---

## 📦 Option C: Build APK for Physical Device

### For Android Physical Device:

1. **Build development APK**:
   ```bash
   cd android
   gradlew.bat assembleDebug
   ```

2. **Find APK at**:
   ```
   android\app\build\outputs\apk\debug\app-debug.apk
   ```

3. **Transfer to phone** and install

4. **Open app** - it will connect to your Metro server

---

## 🧪 Testing YouTube Music

Once the app is running:

### Test 1: Search
1. Open app → Search tab
2. Search: **"Arijit Singh"**
3. **Expected**: Mix of JioSaavn + YouTube Music results

### Test 2: Check Sources
Look for songs that might be YouTube Music:
- Different thumbnails/artwork
- Songs not typically on JioSaavn
- Global artists (Taylor Swift, Dua Lipa, etc.)

### Test 3: Backend Logs
Check YouTube Music backend terminal:
```
[2026-06-13T...] GET /api/youtube-music/search
🔍 Searching: query="arijit singh", type="song", limit=15
```

---

## ⚠️ Common Issues

### Issue: "Runtime not ready" or Module error
**Cause**: Trying to use Expo Go
**Solution**: Use development build (Option A or B above)

### Issue: Android build fails
**Solution**: 
```bash
cd android
gradlew.bat clean
cd ..
npx expo run:android
```

### Issue: iOS build fails
**Solution**:
```bash
cd ios
pod install
cd ..
npx expo run:ios
```

### Issue: No YouTube Music results
**Check**:
1. Backend running? `curl http://localhost:8000`
2. Device on same network?
3. Check Metro logs for errors

---

## 📊 What's Integrated

| Feature | Status |
|---------|--------|
| YouTube Music Backend | ✅ Working |
| Search Integration | ✅ Implemented |
| Deduplication | ✅ Working |
| Caching | ✅ Implemented |
| Playback | ⏭️ Not yet implemented |

---

## 🎯 Expected Behavior

When you search:
1. **Instant**: Local catalog results
2. **~1-2s**: JioSaavn + YouTube Music results (parallel)
3. **Merged**: All results combined
4. **Deduplicated**: No duplicate songs

---

## 🔧 Development Workflow

### Running on Physical Android Device

1. **Enable USB Debugging** on phone
2. **Connect via USB**
3. Run: `npx expo run:android`
4. **Disconnect USB** - app will connect via network
5. **Edit code** - changes hot reload

### Network Requirements

- Phone and PC must be on **same WiFi network**
- YouTube Music backend: `http://localhost:8000`
- Metro bundler: `http://YOUR_PC_IP:8081`

---

## 📝 Next Steps

After getting the app running:

1. ✅ Test search with YouTube Music
2. ⏭️ Implement playback (stream URLs)
3. ⏭️ Add YouTube Music UI badges
4. ⏭️ Add to home feed recommendations
5. ⏭️ Deploy backend to production

---

## 💡 Tips

### Quick Rebuild
```bash
npx expo run:android --no-build-cache
```

### Clear Everything
```bash
npx expo start --clear
rm -rf android/app/build
cd android && gradlew.bat clean && cd ..
```

### Check if Device is Connected
```bash
adb devices
```

---

## 🆘 Still Having Issues?

1. **Check both services are running**:
   - YouTube Music Backend: http://localhost:8000
   - Metro Bundler: QR code visible

2. **Check logs**:
   - Backend: See API requests
   - Metro: See bundle errors
   - App: Use React Native Debugger

3. **Verify integration**:
   ```bash
   # Test backend directly
   curl "http://localhost:8000/api/youtube-music/search?query=test&type=song&limit=5"
   ```

---

**Remember**: Expo Go won't work because your app has custom native modules. You must use a development build!
