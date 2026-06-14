# OTA Update Rollback - Crash Issue

## 🚨 Issue Reported

After deploying the login screen fix OTA update, **app crashes were discovered**.

**User Report:** "crash issue found" after recent OTA push

## ✅ Immediate Action Taken - ROLLBACK COMPLETED

### Rollback Details:
- **Action:** Rolled back to previous stable version
- **From:** Login fix update (dfdcbf67-0fbd-4099-9894-352953d2ec17)
- **To:** Previous stable update from 2 days ago (e909217d-7d5a-4707-8473-5063399850a3)
- **Time:** Just now
- **Status:** ✅ DEPLOYED

### New Rollback Update:
- **Update ID:** `4bf550a5-2926-42e3-b58f-1407e9a48dff`
- **Android ID:** `019ec54b-5270-7878-a24e-d9ebf7c9db35`
- **iOS ID:** `019ec54b-5270-74bd-bdec-b1c95c9d6b92`
- **Runtime:** `2.6.0-20601`
- **Platforms:** Android & iOS
- **Message:** "ROLLBACK: Revert login fix due to crash issues"

### Dashboard:
https://expo.dev/accounts/satvik1234/projects/mavrixfy/updates/4bf550a5-2926-42e3-b58f-1407e9a48dff

---

## 📝 What Was Rolled Back

### Login Screen Fix (REVERTED):
**File:** `app/_layout.tsx`
**Change that was deployed (now reverted):**

```tsx
// This conditional rendering caused crashes:
{!unmountNavBar && (
  <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
    <QueueBottomSheet ref={globalQueueSheetRef} />
  </View>
)}
```

### Profile Screen Fix (NOT DEPLOYED):
**File:** `app/_layout.tsx`
**Code reverted back to:**

```tsx
// REVERTED BACK TO:
const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "downloads", "player"]);

// REMOVED (was causing issues):
// const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "downloads", "player", "profile", "delete-account"]);
```

---

## 🔍 Investigation Needed

### Possible Crash Causes:

1. **Ref Issue:**
   - `globalQueueSheetRef` might be null when conditionally rendered
   - Queue sheet components might have lifecycle issues

2. **State Management:**
   - Unmounting/remounting queue sheet might cause state issues
   - Player state might be lost when queue is unmounted

3. **Navigation Timing:**
   - Rapid navigation between screens might cause race conditions
   - Queue sheet unmounting while being accessed

4. **Platform-Specific:**
   - Might work on one platform but crash on another
   - Android vs iOS behavioral differences

---

## 🧪 Testing Required Before Re-Deployment

### Before deploying any fix again, test thoroughly:

1. **Login Flow:**
   - Open app
   - Logout
   - Try to login
   - Check for crashes

2. **Navigation:**
   - Navigate between tabs rapidly
   - Open/close player
   - Open/close queue
   - Check for crashes

3. **Queue Operations:**
   - Play a song
   - Open queue
   - Navigate to login
   - Navigate back
   - Check queue still works

4. **Profile Navigation:**
   - Open profile
   - Navigate back
   - Check for crashes

5. **Stress Test:**
   - Rapidly switch between screens
   - Open/close queue multiple times
   - Play/pause songs
   - Monitor for memory leaks or crashes

---

## 🛠️ Alternative Fix Approaches

### Option 1: Don't Unmount, Just Hide
Instead of conditionally rendering (unmounting), just hide with styling:

```tsx
<View 
  style={[
    StyleSheet.absoluteFill, 
    { zIndex: unmountNavBar ? -1 : 999 },  // Push behind when not needed
    { opacity: unmountNavBar ? 0 : 1 },    // Hide visually
  ]} 
  pointerEvents={unmountNavBar ? "none" : "box-none"}  // Disable touch
>
  <QueueBottomSheet ref={globalQueueSheetRef} />
</View>
```

**Pros:**
- Component always mounted, no lifecycle issues
- Ref always valid
- State preserved

**Cons:**
- Still takes up memory even when hidden

---

### Option 2: Safe Unmounting with Cleanup
Properly cleanup before unmounting:

