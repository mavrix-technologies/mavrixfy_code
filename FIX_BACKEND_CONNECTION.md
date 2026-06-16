# 🔧 Fix Backend Connection - Network Request Failed

## 🔴 Current Issue
```
ERROR [LyricsService] Error fetching lyrics
error: [TypeError: Network request failed]
url: "http://192.168.1.11:8000/lyrics/video/s4nIxLvW1Zo"
```

## ✅ Solutions (Try in Order)

---

### Solution 1: Check if Backend is Running ⭐ MOST COMMON

**Check if Python backend is running:**

```bash
# Open a new terminal
cd youtube-music-api
python main.py
```

**Expected output:**
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**If NOT running:**
- Start the backend with the command above
- Keep the terminal open while using the app

---

### Solution 2: Verify IP Address

**Your current IP:** `192.168.1.11`

**Check if this is correct:**

**On Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" under your WiFi/Ethernet adapter.

**On Mac/Linux:**
```bash
ifconfig
# or
ip addr show
```

**Update .env.development if IP changed:**
```bash
# Use your actual computer IP
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://YOUR_ACTUAL_IP:8000
```

Then restart the app:
```bash
# In your app terminal, press 'r' to reload
```

---

### Solution 3: Test Backend Directly

**From your computer's browser:**
```
http://192.168.1.11:8000/api/healthz
```

**Expected response:**
```json
{"status": "ok"}
```

**If this works but app doesn't:**
- Device and computer must be on same WiFi network
- Check firewall settings (Solution 4)

**If this doesn't work:**
- Backend is not running on port 8000
- IP address is wrong
- Use Solution 1 and 2

---

### Solution 4: Check Firewall

**Windows Firewall might be blocking port 8000.**

**Quick test - Temporarily disable firewall:**
1. Windows Security → Firewall & network protection
2. Turn off temporarily
3. Try the app again

**Permanent fix - Add firewall rule:**
```powershell
# Run PowerShell as Administrator
New-NetFirewallRule -DisplayName "Python Backend" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

---

### Solution 5: Use Localhost (iOS Simulator Only)

**If using iOS Simulator (NOT physical device):**

Update `.env.development`:
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

Restart app.

---

### Solution 6: Use Android Emulator Address

**If using Android Emulator (NOT physical device):**

Update `.env.development`:
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://10.0.2.2:8000
```

Restart app.

---

### Solution 7: Change Backend Port

**If port 8000 is already in use:**

**Start backend on different port:**
```bash
cd youtube-music-api
python main.py --port 8001
```

**Update .env.development:**
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.11:8001
```

---

### Solution 8: Check Same WiFi Network

**Ensure both devices are on the same network:**

**On your computer:**
```cmd
ipconfig
```
Note the WiFi name/SSID.

**On your phone/simulator:**
- Settings → WiFi
- Check connected network matches computer

**If different:**
- Connect both to the same WiFi
- Restart both devices

---

## 🧪 Quick Test Checklist

Run these tests in order:

### 1. ✅ Backend Running?
```bash
cd youtube-music-api
python main.py
```
Should see: "Uvicorn running on http://0.0.0.0:8000"

### 2. ✅ Backend Health Check?
Open browser: `http://localhost:8000/api/healthz`
Should see: `{"status": "ok"}`

### 3. ✅ From Network?
Open browser: `http://192.168.1.11:8000/api/healthz`
Should see: `{"status": "ok"}`

### 4. ✅ Lyrics Endpoint?
Open browser: `http://192.168.1.11:8000/api/lyrics/video/s4nIxLvW1Zo`
Should see JSON with lyrics data or error

### 5. ✅ App Configuration?
Check `.env.development` has correct IP and port

### 6. ✅ Reload App?
In terminal where app is running, press `r` to reload

---

## 🎯 Most Common Solution

**99% of the time, it's one of these:**

1. **Backend not running** → `python main.py`
2. **Wrong IP address** → Check `ipconfig` and update .env
3. **Different WiFi networks** → Connect both to same network
4. **Firewall blocking** → Add firewall rule or temporarily disable

---

## 📱 Device-Specific Settings

### Physical iPhone/iPad:
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://YOUR_COMPUTER_IP:8000
```

### iOS Simulator:
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

### Physical Android:
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://YOUR_COMPUTER_IP:8000
```

### Android Emulator:
```bash
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://10.0.2.2:8000
```

---

## 🔍 Debug Mode

**Start backend with verbose logging:**
```bash
cd youtube-music-api
python main.py --log-level debug
```

**Check app logs:**
Look for this line:
```
DEBUG [LyricsService] Fetching lyrics from {
  "url": "http://192.168.1.11:8000/lyrics/video/..."
}
```

If URL is wrong, update .env and reload app.

---

## ✅ When It's Working

**You should see these logs:**

**Backend terminal:**
```
INFO:     192.168.1.X:XXXXX - "GET /api/lyrics/video/s4nIxLvW1Zo HTTP/1.1" 200 OK
```

**App logs:**
```
DEBUG [LyricsService] Fetching lyrics from...
INFO  [LyricsService] Successfully fetched lyrics
      linesCount: 45
      isTimeSynced: true
```

---

## 🆘 Still Not Working?

### Try Production URL (Temporary):

Update `.env.development`:
```bash
# Temporary fallback to production
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

Reload app. This uses the production backend to test if lyrics feature works.

**Note:** Production backend may be slower or have rate limits.

---

## 📞 Quick Help Commands

**Find your IP:**
```cmd
ipconfig | findstr IPv4
```

**Check port 8000:**
```cmd
netstat -ano | findstr :8000
```

**Kill process on port 8000:**
```cmd
# Find PID from netstat output
taskkill /PID <PID> /F
```

**Test backend from command line:**
```bash
curl http://192.168.1.11:8000/api/healthz
```

---

## 🎉 Success Indicators

When everything is working:

1. ✅ Backend shows incoming requests in terminal
2. ✅ App logs show "Successfully fetched lyrics"
3. ✅ Lyrics modal opens with text
4. ✅ No "Network request failed" errors

---

**Next Step:** Choose the solution that matches your setup and try it! 🚀
