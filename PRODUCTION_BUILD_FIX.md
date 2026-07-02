# iOS Production Build - Backend API Connection Fix

## Problem
After building the IPA app and installing it on iOS devices, the app was not calling the backend API. The YouTube Music API and other backend services were not responding.

## Root Cause
The EAS build configuration had `EXPO_NO_DOTENV: "1"` set in production profiles, which disabled loading of `.env.production` file during the build process. This meant that critical environment variables like `EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL` were undefined at runtime.

Without these environment variables, the app either:
1. Failed to make API calls at all
2. Fell back to incorrect/outdated hardcoded URLs
3. Tried to connect to localhost (development URLs)

## Solution Applied
Added all required environment variables directly to the EAS build configuration in `eas.json` for the following profiles:

### iOS Profiles Fixed:
- `ios-optimized` - Main iOS production build
- `production` - General production build (iOS + Android)

### Android Profiles Fixed (preventive):
- `production-arm64`
- `production-armeabi-v7a` 
- `production-ultra-small`

### Environment Variables Added:
```json
{
  "EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL": "https://mavrixfy-api-drab.vercel.app/api/youtube-music",
  "EXPO_PUBLIC_MUSIC_API_DOMAIN": "mavrixfy-song-api.vercel.app",
  "EXPO_PUBLIC_APP_API_URL": "https://mavrixfy-song-api.vercel.app"
}
```

## How to Rebuild

### For iOS:
```bash
# Using the optimized iOS profile (recommended)
eas build --profile ios-optimized --platform ios

# OR using the general production profile
eas build --profile production --platform ios
```

### For Android:
```bash
# Using the general production profile
eas build --profile production --platform android

# OR using specific architecture profiles
eas build --profile production-arm64 --platform android
eas build --profile production-ultra-small --platform android
```

## Verification Steps

After installing the new build:

1. **Open the app** on a physical iOS device
2. **Check network requests** - The app should now make requests to:
   - `https://mavrixfy-api-drab.vercel.app/api/youtube-music/*`
   - `https://mavrixfy-song-api.vercel.app/*`

3. **Test YouTube Music features**:
   - Search for songs
   - Play music
   - Load playlists
   - Check if album art loads

4. **Check logs** (optional):
   - Use Xcode Console or React Native Debugger
   - Look for API request logs
   - Verify no "localhost" or "undefined" URLs

## Backend URLs Reference

| Service | URL |
|---------|-----|
| YouTube Music API | `https://mavrixfy-api-drab.vercel.app/api/youtube-music` |
| Song API | `https://mavrixfy-song-api.vercel.app` |
| App API | `https://mavrixfy-song-api.vercel.app` |

## Alternative Solutions (Not Implemented)

If you prefer different approaches in the future:

### Option A: Remove EXPO_NO_DOTENV
Remove `"EXPO_NO_DOTENV": "1"` from build profiles to allow `.env.production` to be loaded:
```json
{
  "env": {
    "NODE_ENV": "production",
    "EXPO_USE_UPDATES": "1"
    // "EXPO_NO_DOTENV": "1" <- REMOVE THIS
  }
}
```

### Option B: Use EAS Secrets
Store sensitive values as EAS secrets:
```bash
eas secret:create --scope project --name YOUTUBE_MUSIC_API_URL --value "https://mavrixfy-api-drab.vercel.app/api/youtube-music"
```

Then reference in eas.json:
```json
{
  "env": {
    "EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL": "$YOUTUBE_MUSIC_API_URL"
  }
}
```

## Notes

- **Network Security**: App Transport Security (ATS) is configured correctly with `NSAllowsArbitraryLoads: true`
- **HTTPS**: All production URLs use HTTPS (secure)
- **Development**: Local development still works with `.env` file and local backend URLs
- **Updates**: Any future backend URL changes should be updated in both:
  1. `.env.production` (for documentation)
  2. `eas.json` build profiles (for actual builds)

## Troubleshooting

If the app still doesn't connect to the backend:

1. **Verify Backend is Running**:
   ```bash
   curl https://mavrixfy-api-drab.vercel.app/api/youtube-music/health
   ```

2. **Check Build Logs**:
   ```bash
   eas build:list
   eas build:view [build-id]
   ```

3. **Verify Environment Variables in Build**:
   - Look at the build logs on EAS dashboard
   - Search for "EXPO_PUBLIC" to see which vars were set

4. **Clear Cache and Rebuild**:
   ```bash
   eas build --profile ios-optimized --platform ios --clear-cache
   ```

## Contact
If issues persist, check:
- EAS Build Dashboard: https://expo.dev/accounts/[your-account]/projects/mavrixfy/builds
- Backend Status: https://mavrixfy-api-drab.vercel.app/
- Vercel Dashboard for backend logs
