# Song Source Indicators - User Guide

## 🎯 Problem Solved

Users can now **instantly identify** which songs are downloadable (JioSaavn) and which are stream-only (YouTube Music).

## 📱 Visual Indicators

### **1. Source Badge Component**

Shows the source and download capability of each song.

#### JioSaavn Songs (Downloadable):
```
┌─────────────────┐
│ ⬇️  Download    │  ← Orange badge
└─────────────────┘
```

#### YouTube Music Songs (Stream Only):
```
┌─────────────────┐
│ 📶  Stream      │  ← Red badge
└─────────────────┘
```

---

## 🎨 Component Usage

### **Import the Component:**

```typescript
import { SourceBadge, DownloadStatus } from '@/components/SourceBadge';
```

### **Example 1: In Song List**

```typescript
// In your song list/grid component
<View style={styles.songCard}>
  <Image source={{ uri: song.coverUrl }} />
  
  <View style={styles.songInfo}>
    <Text style={styles.title}>{song.title}</Text>
    <Text style={styles.artist}>{song.artist}</Text>
    
    {/* ADD THIS: Source badge */}
    <SourceBadge source={song.source} size="small" />
  </View>
</View>
```

### **Example 2: In Search Results**

```typescript
// Show badge in search results
<FlatList
  data={searchResults}
  renderItem={({ item: song }) => (
    <TouchableOpacity style={styles.searchItem}>
      <Image source={{ uri: song.coverUrl }} />
      
      <View style={styles.info}>
        <Text>{song.title}</Text>
        <Text>{song.artist}</Text>
      </View>
      
      {/* Shows "Download" or "Stream" badge */}
      <SourceBadge source={song.source} size="medium" />
    </TouchableOpacity>
  )}
/>
```

### **Example 3: In Now Playing Screen**

```typescript
// Show larger badge in player
<View style={styles.playerInfo}>
  <Text style={styles.songTitle}>{currentSong.title}</Text>
  <Text style={styles.artistName}>{currentSong.artist}</Text>
  
  {/* Larger badge for player screen */}
  <SourceBadge source={currentSong.source} size="large" showText={true} />
</View>
```

### **Example 4: Download Status Icon**

```typescript
// In song row with download button
<View style={styles.songRow}>
  <Image source={{ uri: song.coverUrl }} />
  
  <View style={styles.details}>
    <Text>{song.title}</Text>
    <Text>{song.artist}</Text>
  </View>
  
  {/* Shows download icon or WiFi icon */}
  <DownloadStatus 
    source={song.source} 
    isDownloaded={song.isDownloaded}
    size="medium"
  />
</View>
```

---

## 🎨 Customization

### **Size Options:**

```typescript
<SourceBadge source="jiosaavn" size="small" />   // Compact
<SourceBadge source="jiosaavn" size="medium" />  // Default
<SourceBadge source="jiosaavn" size="large" />   // Player screen
```

### **With/Without Text:**

```typescript
<SourceBadge source="youtube" showText={true} />  // "📶 Stream"
<SourceBadge source="youtube" showText={false} /> // "📶" only
```

---

## 🎯 Where to Add Badges

### **Recommended Locations:**

1. **✅ Search Results**
   - Shows which songs can be downloaded
   - Helps users choose download-friendly versions

2. **✅ Song Lists/Grids**
   - Home screen recommendations
   - Playlist songs
   - Album tracks

3. **✅ Queue/Up Next**
   - Shows download status in queue
   - Helps plan offline playback

4. **✅ Library/Downloads**
   - Filter by source
   - Show what's available offline

5. **✅ Now Playing**
   - Current song source
   - Download availability

---

## 📊 User Experience Flow

### **Before (Confusing):**
```
User: *Clicks download on YouTube song*
App: *Nothing happens or error*
User: 😕 "Why can't I download this?"
```

### **After (Clear):**
```
User: *Sees "📶 Stream" badge*
User: "Oh, this is streaming only"
User: *Looks for JioSaavn version with "⬇️ Download" badge*
User: *Downloads that instead* 😊
```

---

## 🎨 Color Coding

### **JioSaavn (Orange):**
```
Background: #FFF3E0 (Light orange)
Border: #FF6B00 (Orange)
Icon: ⬇️ Download icon
Text: "Download"
Meaning: ✅ Can download for offline
```

### **YouTube Music (Red):**
```
Background: #FFEBEE (Light red)
Border: #FF0000 (Red)
Icon: 📶 WiFi icon
Text: "Stream"
Meaning: 📶 Requires internet
```

---

## 🔧 Implementation Steps

