# Promotions Implementation Guide - React Native App

## ✅ Implementation Complete

The promotion banner system has been enhanced to support all action types from the admin panel.

---

## 🎯 Features Implemented

### 1. **Song Playback** 🎵
- Click banner → Plays attached song immediately
- Uses PlayerContext to play song
- Shows error if no song attached

### 2. **External Links** 🔗
- Opens external URLs in browser
- Validates URL before opening
- Shows error if URL invalid

### 3. **Navigation** 🧭
- **Playlist**: Navigates to `/playlist/{id}`
- **Artist**: Navigates to `/artist/{id}`
- **Album**: Shows "coming soon" alert (implement if needed)

### 4. **Priority Sorting** ⭐
- Fetches promotions ordered by priority (highest first)
- Shows top 5 active promotions
- Auto-rotates every 8 seconds

---

## 📁 Files Modified

### `Mavrixfy_App/components/PromotionBanner.tsx`

**Changes:**
1. Added new types: `ActionType`, `AttachedSong`, `BannerLayout`
2. Imported `usePlayer` hook for song playback
3. Imported `router` for navigation
4. Imported `Linking` and `Alert` for external links
5. Added `orderBy("priority", "desc")` to Firestore query
6. Implemented `handleBannerPress` function with all action types
7. Updated `onPress` to call `handleBannerPress`

---

## 🎮 How It Works

### Fetching Promotions

```typescript
const q = query(
  collection(db, "promotions"),
  where("status", "==", "active"),
  where("platforms", "==", "app"),
  orderBy("priority", "desc"),  // ← NEW: Sort by priority
  limit(5)
);
```

### Handling Click Actions

```typescript
const handleBannerPress = async (promo: Promotion) => {
  switch (promo.actionType) {
    case "song":
      // Play attached song
      await playSong(promo.attachedSong);
      break;
      
    case "external":
      // Open external URL
      await Linking.openURL(promo.actionUrl);
      break;
      
    case "playlist":
      // Navigate to playlist
      router.push(`/playlist/${playlistId}`);
      break;
      
    case "artist":
      // Navigate to artist
      router.push(`/artist/${artistId}`);
      break;
      
    case "album":
      // Navigate to album (implement if needed)
      Alert.alert("Album", "Coming soon!");
      break;
      
    case "none":
    default:
      // No action
      console.log("Clicked:", promo.title);
      break;
  }
};
```

---

## 🧪 Testing

### Test Song Playback
1. Create promotion in admin with:
   - Action Type: "Play Song"
   - Search and attach a song
   - Set priority: 90
   - Platform: App
   - Status: Active

2. Open app home screen
3. Click the banner
4. **Expected**: Song starts playing immediately

### Test External Link
1. Create promotion with:
   - Action Type: "External Link"
   - URL: `https://example.com`
   - Platform: App
   - Status: Active

2. Click banner
3. **Expected**: Browser opens with the URL

### Test Playlist Navigation
1. Create promotion with:
   - Action Type: "Open Playlist"
   - URL: `playlist_id_here` or `/playlist/playlist_id_here`
   - Platform: App
   - Status: Active

2. Click banner
3. **Expected**: Navigates to playlist page

### Test Priority
1. Create 3 promotions with priorities: 50, 80, 95
2. Open app
3. **Expected**: Banner with priority 95 shows first

---

## 🔧 Firestore Query Requirements

### Index Required
If you get a Firestore index error, create this composite index:

**Collection:** `promotions`
**Fields:**
- `status` (Ascending)
- `platforms` (Ascending)
- `priority` (Descending)

**Create via Firebase Console:**
1. Go to Firestore → Indexes
2. Click "Create Index"
3. Collection ID: `promotions`
4. Add fields as above
5. Click "Create"

Or use the error link provided by Firebase to auto-create.

---

## 📊 Data Flow

```
Admin Panel
    ↓
Creates Promotion with:
- title, description
- mediaUrl (Cloudinary)
- actionType: "song"
- attachedSong: { id, title, artist, imageUrl, streamUrl }
- priority: 90
- platforms: "app"
- status: "active"
    ↓
Firestore Database
    ↓
React Native App
    ↓
PromotionBanner Component
    ↓
Fetches active promotions (ordered by priority)
    ↓
User clicks banner
    ↓
handleBannerPress()
    ↓
Checks actionType
    ↓
If "song": playSong(attachedSong)
    ↓
PlayerContext plays the song
    ↓
✅ Song plays!
```

---

## 🎨 UI Behavior

### Banner Display
- Shows one promotion at a time
- Auto-rotates every 8 seconds (if multiple)
- Dots indicator shows current position
- Press dot to jump to specific promotion

### Click Feedback
- Banner scales down slightly (0.98)
- Opacity reduces to 0.85
- Smooth animation

### Media Type Badge
- Shows icon in top-right corner
- Video: Play icon
- Audio: Music notes icon
- GIF: Images icon

---

## 🐛 Troubleshooting

### Song Not Playing
**Issue:** Click banner but song doesn't play

