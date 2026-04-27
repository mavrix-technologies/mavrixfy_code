# 🏗️ CarPlay & Android Auto Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your React Native App                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ PlayerContext│  │  UI Components│  │ Song Manager │         │
│  │  (State)     │  │  (Screens)    │  │  (API Calls) │         │
│  └──────┬───────┘  └──────┬────────┘  └──────┬───────┘         │
│         │                  │                   │                  │
│         └──────────────────┼───────────────────┘                  │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              react-native-track-player (JavaScript)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  TrackPlayer.play() / pause() / skipToNext() / add()     │  │
│  │  TrackPlayer.getQueue() / getActiveTrack() / seekTo()    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           react-native-track-player (Native Layer)               │
│                                                                   │
│  ┌─────────────────────┐         ┌─────────────────────┐       │
│  │   Android (Kotlin)  │         │     iOS (Swift)     │       │
│  │  ┌───────────────┐  │         │  ┌───────────────┐  │       │
│  │  │ MusicService  │  │         │  │ MediaSession  │  │       │
│  │  │ (MediaSession)│  │         │  │ (AVPlayer)    │  │       │
│  │  └───────┬───────┘  │         │  └───────┬───────┘  │       │
│  └──────────┼──────────┘         └──────────┼──────────┘       │
└─────────────┼──────────────────────────────┼──────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│   Android Auto Layer     │    │    CarPlay Layer         │
│  ┌────────────────────┐  │    │  ┌────────────────────┐  │
│  │MavrixfyAutoService │  │    │  │ Track Player       │  │
│  │(MediaBrowserService│  │    │  │ handles this       │  │
│  │ + AutoPlayModule)  │  │    │  │ automatically      │  │
│  └────────┬───────────┘  │    │  └────────┬───────────┘  │
└───────────┼──────────────┘    └───────────┼──────────────┘
            │                                │
            ▼                                ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│   Android Auto Display   │    │   CarPlay Display        │
│  (Car Head Unit)         │    │  (Car Head Unit)         │
└──────────────────────────┘    └──────────────────────────┘
```

---

## Data Flow: User Plays a Song

### Android Auto Flow

```
1. User taps track in car
   │
   ▼
2. Android Auto sends command
   │
   ▼
3. MavrixfyAutoService.onPlayFromMediaId()
   │
   ▼
4. Broadcast to AutoPlayModule (Native)
   │
   ▼
5. AutoPlayModule emits event to RN
   │
   ▼
6. React Native receives "AutoPlayTracks" event
   │
   ▼
7. TrackPlayer.setQueue() + play()
   │
   ▼
8. Track Player updates MediaSession
   │
   ▼
9. MavrixfyAutoService mirrors session state
   │
   ▼
10. Android Auto display updates
    (Now Playing, metadata, artwork)
```

### CarPlay Flow

```
1. User taps track in car
   │
   ▼
2. CarPlay sends remote command
   │
   ▼
3. Track Player MediaSession receives command
   │
   ▼
4. Track Player service handles playback
   │
   ▼
5. Track Player plays track
   │
   ▼
6. Now Playing info updates
   │
   ▼
7. CarPlay display updates
    (Now Playing, metadata, artwork)
```

---

## Component Responsibilities

### React Native Layer
```
┌─────────────────────────────────────────────────────┐
│ PlayerContext                                        │
│ • Manages app-level playback state                  │
│ • Syncs with Track Player                           │
│ • Handles UI updates                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Track Player (JS API)                                │
│ • add() - Add tracks to queue                       │
│ • play() / pause() - Control playback               │
│ • skipToNext() / skipToPrevious() - Navigation      │
│ • getQueue() - Get current queue                    │
│ • Event listeners - Track changes                   │
└─────────────────────────────────────────────────────┘
```

### Native Layer (Android)
```
┌─────────────────────────────────────────────────────┐
│ MusicService (Track Player)                         │
│ • Manages MediaSession                              │
│ • Handles playback with ExoPlayer                   │
│ • Responds to remote commands                       │
│ • Updates notification                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ MavrixfyAutoService                                  │
│ • MediaBrowserServiceCompat                         │
│ • Provides browsable content (playlists, tracks)    │
│ • Handles onPlayFromMediaId()                       │
│ • Mirrors Track Player session state                │
│ • Syncs metadata to Android Auto                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ AutoPlayModule                                       │
│ • Bridge between Native and RN                      │
│ • Broadcasts play commands to RN                    │
│ • Receives sync updates from RN                     │
│ • Handles retry logic                               │
└─────────────────────────────────────────────────────┘
```

### Native Layer (iOS)
```
┌─────────────────────────────────────────────────────┐
│ Track Player (iOS)                                   │
│ • Manages AVPlayer                                  │
│ • Handles MediaSession (MPNowPlayingInfoCenter)     │
│ • Responds to remote commands                       │
│ • Updates Control Center & CarPlay                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ CarPlaySceneDelegate (Optional)                      │
│ • Custom CarPlay UI                                 │
│ • Tab bar, playlists, browse                        │
│ • Only needed for advanced features                 │
└─────────────────────────────────────────────────────┘
```

---

## State Synchronization

### Android Auto ↔ Track Player Sync

```
┌──────────────────┐                    ┌──────────────────┐
│  Track Player    │                    │ MavrixfyAuto     │
│  MediaSession    │                    │ Service          │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         │  1. Track Player plays track          │
         │─────────────────────────────────────▶│
         │                                       │
         │  2. Session state changes             │
         │─────────────────────────────────────▶│
         │                                       │
         │  3. Metadata updates                  │
         │─────────────────────────────────────▶│
         │                                       │
         │  4. Queue changes                     │
         │─────────────────────────────────────▶│
         │                                       │
         │◀─────────────────────────────────────│
         │  5. Mirror state to Auto session      │
         │                                       │
         │◀─────────────────────────────────────│
         │  6. Sync complete                     │
         │                                       │
