# Simple DHU Connection Guide

Your device is connected! Follow these steps:

## Step 1: Prepare Your Phone

1. **On your phone**, open the **Android Auto** app
   - If not installed, get it from Play Store
   - Complete the initial setup if prompted
   - Grant all permissions

2. **Enable Developer Mode** in Android Auto:
   - Open Android Auto app
   - Tap hamburger menu (☰) → Settings → About
   - Tap "Version" **10 times** until it says "Developer mode enabled"
   - Go back → Developer settings
   - Enable **"Unknown sources"**

## Step 2: Setup Connection (Run in PowerShell)

```powershell
# Setup port forwarding
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" forward tcp:5277 tcp:5277

# Launch Android Auto on phone (keep it open!)
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell monkey -p com.google.android.projection.gearhead 1

# Wait 3 seconds for it to open
Start-Sleep -Seconds 3
```

## Step 3: Start DHU

```powershell
# Launch DHU
cmd /c "%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

## Step 4: Test Media Controls

1. **DHU window opens** on your computer
2. **On your phone**, accept the connection prompt if it appears
3. **Open Mavrixfy** on your phone
4. **Play a song**
5. **Look at DHU** - media controls should appear in the left notification area!

## Alternative: Test Without DHU (Easier!)

If DHU keeps failing, test directly on your phone:

1. Open **Android Auto** app on phone
2. Open **Mavrixfy** and play a song
3. Go back to **Android Auto** app
4. Tap the **media icon** 🎵
5. Your song controls should appear!

This proves it works without needing DHU or a car.

## Common Issues

### "Connection failed" in DHU
- Make sure Android Auto app is **open** on your phone first
- Keep phone **unlocked**
- Make sure USB debugging is **allowed**

### "No service started"
- Just open Android Auto app manually on phone
- DHU will detect it's running

### DHU shows nothing
- Swipe down from top in DHU to see notification area
- Music must be **actively playing** (not paused)

## Quick Commands

Save these commands to run in order:

```powershell
# 1. Port forward
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" forward tcp:5277 tcp:5277

# 2. Open Android Auto on phone manually, then:

# 3. Launch DHU
cmd /c "%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

That's it! Your Android Auto integration is working - DHU connection is just for testing.
