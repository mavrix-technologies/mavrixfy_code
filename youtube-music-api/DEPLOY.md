# 🚀 Deploy YouTube Music API to Vercel

## Quick Deploy

```bash
cd youtube-music-api
vercel deploy --prod
```

## What Was Fixed

✅ Removed `root_path="/api"` from FastAPI (conflicts with Vercel routing)
✅ Added comprehensive error handling with logging
✅ Added `nocheckcertificate` option to yt-dlp
✅ Better error messages for debugging
✅ Catches all exceptions properly

## Testing After Deploy

### Test Health Check
```bash
curl "https://mavrixfy-api-drab.vercel.app/api/healthz"
```

Expected:
```json
{"status":"ok"}
```

### Test Download Endpoint
```bash
curl "https://mavrixfy-api-drab.vercel.app/api/download/dQw4w9WgXcQ"
```

Expected:
```json
{
  "success": true,
  "data": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up...",
    "downloadUrl": "https://googlevideo.com/...",
    "format": "m4a"
  }
}
```

## If Deployment Fails

### Check Vercel Logs
```bash
vercel logs
```

### Common Issues:

1. **yt-dlp not installed**
   - Solution: Already in requirements.txt ✅

2. **Import error**
   - Check: All dependencies in requirements.txt
   - Run: `pip install -r requirements.txt` locally first

3. **Timeout on Vercel**
   - yt-dlp can take 2-3 seconds
   - Vercel free tier has 10s timeout (should be fine)

## Vercel Environment

- Python version: Auto-detected from runtime
- Timeout: 10 seconds (free tier)
- Memory: 1024 MB
- Region: Auto-selected based on your account

## After Successful Deploy

Your app will automatically use the new endpoint:
```
https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

The download feature will be available at:
```
https://mavrixfy-api-drab.vercel.app/api/download/{videoId}
```
