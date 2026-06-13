import os
import uvicorn
import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic
from typing import Optional, List, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="YouTube Music API", root_path="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yt = YTMusic()


def safe_call(fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
        return result if result is not None else {}
    except Exception as e:
        logger.error(f"ytmusicapi error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/healthz")
def health_check():
    return {"status": "ok"}


@app.get("/search")
def search(
    q: str,
    filter: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=50),
):
    valid_filters = [
        "songs", "videos", "albums", "artists", "playlists",
        "community_playlists", "featured_playlists", "uploads",
    ]
    if filter and filter not in valid_filters:
        raise HTTPException(status_code=400, detail=f"Invalid filter. Choose from: {valid_filters}")
    results = safe_call(yt.search, q, filter=filter, limit=limit)
    if not isinstance(results, list):
        return []
    return results


@app.get("/search/suggestions")
def get_search_suggestions(q: str):
    result = safe_call(yt.get_search_suggestions, q)
    if isinstance(result, list):
        flat = []
        for item in result:
            if isinstance(item, str):
                flat.append(item)
            elif isinstance(item, dict) and "query" in item:
                flat.append(item["query"])
            elif isinstance(item, dict) and "text" in item:
                flat.append(item["text"])
        return flat
    return []


@app.get("/charts")
def get_charts(country: str = Query(default="ZZ")):
    return safe_call(yt.get_charts, country=country)


@app.get("/moods")
def get_moods():
    result = safe_call(yt.get_mood_categories)
    if isinstance(result, dict):
        categories = []
        for title, items in result.items():
            categories.append({"title": title, "items": items})
        return categories
    return []


@app.get("/mood-playlist/{params}")
def get_mood_playlist(params: str):
    result = safe_call(yt.get_mood_content, params)
    if not isinstance(result, list):
        return []
    return result


@app.get("/artist/{channelId}")
def get_artist(channelId: str):
    return safe_call(yt.get_artist, channelId)


@app.get("/album/{browseId}")
def get_album(browseId: str):
    return safe_call(yt.get_album, browseId)


@app.get("/song/{videoId}")
def get_song(videoId: str):
    result = safe_call(yt.get_song, videoId)
    details = result.get("videoDetails", {}) if isinstance(result, dict) else {}
    return details


@app.get("/lyrics/{browseId}")
def get_lyrics(browseId: str):
    result = safe_call(yt.get_lyrics, browseId)
    if isinstance(result, dict):
        return result
    return {"lyrics": None, "source": None}


@app.get("/watch/{videoId}")
def get_watch_playlist(
    videoId: str,
    limit: int = Query(default=25, ge=1, le=50),
    radio: bool = Query(default=True),
):
    result = safe_call(yt.get_watch_playlist, videoId=videoId, radio=radio, limit=limit)
    if isinstance(result, dict):
        tracks = result.get("tracks", [])
        playlist_id = result.get("playlistId")
        lyrics = result.get("lyrics")
        return {"tracks": tracks, "playlistId": playlist_id, "lyrics": lyrics}
    return {"tracks": [], "playlistId": None, "lyrics": None}


@app.get("/playlist/{playlistId}")
def get_playlist(playlistId: str):
    return safe_call(yt.get_playlist, playlistId, limit=100)


@app.get("/home")
def get_home(limit: int = Query(default=3, ge=1, le=10)):
    result = safe_call(yt.get_home, limit=limit)
    if not isinstance(result, list):
        return []
    shelves = []
    for shelf in result:
        if isinstance(shelf, dict):
            shelves.append(shelf)
    return shelves


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, app_dir=os.path.dirname(__file__))
