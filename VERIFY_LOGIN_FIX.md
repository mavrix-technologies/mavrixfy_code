# Verify Login Screen Fix

## Quick Test Steps

### 1. Test Login Screen (Before Logging In)
```
1. Uninstall app completely
2. Install fresh APK
3. Open app
4. Should see login screen
5. Try these:
   ✓ Tap email field - should focus
   ✓ Tap password field - should focus  
   ✓ Tap "Log In" button - should work
   ✓ Tap "Continue with Google" - should work
   ✓ Tap "Continue as Guest" - should work
   ✓ Look at bottom of screen - NO queue sheet visible
   ✓ No gray/transparent overlay blocking touches
```

### 2. Test Queue Sheet (After Logging In)
```
1. Log in or continue as guest
2. Go to home screen
3. Play a song
4. Go to player screen
5. Tap queue icon - sheet should open
6. Sheet should slide up from bottom
7. Can drag to close
8. Can tap backdrop to close
```

### 3. Test Logout → Login Again
```
1. Open app (logged in)
2. Go to settings
3. Tap "Logout"
4. Should see login screen
5. Verify login screen is fully accessible
6. Log back in
7. Queue sheet should work again
```

## Expected Behavior

### ✅ On Login Screen
- **NO queue sheet** visible
- **NO backdrop** overlay
- **ALL buttons** clickable
- **ALL input fields** accessible
- **Clean UI** with no blocking elements

### ✅ After Login
- **Queue sheet** available
- **Opens on tap** queue button
- **Closes properly** via drag or backdrop tap
- **Smooth animations**
- **No interference** with other UI elements

## Debug Commands

If issue persists, try these:

### Check React DevTools
```bash
# In development mode
npx react-devtools

# Look for:
- QueueBottomSheet component
- Check if it's rendered on login screen
- Check z-index values
- Check pointerEvents values
```

### Check Logs
```bash
# Android
adb logcat | grep -i "queue\|login\|sheet"

# Look for:
- Queue sheet mount/unmount logs
- Pointer event warnings
- Touch event issues
```

### Test Different Android Versions
- Android 14 (API 34)
- Android 13 (API 33)
- Android 12 (API 31)
- Android 11 (API 30)
- Android 10 (API 29)
- Android 9 (API 28)

## Common Issues & Solutions

### Issue: Login still blocked
**Solution:** Clean build and reinstall
```bash
cd Mavrixfy_App
rm -rf node_modules
npm install
eas build --platform android --profile production --clear-cache
```

### Issue: Queue sheet not appearing after login
**Solution:** Check if `unmountNavBar` logic is correct
```typescript
// Should be FALSE on home screen
const unmountNavBar = NAV_UNMOUNT_SEGMENTS.has(activeSegment);
```

### Issue: Queue sheet appears on wrong screens
**Solution:** Check NAV_UNMOUNT_SEGMENTS
```typescript
const NAV_UNMOUNT_SEGMENTS = new Set([
  "login", 
  "onboarding", 
  "import-songs", 
  "downloads", 
  "player"
]);
```

## Build for Testing

### Development Build
```bash
cd Mavrixfy_App
npm start
# Test on physical device or emulator
```

### Production Build (EAS)
```bash
cd Mavrixfy_App
eas build --platform android --profile production
```

### Local APK Build
```bash
cd Mavrixfy_App/android
./gradlew assembleRelease
# APK at: android/app/build/outputs/apk/release/app-release.apk
```

## Verification Checklist

- [ ] ✅ Can access login screen
- [ ] ✅ Can tap all login buttons
- [ ] ✅ Can type in email field
- [ ] ✅ Can type in password field
- [ ] ✅ No queue sheet visible on login
- [ ] ✅ No transparent overlay
- [ ] ✅ Can complete Google sign-in
- [ ] ✅ Can continue as guest
- [ ] ✅ Queue sheet works after login
- [ ] ✅ Queue sheet opens/closes properly
- [ ] ✅ Can drag songs in queue
- [ ] ✅ Can swipe to remove songs
- [ ] ✅ Logout shows clean login screen
- [ ] ✅ Login again shows clean experience

## Report Results

### If Fixed ✅
```
Login screen: ✅ Fully accessible
Queue sheet: ✅ Works after login
No interference: ✅ Confirmed
Build number: v2.6.1
Android version: API XX
Device: XXXXX
```

### If Still Broken ❌
```
Issue: [describe what's still wrong]
Steps to reproduce:
1. 
2. 
3. 

Screenshots: [attach]
Logs: [paste relevant logs]
Device info: [model, Android version]
```

## Final Check Before Release

```bash
# 1. Version bump
# Update in app.json: "version": "2.6.1"

# 2. Build
eas build --platform android --profile production

# 3. Test on multiple devices
# - Samsung Galaxy S21 (Android 14)
# - Pixel 6 (Android 13)  
# - OnePlus 9 (Android 12)

# 4. Upload to Play Store
# Internal testing track first
# Then production after verification

# 5. Monitor crash reports
# Check Firebase Crashlytics
# Check Play Store crash reports
```

## Success Criteria

✅ **Zero login blocking issues reported**  
✅ **Queue sheet works normally after login**  
✅ **No new crashes related to the fix**  
✅ **User reviews improve (no login complaints)**  
✅ **Clean crash-free rate maintained**  

If all checks pass, the fix is successful! 🎉