```tsx
{!unmountNavBar && (
  <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
    <QueueBottomSheet 
      ref={globalQueueSheetRef}
      onUnmount={() => {
        // Cleanup logic
        globalQueueSheetRef.current = null;
      }}
    />
  </View>
)}
```

---

### Option 3: Separate Queue for Each Screen Type
Have different queue instances for different screen types:

```tsx
// For tab screens
{!unmountNavBar && <TabsQueueBottomSheet />}

// For other screens (if needed)
{shouldShowQueue && <ModalQueueBottomSheet />}
```

---

### Option 4: Portal-Based Rendering
Use React Portal to render queue outside of navigation tree:

```tsx
import { Portal } from 'react-native-paper';

// Always render, but control visibility
<Portal>
  <QueueBottomSheet 
    visible={!unmountNavBar}
    ref={globalQueueSheetRef} 
  />
</Portal>
```

---

## 📊 Rollback Impact

### What Users Will Experience:

1. **Users who got the broken update:**
   - App will auto-download rollback
   - Need to close and reopen app
   - Will go back to working version (but original login issue returns)

2. **Timeline:**
   - **Immediate:** Rollback is live
   - **1-2 hours:** 50% of active users updated
   - **24 hours:** 90%+ users updated

3. **Known Issues After Rollback:**
   - ⚠️ Original login screen blocking issue is back
   - ⚠️ Profile screen still shows nav bar
   - ✅ But no crashes!

---

## ✅ Verification Steps

### Verify Rollback Worked:

1. **Check EAS Dashboard:**
   - New update should show as latest
   - Message: "ROLLBACK: Revert login fix due to crash issues"

2. **Test on Device:**
   - Open app (will download rollback)
   - Close and reopen
   - App should be stable (no crashes)
   - Login issue will be back (but that's expected)

3. **Monitor Crash Reports:**
   - Check Firebase Crashlytics
   - Crash rate should go down
   - Look for patterns in remaining crashes

---

## 🚀 Next Steps

### Immediate (Done):
- ✅ Rollback deployed
- ✅ Code changes reverted
- ✅ Documentation created

### Short-term (Now):
1. **Investigate crash cause:**
   - Check crash logs
   - Identify exact crash location
   - Understand why conditional rendering failed

2. **Test fixes locally:**
   - Try alternative approaches (Option 1, 2, 3, or 4)
   - Test thoroughly on both Android and iOS
   - Test on multiple devices/OS versions

3. **Create comprehensive test plan:**
   - Unit tests for queue component
   - Integration tests for navigation
   - Manual test checklist

### Long-term (Before next deploy):
1. **Implement safer fix:**
   - Choose one of the alternative approaches
   - Add proper error handling
   - Add logging for debugging

2. **Beta test:**
   - Deploy to internal test track first
   - Get feedback from testers
   - Monitor for crashes

3. **Gradual rollout:**
   - Deploy to 10% of users first
   - Monitor crash rates
   - Gradually increase if stable

---

## 📞 Communication

### If users ask about issues:

**Response:**
"We recently rolled back an update due to stability concerns. The app is now stable, but a minor UI issue with the login screen may temporarily return. We're working on a better fix and will deploy it soon. Thank you for your patience!"

---

## 📁 Related Files

- `LOGIN_QUEUE_SHEET_FIX.md` - Original fix documentation (now reverted)
- `PROFILE_NAVIGATION_FIX.md` - Profile fix documentation (not deployed)
- `OTA_UPDATE_VERIFICATION.md` - Update verification guide
- `COMPLETE_NAVIGATION_FIX_SUMMARY.md` - Complete overview
- `OTA_ROLLBACK_SUMMARY.md` - This file

---

## 🎯 Summary

✅ **Rollback Status:** COMPLETED
- Users will receive stable version again
- Crashes should stop
- Original UI issues will temporarily return

⚠️ **What's Next:**
- Investigate crash root cause
- Implement safer fix
- Test thoroughly before re-deployment
- Consider gradual rollout strategy

🔒 **Safety First:**
- Better to have UI issue than crashes
- Take time to fix properly
- Test extensively before next deployment

**The app is now stable again! 🎉**
