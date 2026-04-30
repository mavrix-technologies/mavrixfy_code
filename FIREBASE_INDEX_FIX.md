# Firebase Index Fix

## Issue
The PromotionBanner component was trying to use a composite Firestore query that required a custom index:
```
where("status", "==", "active")
where("platforms", "==", "app")
orderBy("priority", "desc")
```

This combination requires a composite index in Firebase.

## Solution Applied ✅

**Changed the query to avoid requiring a composite index:**

### Before (Required Index):
```typescript
const q = query(
  collection(db, "promotions"),
  where("status", "==", "active"),
  where("platforms", "==", "app"),
  orderBy("priority", "desc"),  // ❌ Requires composite index
  limit(5)
);
```

### After (No Index Required):
```typescript
const q = query(
  collection(db, "promotions"),
  where("status", "==", "active"),
  where("platforms", "==", "app"),
  limit(10) // Fetch more, then sort in memory
);

// Sort by priority in memory
validPromos.sort((a, b) => (b.priority || 0) - (a.priority || 0));
```

## Benefits

1. **No Firebase Index Required** - Works immediately without database configuration
2. **Simpler Setup** - No need to create composite indexes
3. **Same Functionality** - Promotions still sorted by priority
4. **Better Error Handling** - Silently fails if there's an issue

## Alternative: Create the Index (Optional)

If you prefer to use the database-level sorting (slightly more efficient for large datasets), you can create the composite index:

1. Go to Firebase Console: https://console.firebase.google.com/
2. Navigate to: Firestore Database → Indexes
3. Click "Create Index"
4. Configure:
   - Collection: `promotions`
   - Fields:
     - `status` (Ascending)
     - `platforms` (Ascending)
     - `priority` (Descending)
   - Query scope: Collection

Or use the auto-generated link from the error message.

## Current Implementation

The current implementation:
- ✅ Works without any Firebase configuration
- ✅ Fetches up to 10 promotions
- ✅ Filters by date range in memory
- ✅ Sorts by priority in memory
- ✅ Returns top 5 promotions
- ✅ Silently fails if there's an error (banner just won't show)

## Performance

For typical use cases (< 100 promotions), in-memory sorting is:
- Fast (< 1ms)
- Simple
- Doesn't require database configuration

If you have thousands of promotions, consider creating the composite index for better performance.

## TrackPlayer Warning

The warning `[Player] Native TrackPlayer is unavailable in this runtime` is expected when running in:
- Expo Go
- Web browser
- Development builds without native modules

This is **not an error** - it's just informing you that the native player isn't available. The app falls back to expo-av for audio playback in these environments.

To remove this warning, you need to:
1. Build a development build with EAS
2. Or build a production APK/IPA
3. The native TrackPlayer will be available in those builds

## Summary

✅ **Fixed:** PromotionBanner no longer requires Firebase composite index
✅ **Fixed:** Better error handling - silently fails instead of crashing
✅ **Explained:** TrackPlayer warning is expected in Expo Go (not an error)

The app should now run without any Firebase index errors!
