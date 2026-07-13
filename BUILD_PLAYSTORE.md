# Play Store Production Build Guide

## Current Version
- **Version**: 3.0.0
- **Version Code**: 30000
- **Package**: com.mavrixfy.app

## ✅ Android Auto Integration
Your app now includes **basic Android Auto media controls**:
- ✅ Media controls show in car/DHU notification area
- ✅ Full-screen "Now Playing" view when tapped
- ✅ No custom browse content (keeps app simple)
- ✅ Works with react-native-track-player's built-in MediaSession

---

## Build Options

### Option 1: AAB (Recommended for Play Store)

**App Bundle (AAB)** - Smaller download size, Play Store optimizes per-device:

```bash
eas build --platform android --profile playstore-aab
```

**What you get:**
- ✅ Google Play optimized bundle
- ✅ Smaller user downloads (device-specific APKs)
- ✅ Supports App Bundles features
- ✅ Required for new apps on Play Store

### Option 2: APK (Universal)

**Universal APK** - Works on all devices, larger size:

```bash
eas build --platform android --profile production
```

**What you get:**
- ✅ Single APK for all devices
- ✅ Easier testing/distribution
- ✅ Can share directly with testers
- ❌ Larger file size

---

## Pre-Build Checklist

### 1. Version Check
- [ ] Current version: **3.0.0** (30000)
- [ ] Increment if needed in `app.json`:
  ```json
  "version": "3.0.0",
  "versionCode": 30000
  ```

### 2. Environment Variables
- [ ] `.env.production` exists with production URLs
- [ ] Firebase credentials configured
- [ ] API URLs point to production

### 3. Credentials
- [ ] Android keystore configured in EAS
- [ ] Run `eas credentials` to verify

### 4. Test Build Quality
- [ ] Debug build works on device
- [ ] Android Auto controls work in DHU/phone
- [ ] All features tested

---

## Build Commands

### AAB for Play Store (Recommended)
```bash
# Build App Bundle
eas build --platform android --profile playstore-aab

# This will:
# 1. Build on EAS servers
# 2. Sign with your keystore
# 3. Generate .aab file
# 4. Auto-submit to Play Store (if configured)
```

### APK for Testing/Direct Distribution
```bash
# Build universal APK
eas build --platform android --profile production

# Or optimized APK
eas build --platform android --profile production-optimized
```

### Local Build (If needed)
```bash
cd android
.\gradlew.bat bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

---

## After Build

### Download Build
```bash
# List recent builds
eas build:list --platform android --limit 5

# Download specific build
eas build:download --id <build-id>
```

### Submit to Play Store

#### Option 1: Auto-submit during build
```bash
eas build --platform android --profile playstore-aab --auto-submit
```

#### Option 2: Manual submit after build
```bash
eas submit --platform android --latest
```

#### Option 3: Manual upload
1. Download .aab file
2. Go to [Play Console](https://play.google.com/console)
3. Select your app
4. Production → Create new release
5. Upload .aab file
6. Complete release details
7. Review and rollout

---

## Build Profiles Explained

### `playstore-aab` (Recommended)
- Builds: App Bundle (.aab)
- Gradle: `bundleRelease`
- Auto-increment: No (manual version control)
- Channel: production
- Environment: Production APIs

### `production`
- Builds: Universal APK
- Gradle: `assembleRelease`
- Good for: Direct distribution

### `production-aab`
- Builds: App Bundle
- Auto-increment: Yes
- Good for: Automated releases

---

## Environment Variables in Build

The build includes these production variables:
```
NODE_ENV=production
EXPO_USE_UPDATES=1
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
EXPO_PUBLIC_MUSIC_API_DOMAIN=mavrixfy-song-api.vercel.app
EXPO_PUBLIC_APP_API_URL=https://mavrixfy-song-api.vercel.app
```

---

## Testing Production Build

### Test AAB locally (requires bundletool)
```bash
# Download bundletool
# https://github.com/google/bundletool/releases

# Generate APKs from AAB
java -jar bundletool.jar build-apks --bundle=app-release.aab --output=app.apks --mode=universal

# Install
java -jar bundletool.jar install-apks --apks=app.apks
```

### Test APK
```bash
adb install -r app-production.apk
```

---

## Play Store Requirements

### What's Included:
- ✅ Target SDK 35 (latest)
- ✅ Min SDK 24 (Android 7.0+)
- ✅ ProGuard enabled
- ✅ Resource shrinking enabled
- ✅ Signing configured
- ✅ Permissions properly declared
- ✅ Privacy policy required (add to Play Console)

### Android Auto:
- ✅ Media controls work automatically
- ✅ No additional Play Store requirements
- ✅ No Android Auto-specific declarations needed
- ✅ MediaSession handled by TrackPlayer

---

## Quick Start Commands

### For Play Store Submission:
```bash
# 1. Check credentials
eas credentials

# 2. Build AAB
eas build --platform android --profile playstore-aab

# 3. Wait for build to complete (check email or dashboard)

# 4. Submit to Play Store
eas submit --platform android --latest

# Done! Check Play Console for review status
```

### For Testing APK:
```bash
# Build universal APK
eas build --platform android --profile production

# Download when ready
eas build:download

# Install on device
adb install -r Mavrixfy-*.apk
```

---

## Build Optimization

Your build includes:
- ✅ ProGuard minification
- ✅ Resource shrinking
- ✅ Hermes engine (fast startup)
- ✅ App size optimizations
- ✅ Removed unused permissions

**Estimated sizes:**
- AAB: ~40-50 MB
- Universal APK: ~60-80 MB
- Device-specific APK from AAB: ~35-45 MB

---

## Troubleshooting

### Build fails with "keystore not found"
```bash
eas credentials
# Follow prompts to configure Android keystore
```

### "Version already exists"
- Increment `versionCode` in `app.json`
- Or use auto-increment profile: `production-aab`

### Build succeeds but crashes on start
- Check ProGuard rules in `expo-build-properties`
- Test with `production-optimized` profile first

### Android Auto not working in production
- It should work automatically - same as debug build
- Verify MediaSession is active: `adb shell dumpsys media_session`

---

## EAS Dashboard

Monitor builds at:
https://expo.dev/@satvik1234/mavrixfy/builds

View with:
```bash
eas build:list
```

---

## Production Checklist

Before submitting to Play Store:

- [ ] Build with `playstore-aab` profile
- [ ] Test on multiple devices
- [ ] Test Android Auto if possible (DHU or car)
- [ ] Check app size is reasonable
- [ ] Verify all features work
- [ ] Test on Android 14+ devices
- [ ] Update Play Console store listing
- [ ] Add privacy policy URL
- [ ] Configure content ratings
- [ ] Set up pricing & distribution
- [ ] Submit for review

---

## Next Steps After Approval

1. **Enable Staged Rollout**: Start with 5-10% of users
2. **Monitor Crashes**: Check Play Console Vitals
3. **Watch Reviews**: Respond to user feedback
4. **Plan Updates**: Use Expo OTA for quick fixes

---

## Support

- EAS Build Docs: https://docs.expo.dev/build/introduction/
- Play Console: https://play.google.com/console
- Android Auto Docs: https://developer.android.com/training/cars

Your app is ready for Play Store! 🚀
