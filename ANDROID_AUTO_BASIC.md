# Android Auto - Basic Media Controls

Your app now supports **basic Android Auto** using react-native-track-player's built-in MediaBrowserService.

## What You Get

✅ **Automatic Android Auto support** - No custom code needed!
✅ **Current track display** - Shows what's playing
✅ **Media controls** - Play, pause, next, previous
✅ **Album artwork** - Displays in Android Auto
✅ **Queue management** - Shows your play queue

## How It Works

react-native-track-player's `MusicService` is already a `MediaBrowserService`, which Android Auto can connect to automatically. We just added:

1. ✅ `automotive_app_desc.xml` - Tells Android Auto we're a media app
2. ✅ `android.media.browse.MediaBrowserService` intent filter
3. ✅ `android.hardware.type.automotive` feature declaration

**No custom native code required!**

## Testing with DHU (Desktop Head Unit)

### Step 1: Set up ADB forwarding
```bash
adb forward tcp:5277 tcp:5277
```

### Step 2: Start DHU
```bash
"%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

Or if DHU not found, install it:
1. Open Android Studio
2. Tools → SDK Manager
3. SDK Tools tab
4. Check "Android Auto Desktop Head Unit Emulator"
5. Click Apply

### Step 3: Connect
1. DHU window opens
2. On your phone, tap "Accept" when Android Auto connection prompt appears
3. In DHU, tap the media icon (🎵)
4. **Mavrixfy should appear** in the app list
5. Tap Mavrixfy

### Step 4: Test
1. Play a song in your app
2. You should see in Android Auto:
   - ✅ Song title
   - ✅ Artist name
   - ✅ Album artwork
   - ✅ Play/Pause button
   - ✅ Next/Previous buttons
   - ✅ Progress bar

## What Android Auto Shows

### Now Playing Screen:
```
┌─────────────────────────────┐
│     [Album Artwork]         │
│                             │
│   Song Title                │
│   Artist Name               │
│                             │
│   ◀  ⏸  ▶                  │
│   ━━━━●━━━━━━━━             │
│   2:34 / 4:12               │
└─────────────────────────────┘
```

### Controls Available:
- ⏸ Play / Pause
- ▶ Next Track
- ◀ Previous Track
- 🔀 Shuffle (if enabled in app)
- 🔁 Repeat (if enabled in app)

## Limitations (Basic Mode)

This is **basic Android Auto** support. You get:
- ✅ Current track controls
- ✅ Queue navigation
- ✅ Artwork display

You DON'T get:
- ❌ Custom browse tabs (Home, Trending, etc.)
- ❌ Search functionality
- ❌ Category browsing
- ❌ Playlist browsing

To add those features, you'd need a custom `MediaBrowserService` implementation (which we removed).

## Troubleshooting

### App doesn't appear in Android Auto
```bash
# Check service is exported
adb shell dumpsys package com.mavrixfy.app | findstr MusicService

# Should show: exported=true
```

### DHU won't connect
```bash
# Check ADB forwarding
adb forward --list

# Should show: tcp:5277 tcp:5277

# If missing, run:
adb forward tcp:5277 tcp:5277
```

### No artwork showing
- Make sure your tracks have valid `artwork` URLs
- Check the URLs are accessible from the device
- Try using HTTPS URLs

### Controls don't work
- Check TrackPlayer is properly initialized
- Check `index.js` has `registerPlaybackService`
- Rebuild the app

## Log Checking

```bash
# Watch Android Auto logs
adb logcat | findstr -i "MediaBrowser MusicService Mavrixfy"
```

You should see:
```
MediaBrowserService: onGetRoot called
MediaBrowserService: onLoadChildren called
```

## Current Configuration

**AndroidManifest.xml:**
- ✅ MusicService declared as MediaBrowserService
- ✅ automotive_app_desc.xml referenced
- ✅ Android Auto feature declared

**What's Automatic:**
- ✅ MediaSession creation (from TrackPlayer)
- ✅ PlaybackState updates (from TrackPlayer)
- ✅ Metadata updates (from TrackPlayer)
- ✅ Queue management (from TrackPlayer)

**No Custom Code Needed!**

This is the simplest Android Auto integration - just media controls for what's currently playing!
