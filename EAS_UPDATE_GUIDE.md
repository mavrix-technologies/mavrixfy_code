# EAS Update Guide - OTA Updates

Your app is already configured for EAS Updates! Here's how to push Over-The-Air (OTA) updates.

## ✅ Current Configuration

Your app has:
- **Updates URL**: `https://u.expo.dev/93293119-93b7-4dbb-acdd-7241771254c4`
- **Runtime Version**: `2.1.1`
- **Check Automatically**: `ON_ERROR_RECOVERY`
- **Channels**: `production`, `preview`

## 🚀 How to Push OTA Updates

### 1. Make Code Changes
Edit your JavaScript/TypeScript code (UI, logic, etc.)

**What CAN be updated OTA:**
- ✅ JavaScript/TypeScript code
- ✅ React components
- ✅ Styles and layouts
- ✅ Images and assets
- ✅ App logic and business rules

**What CANNOT be updated OTA:**
- ❌ Native code changes (iOS/Android)
- ❌ New native dependencies
- ❌ App version or build number
- ❌ Permissions or capabilities

### 2. Publish Update to Production

```bash
# Publish to production channel
eas update --branch production --message "Fix navigation bar on iOS"
```

### 3. Publish Update to Preview (Testing)

```bash
# Publish to preview channel for testing
eas update --branch preview --message "Testing new feature"
```

## 📱 How Users Get Updates

### Automatic Updates:
Your app checks for updates:
- **ON_ERROR_RECOVERY**: Only checks when app crashes or has errors
- Updates download in background
- Applied on next app restart

### Manual Check (Optional):
You can add a button in settings to manually check for updates.

## 🔄 Update Workflow

### Step-by-Step Process:

1. **Make Changes**
   ```bash
   # Edit your code
   # For example: fix the iOS navigation bar issue
   ```

2. **Test Locally**
   ```bash
   npx expo start
   ```

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "Fix iOS navigation bar"
   git push origin master
   ```

4. **Publish Update**
   ```bash
   # For production users
   eas update --branch production --message "Fix iOS navigation bar"
   
   # Or for preview/testing
   eas update --branch preview --message "Testing iOS navigation fix"
   ```

5. **Verify Update**
   - Check Expo dashboard: https://expo.dev/accounts/satvik1234/projects/mavrixfy/updates
   - Users will get update on next app restart

## 📊 View Updates Dashboard

Visit: https://expo.dev/accounts/satvik1234/projects/mavrixfy/updates

You can see:
- All published updates
- Which users downloaded them
- Update statistics
- Rollback options

## 🎯 Common Commands

### Publish to Production
```bash
eas update --branch production --message "Your update message"
```

### Publish to Preview
```bash
eas update --branch preview --message "Testing new feature"
```

### Publish with Auto Message
```bash
eas update --auto
```

### View Update History
```bash
eas update:list --branch production
```

### Rollback to Previous Update
```bash
eas update:rollback --branch production
```

## 🔧 Update Configuration

Your current settings in `app.json`:

```json
{
  "updates": {
    "url": "https://u.expo.dev/93293119-93b7-4dbb-acdd-7241771254c4",
    "checkAutomatically": "ON_ERROR_RECOVERY",
    "fallbackToCacheTimeout": 0
  },
  "runtimeVersion": "2.1.1"
}
```

### Change Update Check Behavior:

**Option 1: Check on App Launch (Recommended)**
```json
"checkAutomatically": "ON_LOAD"
```

**Option 2: Check on Error Only (Current)**
```json
"checkAutomatically": "ON_ERROR_RECOVERY"
```

**Option 3: Never Check Automatically**
```json
"checkAutomatically": "NEVER"
```

## 🚨 Important Notes

### Runtime Version:
- Your app has `runtimeVersion: "2.1.1"`
- Updates only work for apps with **matching runtime version**
- If you change native code, you must:
  1. Increment runtime version
  2. Build new IPA/APK
  3. Users must install new build

### When to Build New IPA/APK:
Build new binary when you:
- Add/remove native dependencies
- Change native code
- Update Expo SDK version
- Change app permissions
- Modify native configurations

### When to Use OTA Update:
Use OTA update when you:
- Fix bugs in JavaScript code
- Update UI/styles
- Change app logic
- Update text/content
- Fix the iOS navigation bar issue ✅

## 📝 Example: Fix iOS Navigation Bar

Since you just fixed the iOS navigation bar issue, here's how to push it:

```bash
# 1. Commit your changes
git add app/(tabs)/_layout.tsx
git commit -m "Fix: Force iOS to use native navigation tabs"
git push origin master

# 2. Publish OTA update
eas update --branch production --message "Fix iOS navigation bar to use native tabs"

# 3. Check status
eas update:list --branch production
```

Users will get this fix on their next app restart without needing to reinstall!

## 🎁 Bonus: Add Manual Update Check

Add this to your settings screen:

```typescript
import * as Updates from 'expo-updates';

async function checkForUpdates() {
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } else {
      alert('App is up to date!');
    }
  } catch (error) {
    alert('Error checking for updates');
  }
}
```

## 📚 Resources

- [EAS Update Documentation](https://docs.expo.dev/eas-update/introduction/)
- [Your Updates Dashboard](https://expo.dev/accounts/satvik1234/projects/mavrixfy/updates)
- [Update Best Practices](https://docs.expo.dev/eas-update/best-practices/)

## 🎯 Quick Start

To push your iOS navigation fix right now:

```bash
eas update --branch production --message "Fix iOS navigation bar"
```

That's it! Your users will get the update automatically.
