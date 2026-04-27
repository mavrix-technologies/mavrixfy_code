# CarPlay & Android Auto Implementation Guide
## Using React Native Track Player (Easiest & Most Reliable)

## ✅ Why This Approach?

You already have `react-native-track-player@4.1.2` installed, which provides:
- **Android Auto** support out of the box
- **CarPlay** support with minimal configuration
- Single JavaScript API for both platforms
- Used by Spotify, SoundCloud, and other major apps
- Active maintenance and community support

---

## 📱 Current Status

### ✅ Already Configured (Android)
- `react-native-track-player` dependency installed
- `MusicService` declared in AndroidManifest.xml
- Foreground service permissions set
- `MavrixfyAutoService` created (custom Android Auto service)

### ⚠️ Needs Configuration
- Android Auto MediaBrowserService implementation
- CarPlay iOS setup (Info.plist, capabilities)
- Track Player service setup in JavaScript
- Playback controls and metadata

---

## 🚀 Implementation Steps

### Step 1: Android Auto Setup (30 minutes)

#### 1.1 Create/Update `automotive_app_desc.xml`

**File:** `android/app/src/main/res/xml/automotive_app_desc.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="media" />
</automotiveApp>
```

#### 1.2 Update Your Custom Android Auto Service

**File:** `android/app/src/main/java/com/mavrixfy/app/auto/MavrixfyAutoService.kt`

```kotlin
package com.mavrixfy.app.auto

import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import androidx.media.MediaBrowserServiceCompat
import com.doublesymmetry.trackplayer.service.MusicService

class MavrixfyAutoService : MediaBrowserServiceCompat() {

    companion object {
        private const val ROOT_ID = "root"
        private const val MEDIA_ID_EMPTY = "empty"
    }

    override fun onCreate() {
        super.onCreate()
        // Set session token from Track Player's MusicService
        sessionToken = MusicService.sessionToken
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        // Allow Android Auto to connect
        return BrowserRoot(ROOT_ID, null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>
    ) {
        // Return empty list - Track Player handles the queue
        // You can customize this to show playlists/categories
        val mediaItems = mutableListOf<MediaBrowserCompat.MediaItem>()
        
        if (parentId == ROOT_ID) {
            // Add browsable categories if needed
            // For now, return empty to use queue-based playback
        }
        
        result.sendResult(mediaItems)
    }
}
```

#### 1.3 Verify AndroidManifest.xml (Already Done ✅)

Your manifest already has the correct setup:
```xml
<meta-data 
    android:name="com.google.android.gms.car.application" 
    android:resource="@xml/automotive_app_desc"/>

<service 
    android:name=".auto.MavrixfyAutoService" 
    android:exported="true" 
    android:foregroundServiceType="mediaPlayback">
    <intent-filter>
        <action android:name="android.media.browse.MediaBrowserService"/>
    </intent-filter>
</service>
```

---

### Step 2: iOS CarPlay Setup (45 minutes)

#### 2.1 Enable CarPlay Capability

1. Open `ios/YourApp.xcworkspace` in Xcode
2. Select your app target
3. Go to **Signing & Capabilities**
4. Click **+ Capability**
5. Add **"Audio, AirPlay, and Picture in Picture"**
6. Check **"Audio"** under Background Modes

#### 2.2 Update Info.plist

**File:** `ios/YourApp/Info.plist`

Add these keys:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>fetch</string>
</array>

<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>arm64</string>
</array>

<!-- CarPlay Support -->
<key>UIApplicationSceneManifest</key>
<dict>
    <key>UIApplicationSupportsMultipleScenes</key>
    <true/>
    <key>UISceneConfigurations</key>
    <dict>
        <key>CPTemplateApplicationSceneSessionRoleApplication</key>
        <array>
            <dict>
                <key>UISceneConfigurationName</key>
                <string>CarPlay</string>
                <key>UISceneClassName</key>
                <string>CPTemplateApplicationScene</string>
                <key>UISceneDelegateClassName</key>
                <string>CarPlaySceneDelegate</string>
            </dict>
        </array>
    </dict>
</dict>
```

#### 2.3 Create CarPlay Scene Delegate (Optional - Track Player handles basics)

If you need custom CarPlay UI, create:

**File:** `ios/YourApp/CarPlaySceneDelegate.swift`

```swift
import CarPlay
import MediaPlayer