```

### React Native ↔ Native Sync

```
┌──────────────────┐                    ┌──────────────────┐
│  React Native    │                    │  Native Layer    │
│  (PlayerContext) │                    │  (AutoPlayModule)│
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         │  1. User plays track in car           │
         │◀─────────────────────────────────────│
         │     (AutoPlayTracks event)            │
         │                                       │
         │  2. TrackPlayer.setQueue()            │
         │─────────────────────────────────────▶│
         │                                       │
         │  3. Playback starts                   │
         │─────────────────────────────────────▶│
         │                                       │
         │  4. Sync state back                   │
         │─────────────────────────────────────▶│
         │     (syncAutoState)                   │
         │                                       │
```

---

## File Locations

### Android
```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   │   • Declares MavrixfyAutoService
│   │   │   • Declares MusicService (Track Player)
│   │   │   • Permissions (FOREGROUND_SERVICE_MEDIA_PLAYBACK)
│   │   │   • Metadata (automotive_app_desc)
│   │   │
│   │   ├── java/com/mavrixfy/app/
│   │   │   ├── auto/
│   │   │   │   └── MavrixfyAutoService.kt
│   │   │   │       • MediaBrowserServiceCompat
│   │   │   │       • onGetRoot() - Root content
│   │   │   │       • onLoadChildren() - Browse content
│   │   │   │       • onPlayFromMediaId() - Play tracks
│   │   │   │       • Session mirroring
│   │   │   │
│   │   │   ├── AutoPlayModule.kt
│   │   │   │   • RCTBridgeModule
│   │   │   │   • syncAutoState() - RN → Native
│   │   │   │   • Emits AutoPlayTracks - Native → RN
│   │   │   │   • Retry logic
│   │   │   │
│   │   │   └── AutoPlayPackage.kt
│   │   │       • Registers AutoPlayModule
│   │   │
│   │   └── res/xml/
│   │       └── automotive_app_desc.xml ✨
│   │           • Declares media app
│   │           • Required for Android Auto
│   │
│   └── build.gradle
│       • Dependencies
│       • Build configuration
```

### iOS
```
ios/
├── YourApp/
│   ├── Info.plist ⚠️
│   │   • UIBackgroundModes (audio)
│   │   • UIApplicationSceneManifest (CarPlay)
│   │   • Required for CarPlay
│   │
│   └── CarPlaySceneDelegate.swift (optional)
│       • CPTemplateApplicationSceneDelegate
│       • Custom CarPlay UI
│       • Only for advanced features
```

### JavaScript
```
├── index.js
│   • Registers Track Player service
│   • Entry point
│
├── lib/
│   └── trackPlayerService.ts ✅
│       • Your implementation
│       • Event handlers
│       • Android Auto bridge
│       • State synchronization
│
└── services/
    └── trackPlayerService.ts ✨
        • Reference implementation
        • Helper functions
        • Setup functions
```

---

## Event Flow Diagram

### Playback Events

```
User Action (Car)
    │
    ▼
┌─────────────────────┐
│  Car Display        │
│  (Android Auto /    │
│   CarPlay)          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Native Service     │
│  (MavrixfyAuto /    │
│   Track Player)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Bridge Module      │
│  (AutoPlayModule)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  React Native       │
│  (Event Listener)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Track Player API   │
│  (play/pause/skip)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Native Playback    │
│  (ExoPlayer/AVPlayer│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Session Update     │
│  (MediaSession)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Car Display Update │
│  (Now Playing)      │
└─────────────────────┘
```

---

## Key Concepts

### MediaSession (Android)
```
┌─────────────────────────────────────────────────────┐
│ MediaSessionCompat                                   │
│ • Central hub for media playback state              │
│ • Connects Track Player ↔ Android Auto              │
│ • Handles remote commands                           │
│ • Updates metadata and artwork                      │
│ • Manages playback state                            │
└─────────────────────────────────────────────────────┘
```

### MediaBrowserService (Android)
```
┌─────────────────────────────────────────────────────┐
│ MediaBrowserServiceCompat                            │
│ • Provides browsable content hierarchy              │
│ • Root → Tabs → Playlists → Tracks                 │
│ • Handles search queries                            │
│ • Responds to play commands                         │
│ • Required for Android Auto                         │
└─────────────────────────────────────────────────────┘
```

### MPNowPlayingInfoCenter (iOS)
```
┌─────────────────────────────────────────────────────┐
│ MPNowPlayingInfoCenter                               │
│ • Updates Now Playing info                          │
│ • Provides metadata to CarPlay                      │
│ • Handles artwork                                   │
│ • Updates playback progress                         │
│ • Managed by Track Player automatically             │
└─────────────────────────────────────────────────────┘
```

---

## Summary

### What Makes This Architecture Great

1. **Separation of Concerns**
   - UI layer (React Native)
   - Playback layer (Track Player)
   - Car integration layer (Services)

2. **Bidirectional Sync**
   - Phone → Car (metadata, state)
   - Car → Phone (commands, selections)

3. **Reliability**
   - Retry logic
   - Error handling
   - State recovery

4. **Performance**
   - Efficient caching
   - Debounced updates
   - Background processing

5. **Maintainability**
   - Clear responsibilities
   - Well-documented
   - Modular design

---

## Next Steps

1. **Understand the flow** - Review diagrams above
2. **Test Android Auto** - Should work immediately
3. **Configure iOS** - Update Info.plist
4. **Test CarPlay** - Verify functionality
5. **Polish** - Handle edge cases

Your architecture is **production-ready**! 🚀
