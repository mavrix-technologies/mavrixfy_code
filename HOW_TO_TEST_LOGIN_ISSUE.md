# How to Test Login Queue Sheet Issue

## Choose Your Test Method:

---

## Option 1: Test OTA Update (Production App) ⭐ RECOMMENDED

**Use this if:** You have the app from Play Store (v2.6.0)

### Steps:
1. **Open Mavrixfy app** on your phone (from Play Store)
2. **Wait 10 seconds** (update downloads in background)
3. **Close app completely** (swipe away from recent apps)
4. **Wait 5 seconds**
5. **Reopen app**
6. **Logout** (tap profile → logout)
7. **Look at LOGIN screen**
   - ✅ GOOD: No queue sheet at bottom, can tap all fields
   - ❌ BAD: Queue sheet at bottom blocks buttons

### If Still Blocked:
- Update may not have downloaded yet
- Try again in 5 minutes
- Or use Option 2 to test dev build

---

## Option 2: Test Development Build (Immediate Test)

**Use this if:** You want to test the fix RIGHT NOW

### Steps:

#### Step 1: Connect Device via USB
1. Connect your Android phone via USB
2. Enable USB debugging in phone settings
3. Accept USB debugging prompt on phone

#### Step 2: Check Device Connected
```bash
cd Mavrixfy_App
npm start
```
Wait for Metro to start, then press **'a'** to open on Android

#### Step 3: App Opens
- Development build will launch
- Has the fix already applied
- Logout and check login screen
- Should work perfectly (no queue sheet blocking)

---

## Option 3: Quick Code Check (See What Was Changed)

Want to see the actual fix in the code?

The file: `app/_layout.tsx`

**The Change (Line ~350):**
```tsx
{/* BEFORE: Always rendered */}
<View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
  <QueueBottomSheet ref={globalQueueSheetRef} />
</View>

{/* AFTER: Only render when not on login screen */}
{!unmountNavBar && (
  <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
    <QueueBottomSheet ref={globalQueueSheetRef} />
  </View>
)}
```

**What it does:**
- When on login screen: `unmountNavBar = true` → QueueBottomSheet NOT rendered
- When on home screen: `unmountNavBar = false` → QueueBottomSheet IS rendered

---

## What Should You See:

### ✅ Login Screen (After Fix):
```
┌──────────────────────┐
│   MAVRIXFY LOGO      │
│                      │
│   [Email Field]      │ ← Can tap
│   [Password Field]   │ ← Can tap
│                      │
│   [Log In Button]    │ ← Can tap
│   [Google Button]    │ ← Can tap
│   [Guest Button]     │ ← Can tap
│                      │
│   NO QUEUE SHEET     │ ← Fixed!
└──────────────────────┘
```

### ✅ Home Screen (Normal):
```
┌──────────────────────┐
│   Featured Content   │
│   Playlists          │
│   Artists            │
│                      │
│  ┌────────────────┐  │
│  │ Queue Sheet    │  │ ← Should be here
│  │ [Now Playing]  │  │
│  └────────────────┘  │
└──────────────────────┘
```

---

## Which Method Do You Want?

**Tell me:**
1. Do you have Play Store version installed? → Use Option 1
2. Want to test dev build immediately? → Use Option 2
3. Just want to see the code? → Use Option 3