### **Step 1: Add Badge to Search Results**

Find your search results component (likely in `app/(tabs)/search.tsx`):

```typescript
// Before:
<SongItem song={song} onPress={handlePlay} />

// After:
<View style={styles.songRow}>
  <SongItem song={song} onPress={handlePlay} />
  <SourceBadge source={song.source} size="small" />
</View>
```

### **Step 2: Add to Song Lists**

In any song list component:

```typescript
{songs.map(song => (
  <View key={song.id} style={styles.songCard}>
    {/* Existing song UI */}
    <SourceBadge source={song.source} size="medium" />
  </View>
))}
```

### **Step 3: Add to Download Button**

Replace or enhance download button:

```typescript
{song.source === 'jiosaavn' ? (
  <TouchableOpacity onPress={handleDownload}>
    <Ionicons name="download-outline" size={24} />
  </TouchableOpacity>
) : (
  <SourceBadge source="youtube" showText={false} />
)}
```

---

## 💡 Smart Features

### **Feature 1: Filter by Source**

```typescript
// In your library/search screen
const [sourceFilter, setSourceFilter] = useState<'all' | 'jiosaavn' | 'youtube'>('all');

const filteredSongs = songs.filter(song => {
  if (sourceFilter === 'all') return true;
  return song.source === sourceFilter;
});

// UI
<View style={styles.filters}>
  <Button onPress={() => setSourceFilter('all')}>All</Button>
  <Button onPress={() => setSourceFilter('jiosaavn')}>⬇️ Downloadable</Button>
  <Button onPress={() => setSourceFilter('youtube')}>📶 Streaming</Button>
</View>
```

### **Feature 2: Offline Mode Banner**

```typescript
// Show when offline
if (!hasInternet) {
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline" size={24} />
      <Text>Offline Mode - Showing JioSaavn downloads only</Text>
      <Text style={styles.hint}>YouTube Music requires internet</Text>
    </View>
  );
}
```

### **Feature 3: Smart Recommendations**

```typescript
// Suggest JioSaavn version if available
if (song.source === 'youtube') {
  const jioSaavnVersion = await searchJioSaavn(song.title);
  
  if (jioSaavnVersion) {
    showNotification(
      "💡 This song is also available on JioSaavn! " +
      "Download the JioSaavn version for offline playback."
    );
  }
}
```

---

## 📱 Example Screens

### **Search Screen:**
```
┌─────────────────────────────────┐
│ Search: "arijit singh"          │
├─────────────────────────────────┤
│ 🎵 Tum Hi Ho                    │
│    Arijit Singh                 │
│    [⬇️ Download] ← JioSaavn    │
├─────────────────────────────────┤
│ 🎵 Tum Hi Ho (Music Video)      │
│    Arijit Singh                 │
│    [📶 Stream] ← YouTube       │
├─────────────────────────────────┤
│ 🎵 Channa Mereya                │
│    Arijit Singh                 │
│    [⬇️ Download] ← JioSaavn    │
└─────────────────────────────────┘
```

### **Library Screen:**
```
┌─────────────────────────────────┐
│ My Songs                        │
│ [All] [⬇️ Downloads] [📶 Stream]│
├─────────────────────────────────┤
│ ✅ Song 1 [⬇️ Download]         │
│ ✅ Song 2 [⬇️ Download]         │
│ 📶 Song 3 [📶 Stream]           │
│ ✅ Song 4 [⬇️ Download]         │
└─────────────────────────────────┘
```

---

## ✅ Benefits

### **For Users:**
- ✅ **Instant clarity** - Know which songs are downloadable
- ✅ **Better decisions** - Choose download-friendly versions
- ✅ **Offline planning** - Build offline playlists easily
- ✅ **No confusion** - Clear expectations

### **For You:**
- ✅ **Fewer support questions** - Users understand the difference
- ✅ **Better UX** - Professional, clear interface
- ✅ **Legal compliance** - Makes it obvious what's allowed
- ✅ **User satisfaction** - Users know what to expect

---

## 🎯 Summary

**Component Created:** `components/SourceBadge.tsx`

**Two Components Available:**
1. `<SourceBadge />` - Full badge with icon and text
2. `<DownloadStatus />` - Icon only for compact displays

**Usage:**
```typescript
import { SourceBadge } from '@/components/SourceBadge';

<SourceBadge source={song.source} size="medium" />
```

**Result:**
- JioSaavn songs show: **⬇️ Download** (Orange)
- YouTube songs show: **📶 Stream** (Red)

**Users now know exactly which songs they can download!** 🎉
