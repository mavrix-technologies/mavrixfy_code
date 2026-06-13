# How to Switch Between Local and Production API

## ⚠️ IMPORTANT: Always Clear Cache After Changing .env

React Native/Expo caches environment variables at build time. You MUST clear the cache for changes to take effect!

---

## 🔧 Switch to Local Development Mode

### 1. Update `.env` file:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

### 2. Start Python API Server:
```bash
cd youtube-music-api
python main.py
```

### 3. Clear Cache and Restart:
```bash
# IMPORTANT: Use --clear flag!
npx expo start --clear

# Or manually clear:
rm -rf node_modules/.cache
npx expo start
```

### 4. Verify in logs:
Look for:
```
LOG  [API Config] YouTube Music URL: http://localhost:8000
```

**NOT:**
```
LOG  [API Config] YouTube Music URL: https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

---

## 🌐 Switch to Production Mode

### 1. Update `.env` file:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

### 2. Clear Cache and Restart:
```bash
npx expo start --clear
```

### 3. Verify in logs:
Look for:
```
LOG  [API Config] YouTube Music URL: https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

---

## 🐛 Troubleshooting: Cache Not Clearing

If you still see the old URL after clearing cache:

### Method 1: Nuclear Option (Recommended)
```bash
# Stop the server (Ctrl+C)

# Clear everything
rm -rf node_modules/.cache
rm -rf .expo
rm -rf android/app/build  # If on Android
rm -rf ios/build           # If on iOS

# Restart with clear flag
npx expo start --clear
```

### Method 2: Force Rebuild
```bash
# Press 'Shift + R' in Expo terminal to reload
# Or shake device and press "Reload"
```

### Method 3: Check Process.env
Add this temporarily to see what value is actually loaded:
```typescript
// In any file
console.log('ENV VALUE:', process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL);
```

---

## 📱 Platform-Specific URLs

### iOS Simulator
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```
✅ Works perfectly

### Android Emulator
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://10.0.2.2:8000
```
⚠️ Special IP for Android emulator to access host machine

### Physical Device (Android/iOS)
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.6:8000
```
⚠️ Replace `192.168.1.6` with your computer's actual IP address

**Find your IP:**
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` (look for inet)

---

## ✅ Quick Checklist

When switching modes, always:
- [ ] Update `.env` file
- [ ] Stop current Expo server (Ctrl+C)
- [ ] Clear cache: `npx expo start --clear`
- [ ] Wait for Metro Bundler to finish rebuilding
- [ ] Reload app on device/simulator
- [ ] Check logs for correct URL
- [ ] Test search to confirm it's working

---

## 🔍 Verify API is Working

### Test Local API:
```bash
curl http://localhost:8000/healthz
# Should return: {"status":"ok"}

curl "http://localhost:8000/search?q=test&filter=songs&limit=3"
# Should return: [array of songs]
```

### Test Production API:
```bash
curl https://mavrixfy-api-drab.vercel.app/api/youtube-music/health
# Should return: {"success":true,"service":"YouTube Music API",...}
```

---

## 📝 Current Status

Your `.env` is currently set to: **Local Development Mode** (`http://localhost:8000`)

To use this:
1. Make sure Python API is running: `cd youtube-music-api && python main.py`
2. Clear cache: `npx expo start --clear`
3. Wait for rebuild
4. Check logs for: `[API Config] YouTube Music URL: http://localhost:8000`

---

## 💡 Pro Tip: Use Environment-Specific Files

We already created these for you:
- `.env.development` - Local settings
- `.env.production` - Production settings

To switch, just copy:
```bash
# For development
copy .env.development .env

# For production
copy .env.production .env

# Then always clear cache!
npx expo start --clear
```