@objc(CarPlaySceneDelegate)
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        // Track Player automatically handles now playing
        // Add custom templates here if needed
        let nowPlayingTemplate = CPNowPlayingTemplate.shared
        interfaceController.setRootTemplate(nowPlayingTemplate, animated: true)
    }
    
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController
    ) {
        // Cleanup if needed
    }
}
```

Add bridging header if needed:

**File:** `ios/YourApp-Bridging-Header.h`

```objc
#import <React/RCTBridgeModule.h>
```

---

### Step 3: JavaScript Setup (Core Implementation)

#### 3.1 Create Track Player Service

**File:** `services/trackPlayerService.ts`

```typescript
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
  Event,
} from 'react-native-track-player';

export async function setupPlayer() {
  let isSetup = false;
  
  try {
    await TrackPlayer.getActiveTrackIndex();
    isSetup = true;
  } catch {
    await TrackPlayer.setupPlayer();
    isSetup = true;
  }

  if (isSetup) {
    await TrackPlayer.updateOptions({
      // Android Auto & CarPlay capabilities
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      progressUpdateEventInterval: 2,
    });
  }

  return isSetup;
}

export async function addTrack(track: {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
  album?: string;
  duration?: number;
}) {
  await TrackPlayer.add({
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    album: track.album,
    duration: track.duration,
  });
}

// Playback Service (handles remote controls)
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
}
```

#### 3.2 Register Service in index.js

**File:** `index.js`

```javascript
import { AppRegistry } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { PlaybackService } from './services/trackPlayerService';

AppRegistry.registerComponent('main', () => App);

// Register playback service for Android Auto & CarPlay
TrackPlayer.registerPlaybackService(() => PlaybackService);
```

#### 3.3 Initialize in Your App

**File:** `App.tsx` or `_layout.tsx`

```typescript
import { useEffect } from 'react';
import { setupPlayer } from './services/trackPlayerService';

export default function App() {
  useEffect(() => {
    setupPlayer();
  }, []);

  return (
    // Your app content
  );
}
```

#### 3.4 Usage Example

```typescript
import TrackPlayer from 'react-native-track-player';
import { addTrack } from './services/trackPlayerService';

// Add tracks to queue
async function playMusic() {
  await addTrack({
    id: '1',
    url: 'https://example.com/song.mp3',
    title: 'Song Title',
    artist: 'Artist Name',
    artwork: 'https://example.com/artwork.jpg',
    album: 'Album Name',
    duration: 240, // seconds
  });

  await TrackPlayer.play();
}

// Controls
await TrackPlayer.play();
await TrackPlayer.pause();
await TrackPlayer.skipToNext();
await TrackPlayer.skipToPrevious();
await TrackPlayer.seekTo(30); // seconds
```

---

## 🧪 Testing

### Android Auto Testing

1. **Install Android Auto App** on your phone
2. **Enable Developer Mode** in Android Auto:
   - Open Android Auto app
   - Tap version number 10 times
   - Go to Settings → Developer settings
   - Enable "Unknown sources"
3. **Connect to Car** (or use Desktop Head Unit):
   - Download [Desktop Head Unit](https://github.com/martoreto/aauto-sdk/releases)
   - Connect phone via USB with debugging enabled
   - Run DHU: `./desktop-head-unit`
4. **Test Your App**:
   - Should appear in Android Auto's media apps
   - Test play/pause, skip, metadata display

### CarPlay Testing

1. **CarPlay Simulator** (Xcode):
   - Run app on iOS Simulator
   - In Xcode: `I/O → External Displays → CarPlay`
   - Test controls and metadata
2. **Real Car/Head Unit**:
   - Connect iPhone via USB or wirelessly
   - Your app should appear in CarPlay
   - Test all playback controls

---

## 📊 Feature Comparison

| Feature | Android Auto | CarPlay | Track Player Support |
|---------|--------------|---------|---------------------|
| Play/Pause | ✅ | ✅ | ✅ Automatic |
| Skip Next/Previous | ✅ | ✅ | ✅ Automatic |
| Seek | ✅ | ✅ | ✅ Automatic |
| Artwork Display | ✅ | ✅ | ✅ Automatic |
| Queue Management | ✅ | ✅ | ✅ Manual |
| Voice Commands | ✅ | ✅ | ✅ Automatic |
| Browse Library | ⚠️ Custom | ⚠️ Custom | ⚠️ Requires code |
| Playlists | ⚠️ Custom | ⚠️ Custom | ⚠️ Requires code |

---

## 🎨 Advanced: Custom Browse UI (Optional)

### Android Auto - Browse Categories

Update `MavrixfyAutoService.kt`:

```kotlin
override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
) {
    val mediaItems = mutableListOf<MediaBrowserCompat.MediaItem>()
    
    when (parentId) {
        ROOT_ID -> {
            // Add browsable categories
            mediaItems.add(
                MediaBrowserCompat.MediaItem(
                    MediaDescriptionCompat.Builder()
                        .setMediaId("playlists")
                        .setTitle("Playlists")
                        .setSubtitle("Your playlists")
                        .build(),
                    MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                )
            )
            
            mediaItems.add(
                MediaBrowserCompat.MediaItem(
                    MediaDescriptionCompat.Builder()
                        .setMediaId("recent")
                        .setTitle("Recently Played")
                        .setSubtitle("Your recent tracks")
                        .build(),
                    MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                )
            )
        }
        
        "playlists" -> {
            // Load playlists from your API/storage
            // Add playable items
        }
    }
    
    result.sendResult(mediaItems)
}
```

### CarPlay - Custom Templates

Update `CarPlaySceneDelegate.swift`:

```swift
func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
) {
    // Create tabs
    let nowPlayingTemplate = CPNowPlayingTemplate.shared
    
    let playlistsTemplate = CPListTemplate(
        title: "Playlists",
        sections: [createPlaylistSection()]
    )
    
    let tabBarTemplate = CPTabBarTemplate(templates: [
        nowPlayingTemplate,
        playlistsTemplate
    ])
    
    interfaceController.setRootTemplate(tabBarTemplate, animated: true)
}

