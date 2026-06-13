# Verify YouTube Music Backend Setup

## Quick Backend Health Check

Run these commands to verify your backend is properly configured:

### 1. Check Node.js Backend Health
```bash
curl https://mavrixfy-api-drab.vercel.app/api/test/health
```

Expected: Status 200 OK

### 2. Check YouTube Music Proxy Health
```bash
curl https://mavrixfy-api-drab.vercel.app/api/youtube-music/health
```

**Expected Response:**
```json
{
  "success": true,
  "service": "YouTube Music API",
  "available": true,
  "status": {"status": "ok"}
}
```

**If you get an error:**
- ❌ The Python YouTube Music API might not be deployed
- ❌ The `YOUTUBE_MUSIC_API_BASE_URL` environment variable might not be set correctly

### 3. Test YouTube Music Search
```bash
curl "https://mavrixfy-api-drab.vercel.app/api/youtube-music/search?query=test&filter=songs&limit=3"
```

**Expected Response:**
```json
{
  "success": true,
  "source": "youtube-music",
  "results": [
    {
      "videoId": "...",
      "title": "...",
      "artists": [...]
    }
  ]
}
```

## If Backend Tests Fail

### Check Python API Deployment

1. **Verify Python API is deployed:**
   ```bash
   cd Mavrixfy_App/youtube-music-api
   cat .vercel/project.json
   ```
   
   Should show project ID. If not, deploy:
   ```bash
   vercel --prod
   ```

2. **Test Python API directly:**
   
   After deploying, you'll get a URL like: `https://youtube-music-api-xxx.vercel.app`
   
   Test it:
   ```bash
   curl https://youtube-music-api-xxx.vercel.app/healthz
   ```
   
   Expected: `{"status":"ok"}`

3. **Update Node.js Backend Environment Variable:**
   
   Go to: https://vercel.com/dashboard
   - Select `mavrixfy-api-drab` project
   - Settings → Environment Variables
   - Add or update:
     ```
     YOUTUBE_MUSIC_API_BASE_URL=https://youtube-music-api-xxx.vercel.app
     ```
   - Redeploy the backend

### Check Vercel Environment Variables

On Vercel dashboard for `mavrixfy-api-drab`:
1. Settings → Environment Variables
2. Verify these are set:
   - `YOUTUBE_MUSIC_API_BASE_URL` → Your Python API URL
   - `JIOSAAVN_API_BASE_URL` → `https://mavrixfy-song-api.vercel.app/api`
   - Firebase credentials (if using Firebase)

## Quick Deploy Commands

### Deploy Python YouTube Music API
```bash
cd Mavrixfy_App/youtube-music-api
vercel login
vercel --prod
# Note the URL you get
```

### Update Backend Environment Variable
After deploying Python API, update the Node.js backend:

**Option 1: Via Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Select `mavrixfy-api-drab`
3. Settings → Environment Variables
4. Update `YOUTUBE_MUSIC_API_BASE_URL`
5. Redeploy

**Option 2: Via CLI**
```bash
cd Mavrixfy-web/backend
vercel env add YOUTUBE_MUSIC_API_BASE_URL production
# Enter your Python API URL when prompted
vercel --prod
```

## Test Mobile App Config

In your mobile app, check the configuration:

```typescript
// This should log the production URL
import { getYouTubeMusicApiUrl } from '@/lib/api-config';
console.log('YouTube Music API URL:', getYouTubeMusicApiUrl());
```

Expected output:
```
YouTube Music API URL: https://mavrixfy-api-drab.vercel.app/api/youtube-music/
```

## Troubleshooting

### Backend returns 503 or "unavailable"
- Python API is not deployed or not responding
- Check Python API health: `curl https://your-python-api.vercel.app/healthz`
- Redeploy Python API if needed

### Backend returns 404
- Route might not be registered
- Check `backend/src/index.js` has: `app.use("/api/youtube-music", youtubeMusicRoutes);`

### Mobile app shows no YouTube content
- Check `.env` file has production URL
- Rebuild the mobile app after changing `.env`
- Check app.json has fallback URL in extra config

### CORS errors in browser
- Backend CORS is configured to allow your frontend domain
- Check `backend/src/index.js` CORS configuration

## Success Criteria

✅ Node.js backend health check passes  
✅ YouTube Music health endpoint returns `available: true`  
✅ YouTube Music search returns results  
✅ Mobile app displays YouTube Music content  
✅ Videos play correctly  
✅ Trending content loads  

If all checks pass, your backend is properly configured! 🎉
