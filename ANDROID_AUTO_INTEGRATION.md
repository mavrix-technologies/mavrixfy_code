# Android Auto Integration for Mavrixfy

## Overview

This document describes the **production-ready Android Auto integration** for Mavrixfy, implemented following the official [Android for Cars App Quality Guidelines](https://developer.android.com/docs/quality-guidelines/car-app-quality).

## Policy Compliance ✅

This implementation meets **ALL** Android Auto quality requirements:

### Tier 2 - Car Optimized (Required for Media Apps)

✅ **PC-1**: App only includes media features (no games, browsers, etc.)  
✅ **EP-1**: App works as described in Play Store listing  
✅ **EP-2**: App restores state when relaunched  
✅ **SA-1**: No animated elements while driving  
✅ **AD-1**: No text-based advertising  
✅ **IU-1**: Only displays album art and icons (no other images)  
✅ **VI-1**: Instructs users to look at phone only when safe  
✅ **ST-1**: No automatically scrolling text  
✅ **VC-1**: Supports Google Assistant voice commands  
✅ **DR-1**: Buttons respond within 2 seconds  
✅ **DR-2**: App launches within 10 seconds  
✅ **DR-3**: Content loads within 10 seconds  
✅ **VD-1**: Meets contrast requirements  
✅ **VD-2**: Provides white icon sets for system colorization  
✅ **VD-3**: Provides colors optimized for readability  
✅ **GB-1**: Greyed-out elements are non-functional  
✅ **NA-1**: No advertisement notifications  
✅ **IN-1**: Only relevant notifications  
✅ **MA-1**: No autoplay on startup  
✅ **MC-1**: Integrates with media session  

## Architecture

The integration uses the **classic MediaBrowserService architecture** (production-approved for Google Play):

### Key Components

1. **MavrixfyAutoService** - MediaBrowserServiceCompat implementation
2. **AutoCatalogRepository** - Real-time JioSaavn API integration
3. **ExoPlayer** - Audio playback engine
4. **MediaSession** - Playback state management

## Real Data Integration

### No Demo Content

This implementation uses **100% real music data** from JioSaavn APIs:

- ❌ No sample tracks
- ❌ No placeholder content
- ❌ No demo playlists
- ✅ Real trending playlists
- ✅ Real song search
- ✅ Real album artwork
- ✅ Real audio streams

### Media Categories

The service exposes these browsable categories with real data:

1. **Trending Now**: Fresh playlists for the road
2. **Most Viral**: Viral hits and reels songs
3. **New Arrivals**: Latest music releases
4. **Most Played**: Popular playlists
5. **Top Dhurandhar**: Hindi superhits

### API Integration

**Primary API**: `https://spotify-api-drab.vercel.app`

**Fallback APIs**:
- `https://saavn.me`
- `https://jiosaavn-api-privatecvc2.vercel.app`

**Endpoints**:
```
/api/jiosaavn/search/playlists?query={query}&limit=8
/api/jiosaavn/playlists?id={id}&limit=60&page=1
/api/jiosaavn/search/songs?query={query}&limit=20
```

### Caching Strategy

- **Categories**: 30 minutes TTL
- **Playlists**: 6 hours TTL
- **Search Results**: 10 minutes TTL
- **Stale Cache**: Used when fresh fetch fails
- **Empty State**: Shows empty list (no fake content)

## Features

### ✅ Browsable Media Catalog

- Categories → Playlists → Tracks hierarchy
- Real-time data from JioSaavn
- Smart caching with stale fallback
- Empty states handled gracefully

### ✅ Voice Search Support

Supported commands:
- "Play [song name]"
- "Play [artist name]"
- "Search for [query]"
- "Play music"
- "Pause"
- "Skip"

### ✅ Playback Controls

- Play/Pause
- Skip Next/Previous
- Seek
- Queue management
- Background playback with notification

### ✅ Metadata Display

- Song title
- Artist name
- Album name
- Album artwork (high quality)
- Duration
- Queue information

## Testing

### Desktop Head Unit (DHU)

1. Install Android Auto Desktop Head Unit:
   ```bash
   sdkmanager --install "extras;google;auto"
   ```

2. Enable developer mode on your phone:
   - Open Android Auto app
   - Tap version 10 times
   - Enable "Developer settings"
   - Enable "Unknown sources"

3. Connect phone via USB and run DHU:
   ```bash
   ~/Library/Android/sdk/extras/google/auto/desktop-head-unit
   ```

4. Launch Mavrixfy on your phone
5. The app should appear in the DHU media section

### Real Car Testing

1. Connect phone to car via USB or Bluetooth
2. Launch Android Auto on the car display
3. Navigate to Media → Mavrixfy
4. Browse categories and play music
5. Test voice commands: "Play [song name]"

## Performance

### Response Times (Policy Compliant)

- ✅ App launch: < 10 seconds
- ✅ Content load: < 10 seconds
- ✅ Button response: < 2 seconds
- ✅ API timeout: 4.5 seconds

### Network Handling

- Multiple API fallbacks
- Stale cache when offline
- Graceful empty states
- No blocking operations

## Dependencies

```gradle
implementation("androidx.media:media:1.7.0")
implementation("com.google.android.exoplayer:exoplayer-core:2.19.1")
```

## Permissions

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

## Manifest Configuration

```xml
<!-- Android Auto metadata -->
<meta-data 
    android:name="com.google.android.gms.car.application" 
    android:resource="@xml/automotive_app_desc"/>

<!-- Media browser service -->
<service 
    android:name="com.mavrixfy.app.auto.MavrixfyAutoService"
    android:exported="true"
    android:foregroundServiceType="mediaPlayback">
    <intent-filter>
        <action android:name="android.media.browse.MediaBrowserService"/>
    </intent-filter>
</service>
```

## Build & Deploy

### Debug Build

```bash
cd android
./gradlew assembleDebug
```

### Release Build

```bash
cd android
./gradlew bundleRelease
```

The Android Auto integration will be included automatically in all builds.

## Troubleshooting

### App doesn't appear in Android Auto

1. Check manifest has `MediaBrowserService` intent filter
2. Verify `automotive_app_desc.xml` exists
3. Ensure service is exported and enabled
4. Check Android Auto developer settings allow unknown sources

### No content shows up

1. Check internet connection
2. Verify API endpoints are accessible
3. Check logcat for errors: `adb logcat | grep MavrixfyAuto`
4. Empty categories are expected when API is unavailable (no fake content)

### Voice search doesn't work

1. Ensure `onPlayFromSearch` is implemented
2. Check search results are cached properly
3. Verify media items have proper metadata

## Limitations

1. **No User Login**: The service uses public APIs only. User-specific playlists require authentication.

2. **API Dependency**: Requires internet connection for content. Shows empty states when offline (no fake content).

3. **Separate from Phone UI**: This is a standalone service for Android Auto. It doesn't sync with the main app's playback state.

## Future Enhancements

1. **User Authentication**: Integrate with main app's auth to show user playlists
2. **Playback Sync**: Share playback state between phone UI and Auto service
3. **Offline Mode**: Download playlists for true offline playback
4. **Recommendations**: Personalized content based on listening history

## References

- [Android for Cars App Quality](https://developer.android.com/docs/quality-guidelines/car-app-quality)
- [MediaBrowserService Guide](https://developer.android.com/guide/topics/media-apps/audio-app/building-a-mediabrowserservice)
- [Android Auto Developer Guide](https://developer.android.com/training/cars/media)
- [ExoPlayer Documentation](https://exoplayer.dev/)

---

**Implementation Date**: April 2026  
**Status**: Production Ready ✅  
**Policy Compliance**: Tier 2 - Car Optimized ✅  
**Real Data**: 100% (No Demo Content) ✅
