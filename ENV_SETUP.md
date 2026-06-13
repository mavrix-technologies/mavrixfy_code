# Environment Configuration Guide

## Available Environment Files

- **`.env.development`** - Local development with localhost:8000
- **`.env.production`** - Production with Vercel API
- **`.env`** - Active configuration (git ignored)

## Quick Switch Commands

### Switch to Development Mode
```bash
# Windows
copy .env.development .env

# Mac/Linux
cp .env.development .env
```

**Then restart your development server:**
```bash
npm start
```

### Switch to Production Mode
```bash
# Windows
copy .env.production .env

# Mac/Linux
cp .env.production .env
```

**Then restart your development server:**
```bash
npm start
```

## Configuration Details

### Development Mode (`.env.development`)
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000
```

**Requirements:**
- Python YouTube Music API running locally
- Start with: `cd youtube-music-api && python main.py`
- Works on localhost/simulator

**For Physical Devices:**
Update to your local IP:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://192.168.1.6:8000
```

### Production Mode (`.env.production`)
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

**Requirements:**
- None! Works everywhere
- No local server needed
- Works on any network

## Manual Configuration

You can also manually edit `.env` file:

```env
# Development - Local Server
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000

# Production - Vercel API
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
```

## Important Notes

1. **Always restart** your development server after changing `.env`
2. **Never commit** `.env` file (it's in `.gitignore`)
3. **Do commit** `.env.development` and `.env.production` as templates
4. **No hardcoded URLs** - everything is controlled by `.env`

## Build Configurations

### Development Build (EAS)
```bash
eas build --profile development
```
Uses `.env.development` configuration

### Production Build (EAS)
```bash
eas build --profile production
```
Uses `.env.production` configuration

## Troubleshooting

### "API URL is not set" Error
**Problem:** `.env` file is missing or `EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL` is empty

**Solution:**
```bash
# Copy from template
copy .env.production .env

# Restart
npm start
```

### Local Server Not Working on Physical Device
**Problem:** `localhost:8000` doesn't work on physical device

**Solution:** Use your computer's local IP:
1. Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Update `.env`:
   ```env
   EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://YOUR_IP:8000
   ```
3. Restart both Python server and React Native

### Android Emulator Connection Issues
**Problem:** Can't connect to localhost:8000

**Solution:** Use Android emulator's special IP:
```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://10.0.2.2:8000
```

## Architecture

```
Mobile App
    ↓
.env configuration
    ↓
├── Development: http://localhost:8000
│       ↓
│   Python YouTube Music API (Local)
│       ↓
│   ytmusicapi → YouTube Music
│
└── Production: https://mavrixfy-api-drab.vercel.app/api/youtube-music
        ↓
    Node.js Backend (Vercel)
        ↓
    Python YouTube Music API (Vercel)
        ↓
    ytmusicapi → YouTube Music
```

## Current Default

By default, `.env` is set to **production mode** for easier deployment.

To use development mode:
```bash
copy .env.development .env
npm start
```