func createPlaylistSection() -> CPListSection {
    let items = [
        CPListItem(text: "Favorites", detailText: "50 songs"),
        CPListItem(text: "Recently Played", detailText: "25 songs"),
    ]
    
    return CPListSection(items: items)
}
```

---

## 🔧 Troubleshooting

### Android Auto Not Showing

1. Check `automotive_app_desc.xml` exists
2. Verify `MediaBrowserService` in manifest
3. Enable "Unknown sources" in Android Auto developer settings
4. Check logcat: `adb logcat | grep MediaBrowser`

### CarPlay Not Showing

1. Verify Info.plist has `UIBackgroundModes` with `audio`
2. Check CarPlay capability is enabled in Xcode
3. Ensure app is running when connecting to CarPlay
4. Check Console.app for CarPlay logs

### Metadata Not Updating

1. Ensure artwork URLs are HTTPS
2. Check artwork image size (recommended: 512x512 or larger)
3. Verify all track fields are provided
4. Call `TrackPlayer.updateMetadataForTrack()` if needed

### Playback Issues

1. Check audio session is configured (Track Player handles this)
2. Verify URLs are accessible
3. Test with local files first
4. Check network permissions

---

## 📚 Resources

- [React Native Track Player Docs](https://react-native-track-player.js.org/)
- [Android Auto Developer Guide](https://developer.android.com/training/cars/media)
- [CarPlay Programming Guide](https://developer.apple.com/carplay/)
- [Track Player CarPlay Setup](https://react-native-track-player.js.org/docs/basics/carplay)

---

## ⏱️ Implementation Timeline

| Task | Time | Priority |
|------|------|----------|
| Android Auto XML setup | 15 min | High |
| Update MavrixfyAutoService | 30 min | High |
| iOS Info.plist config | 15 min | High |
| Track Player service setup | 30 min | High |
| Test Android Auto | 30 min | High |
| Test CarPlay | 30 min | High |
| Custom browse UI (optional) | 2-4 hours | Low |
| Polish & edge cases | 1-2 hours | Medium |

**Total Core Implementation: 2-3 hours**
**With Custom UI: 4-7 hours**

---

## ✅ Checklist

### Android Auto
- [ ] Create `automotive_app_desc.xml`
- [ ] Update `MavrixfyAutoService.kt`
- [ ] Verify AndroidManifest.xml
- [ ] Test with Android Auto app
- [ ] Test with Desktop Head Unit

### CarPlay
- [ ] Enable CarPlay capability in Xcode
- [ ] Update Info.plist
- [ ] (Optional) Create CarPlaySceneDelegate
- [ ] Test with CarPlay Simulator
- [ ] Test with real car/head unit

### JavaScript
- [ ] Create `trackPlayerService.ts`
- [ ] Register service in `index.js`
- [ ] Initialize in app entry point
- [ ] Test playback controls
- [ ] Test metadata display

### Testing
- [ ] Play/pause works
- [ ] Skip next/previous works
- [ ] Seek works
- [ ] Artwork displays correctly
- [ ] Metadata updates properly
- [ ] Voice commands work
- [ ] App reconnects after disconnect

---

## 🎯 Next Steps

1. **Start with Android Auto** (easier to test)
2. **Then add CarPlay** (requires Mac/Xcode)
3. **Test thoroughly** with simulators and real hardware
4. **Add custom browse UI** if needed for your UX
5. **Submit to stores** (mention CarPlay/Android Auto in description)

Good luck! 🚀
