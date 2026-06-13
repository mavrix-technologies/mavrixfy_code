# 🚀 Deploy YouTube Music API to Vercel

## Current Status
- ✅ Your Node.js backend is deployed: https://mavrixfy-api-drab.vercel.app/
- ❌ YouTube Music API (Python) needs to be deployed
- ❌ Backend trying to connect to localhost:8000 (won't work in production)

## Deploy Python API

### Step 1: Deploy to Vercel

```bash
cd Mavrixfy_App/youtube-music-api
vercel --prod
```

**Vercel will:**
1. Detect it's a Python project
2. Install dependencies from `requirements.txt`
3. Deploy `main.py` as a serverless function
4. Give you a URL like: `https://youtube-music-api-xxx.vercel.app`

### Step 2: Test Deployed API

After deployment, test it:
```bash
curl https://your-youtube-api.vercel.app/healthz
```

Should return:
```json
{"status":"ok"}
```

### Step 3: Update Backend Environment Variable

On Vercel dashboard for your **Node.js backend** (mavrixfy-api-drab):

1. Go to: https://vercel.com/dashboard
2. Select your backend project: `mavrixfy-api-drab`
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   ```
   Name: YOUTUBE_MUSIC_API_BASE_URL
   Value: https://your-youtube-api.vercel.app
   ```
5. **Redeploy** the backend

### Step 4: Test Integration

```bash
curl https://mavrixfy-api-drab.vercel.app/api/youtube-music/health
```

Should return:
```json
{
  "success": true,
  "service": "YouTube Music API",
  "available": true
}
```

### Step 5: Test Unified Search

```bash
curl "https://mavrixfy-api-drab.vercel.app/api/music/search/all?query=test&limit=5"
```

Should return results from both JioSaavn AND YouTube Music!

## Alternative: Railway Deployment

If you prefer Railway (better for Python):

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 2: Login
```bash
railway login
```

### Step 3: Deploy
```bash
cd Mavrixfy_App/youtube-music-api
railway init
railway up
```

Railway will give you a URL like: `https://youtube-music-api.railway.app`

### Step 4: Update Backend Environment Variable
Same as Vercel steps above, but use Railway URL.

## Quick Commands

### Deploy to Vercel
```bash
cd Mavrixfy_App/youtube-music-api
vercel login
vercel --prod
```

### Update Backend on Vercel
1. Copy the deployed YouTube API URL
2. Go to https://vercel.com/dashboard
3. Select `mavrixfy-api-drab` project
4. Settings → Environment Variables
5. Add: `YOUTUBE_MUSIC_API_BASE_URL=<your-python-api-url>`
6. Redeploy

### Test
```bash
# Test Python API
curl https://your-youtube-api.vercel.app/healthz

# Test Backend Integration
curl https://mavrixfy-api-drab.vercel.app/api/youtube-music/health

# Test Unified Search
curl "https://mavrixfy-api-drab.vercel.app/api/music/search/all?query=arijit&limit=5"
```

## Expected Result

After deployment, you should have:

```
Mobile App / Web Client
         ↓
Node.js Backend (Vercel)
https://mavrixfy-api-drab.vercel.app
         ↓
   ┌────────────────┐
   ↓                ↓
JioSaavn API   YouTube Music API (Vercel)
(Existing)     https://your-youtube-api.vercel.app
```

Both APIs accessible in production! 🎉