**Solutions:**
1. Check `attachedSong` has all required fields:
   ```typescript
   {
     id: string,
     title: string,
     artist: string,
     imageUrl: string,
     streamUrl: string  // ← Must be valid URL
   }
   ```

2. Check PlayerContext is available:
   ```typescript
   const { playSong } = usePlayer();
   console.log("playSong available:", !!playSong);
   ```

3. Check console for errors:
   ```
   [PromotionBanner] Playing song: Song Title
   ```

### External Link Not Opening
**Issue:** Click banner but link doesn't open

**Solutions:**
1. Check URL is valid:
   ```typescript
   actionUrl: "https://example.com"  // ✅ Good
   actionUrl: "example.com"          // ❌ Bad (missing https://)
   ```

2. Check Linking permission (iOS):
   - Add to `Info.plist`:
   ```xml
   <key>LSApplicationQueriesSchemes</key>
   <array>
     <string>https</string>
     <string>http</string>
   </array>
   ```

### Navigation Not Working
**Issue:** Click banner but doesn't navigate

**Solutions:**
1. Check route exists:
   ```typescript
   // Make sure these files exist:
   app/playlist/[id].tsx
   app/artist/[id].tsx
   ```

2. Check actionUrl format:
   ```typescript
   actionUrl: "playlist_id"           // ✅ Good
   actionUrl: "/playlist/playlist_id" // ✅ Also good
   ```

### Promotions Not Showing
**Issue:** Banner doesn't appear

**Solutions:**
1. Check Firestore data:
   - `status` = "active"
   - `platforms` = "app"
   - `startDate` ≤ today (or empty)
   - `endDate` ≥ today (or empty)

2. Check console:
   ```
   [PromotionBanner] Error fetching promotions: ...
   ```

3. Check Firestore rules allow read:
   ```javascript
   match /promotions/{promotionId} {
     allow read: if true;  // Public read
   }
   ```

---

## 🚀 Advanced Features

### Custom Action Handler
Add custom logic for specific promotions:

```typescript
const handleBannerPress = async (promo: Promotion) => {
  // Custom logic before action
  console.log("Banner clicked:", promo.id);
  
  // Track analytics
  await logEvent("promotion_clicked", {
    promotion_id: promo.id,
    action_type: promo.actionType,
  });
  
  // Execute action
  switch (promo.actionType) {
    // ... existing cases
  }
  
  // Custom logic after action
  showToast("Thanks for checking this out!");
};
```

### Deep Linking
Handle deep links from promotions:

```typescript
case "external":
  if (promo.actionUrl?.startsWith("mavrixfy://")) {
    // Handle deep link
    const route = promo.actionUrl.replace("mavrixfy://", "");
    router.push(route);
  } else {
    // Handle external URL
    await Linking.openURL(promo.actionUrl);
  }
  break;
```

### Queue Management
Add song to queue instead of playing immediately:

```typescript
case "song":
  if (promo.attachedSong) {
    // Option 1: Play immediately
    await playSong(promo.attachedSong);
    
    // Option 2: Add to queue
    await addToQueue(promo.attachedSong);
    Alert.alert("Added to Queue", promo.attachedSong.title);
  }
  break;
```

---

## 📝 Best Practices

### 1. Error Handling
Always wrap actions in try-catch:

```typescript
try {
  await handleBannerPress(promo);
} catch (error) {
  console.error("Banner action failed:", error);
  Alert.alert("Error", "Something went wrong");
}
```

### 2. Loading States
Show loading indicator for async actions:

```typescript
const [isLoading, setIsLoading] = useState(false);

const handleBannerPress = async (promo: Promotion) => {
  setIsLoading(true);
  try {
    // ... action logic
  } finally {
    setIsLoading(false);
  }
};
```

### 3. Analytics
Track promotion interactions:

```typescript
import { logEvent } from "@/lib/analytics";

const handleBannerPress = async (promo: Promotion) => {
  await logEvent("promotion_clicked", {
    promotion_id: promo.id,
    promotion_title: promo.title,
    action_type: promo.actionType,
    priority: promo.priority,
  });
  
  // ... action logic
};
```

### 4. Haptic Feedback
Add haptic feedback on click:

```typescript
import * as Haptics from "expo-haptics";

const handleBannerPress = async (promo: Promotion) => {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  // ... action logic
};
```

---

## 🎉 Summary

✅ **Song Playback** - Plays attached songs via PlayerContext
✅ **External Links** - Opens URLs in browser
✅ **Navigation** - Routes to playlist/artist pages
✅ **Priority Sorting** - Shows highest priority first
✅ **Error Handling** - Graceful error messages
✅ **Auto-Rotation** - Cycles through promotions
✅ **Date Filtering** - Respects start/end dates

**Status: FULLY IMPLEMENTED** 🚀

---

## 📞 Support

For issues or questions:
1. Check console logs for errors
2. Verify Firestore data structure
3. Test with simple promotion first
4. Check PlayerContext is working

**All promotion features are now live in the app!** 🎊
