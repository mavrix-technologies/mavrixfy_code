# YouTube Music API Backend

This is a Python FastAPI backend service that uses [ytmusicapi](https://github.com/sigma67/ytmusicapi) to provide YouTube Music data to the Mavrixfy React Native app.

## Features

- 🔍 Search for songs, albums, artists, and playlists
- 🎵 Get detailed track information
- 📀 Fetch album and playlist details
- 👤 Retrieve artist information
- 📊 Access trending/chart data
- 📝 Fetch lyrics (when available)

## Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)

### Setup

1. Navigate to the youtube-music-api directory:
```bash
cd youtube-music-api
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
```

3. Activate the virtual environment:
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - macOS/Linux:
     ```bash
     source venv/bin/activate
     ```

4. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the API

### Development Mode

```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Documentation

Once the server is running, visit:
- Interactive API docs: `http://localhost:8000/docs`
- Alternative docs: `http://localhost:8000/redoc`

## Endpoints

### Search
- `GET /api/search?q={query}&filter={filter}&limit={limit}`
  - Search for songs, albums, artists, or playlists
  - Filters: songs, videos, albums, artists, playlists

### Song Details
- `GET /api/song/{video_id}`
  - Get detailed information about a specific song

### Playlist
- `GET /api/playlist/{playlist_id}`
  - Get playlist details with tracks

### Album
- `GET /api/album/{album_id}`
  - Get album details with tracks

### Artist
- `GET /api/artist/{artist_id}`
  - Get artist details with top songs and albums

### Charts
- `GET /api/charts?country={country_code}`
  - Get trending/chart songs for a country (e.g., US, IN, GB)

### Watch Playlist
- `GET /api/watch/{video_id}`
  - Get related watch/radio queue for a song

### Lyrics
- `GET /api/lyrics/{browse_id}`
  - Get lyrics for a song

## Deployment Options

### Vercel (Recommended for easy deployment)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Create `vercel.json` in the youtube-music-api directory (already created)

3. Deploy:
```bash
vercel
```

### Railway

1. Create a Railway account at https://railway.app
2. Install Railway CLI:
```bash
npm install -g @railway/cli
```
3. Deploy:
```bash
railway login
railway init
railway up
```

### Heroku

1. Create a `Procfile` with:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

2. Deploy using Heroku CLI:
```bash
heroku create your-app-name
git push heroku main
```

### Docker

1. Build the image:
```bash
docker build -t youtube-music-api .
```

2. Run the container:
```bash
docker run -p 8000:8000 youtube-music-api
```

## Environment Variables

- `PORT`: Server port (default: 8000)

## Integration with React Native App

Once deployed, update your `.env` file in the React Native app:

```env
EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://your-deployed-api-url.com
```

## Rate Limiting

YouTube Music may rate limit requests. Consider implementing:
- Request caching in the React Native app (already implemented in `youtubeMusicService.ts`)
- Rate limiting middleware in the API
- Queue system for batch requests

## Notes

- Streaming URLs expire after approximately 6 hours
- The API uses the unofficial YouTube Music API, so functionality may change
- For production use, consider adding authentication and rate limiting
- CORS is currently set to allow all origins; restrict this in production

## Troubleshooting

### "YTMusic client not initialized"
- Ensure ytmusicapi is properly installed
- Check Python version compatibility

### Stream URLs not working
- URLs expire after ~6 hours; request a fresh URL before playback
- Some videos may have restricted streaming access

### Search returning no results
- Verify the search query is properly URL encoded
- Check that the filter type is valid (songs, albums, artists, playlists)

## License

This backend service uses ytmusicapi which is licensed under MIT License.
