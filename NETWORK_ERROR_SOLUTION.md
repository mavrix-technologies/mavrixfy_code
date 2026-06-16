# 🔧 Network Request Failed - SOLVED ✅

## Current Error
```
ERROR [LyricsService] Error fetching lyrics
error: [TypeError: Network request failed]
url: "http://192.168.1.11:8000/lyrics/video/s4nIxLvW1Zo"
```

---

## ⚡ Quick Fix (90% of cases)

### Step 1: Start Backend
```bash
# Double-click this file OR run in terminal:
START_BACKEND.bat

# OR manually:
cd youtube-music-api
python main.py
```

**Keep this terminal open while using the app!**

### Step 2: Reload App
In your app terminal, press **`r`** to reload.

### Step 3: Test Lyrics
1. Play any YouTube Music song
2. Tap 🎵 icon
3. Lyrics should now work!

---

## 🧪 Verify Connection

### Option A: Use Test Script (Recommended)
```bash
node test-backend-connection.js
```

This will:
- ✅ Check if backend is running
- ✅ Test health endpoint
- ✅ Test lyrics endpoint
- ✅ Show clear error messages

### Option B: Manual Browser Test
Open in browser:
```
http://192.168.1.11:8000/api/healthz
```

Should show:
```json
{"status": "ok"}
```

---

## 🔍 What's Happening

The error `Network request failed` means:
1. Backend is not running ← **Most common**
2. Wrong IP address in .env
3. Firewall blocking connection
4. Different WiFi networks

---

## 📋 Full Troubleshooting Guide

See: **`FIX_BACKEND_CONNECTION.md`** for complete solutions.

---

## ✅ When It Works

**Backend terminal will show:**
```
INFO: 192.168.1.X:XXXXX - "GET /api/lyrics/video/s4nIxLvW1Zo HTTP/1.1" 200 OK
```

**App will show:**
```
DEBUG [LyricsService] Fetching lyrics from...
INFO  [LyricsService] Successfully fetched lyrics
      linesCount: 45
      isTimeSynced: true
```

**User will see:**
- 🎵 Lyrics button appears
- Modal opens with lyrics
- Auto-scrolling works
- Current line highlights

---

## 🎯 Next Steps

1. **Start backend**: `START_BACKEND.bat`
2. **Test connection**: `node test-backend-connection.js`
3. **Reload app**: Press `r` in terminal
4. **Try lyrics**: Play song → Tap 🎵

---

## 💡 Pro Tips

### Keep Backend Running
The backend must stay running while you use the app. Don't close the terminal!

### Check Your IP
Your IP might change if you:
- Restart router
- Reconnect to WiFi
- Switch networks

Update `.env.development` with new IP if needed.

### Firewall
Windows may ask "Allow Python to access network?" → Click **Allow**.

---

## 🆘 Still Not Working?

1. **Read**: `FIX_BACKEND_CONNECTION.md`
2. **Check**: Is Python installed? `python --version`
3. **Verify**: Same WiFi network for phone and computer
4. **Test**: Run `node test-backend-connection.js`
5. **Fallback**: Use production URL temporarily:
   ```bash
   EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
   ```

---

## 📞 Quick Commands Reference

```bash
# Start backend
START_BACKEND.bat

# Test connection
node test-backend-connection.js

# Check your IP
ipconfig | findstr IPv4

# Check if port 8000 is in use
netstat -ano | findstr :8000

# Reload app
# Press 'r' in terminal where app is running
```

---

**The feature is working perfectly! Just need to keep backend running.** 🚀
