# 🐍 Setup Python YouTube Music Backend

## What You Have

Your app uses a **Python FastAPI backend** with `ytmusicapi` (not Node.js).

Location: `youtube-music-api/`

## One-Time Setup

### Step 1: Run Setup Script

Double-click: **`youtube-music-api/setup.bat`**

Or manually:
```bash
cd youtube-music-api
setup.bat
```

This will:
1. Check Python installation
2. Create virtual environment
3. Install dependencies (FastAPI, ytmusicapi, uvicorn)

**Takes ~2-3 minutes**

### Step 2: Verify Setup

You should see:
```
[4/4] Setup complete!
```

## Running the Backend

### Quick Start

Double-click: **`youtube-music-api/start.bat`**

Or manually:
```bash
cd youtube-music-api
start.bat
```

### What You Should See

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Verify It's Working

### Option 1: Browser
Open: http://localhost:8000

Should show:
```json
{
  "service": "YouTube Music API",
  "status": "running",
  "ytmusic_initialized": true
}
```

### Option 2: API Docs
Open: http://localhost:8000/docs

You'll see interactive API documentation (Swagger UI)

### Option 3: Test Search
Open: http://localhost:8000/api/youtube-music/search?query=arijit&type=songs&limit=5

Should return JSON with search results

## API Endpoints

All endpoints start with `/api/youtube-music/`:

- `GET /api/youtube-music/search?query=...&type=songs&limit=20`
- `GET /api/youtube-music/song/{videoId}`
- `GET /api/youtube-music/playlist/{playlistId}`
- `GET /api/youtube-music/album/{albumId}`
- `GET /api/youtube-music/artist/{artistId}`
- `GET /api/youtube-music/stream/{videoId}`
- `GET /api/youtube-music/charts?country=US`
- `GET /api/youtube-music/lyrics/{browseId}`

## Troubleshooting

### Python Not Found

Install Python 3.8+ from: https://www.python.org/downloads/

Make sure to check "Add Python to PATH" during installation

### Setup Failed

Try manual setup:
```bash
cd youtube-music-api
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Port 8000 Already in Use

Stop other services using port 8000:
```bash
netstat -ano | findstr :8000
```

Or change the port in `main.py`:
```python
port = int(os.getenv("PORT", 8080))  # Use 8080 instead
```

Then update `.env`:
```
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.6:8080
```

### Import Errors

Reinstall dependencies:
```bash
cd youtube-music-api
venv\Scripts\activate
pip install --upgrade -r requirements.txt
```

## Next Steps

Once the backend is running:

1. **Keep the backend terminal open** (don't close it)
2. **Start your React Native app** in another terminal
3. **Test search** - should now include YouTube Music results!

## Stopping the Backend

Press **Ctrl+C** in the terminal running the backend

## Auto-Start on Windows

Create a shortcut:
1. Right-click desktop → New → Shortcut
2. Location: `E:\Mavrixfy\Mavrixfy_App\youtube-music-api\start.bat`
3. Name it "Start YouTube Music Backend"

Now you can double-click to start!

---

**Ready to start?** Run `youtube-music-api/setup.bat` first (one time only), then `start.bat` each time you want to use YouTube Music!
