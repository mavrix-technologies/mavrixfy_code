import asyncio
import logging
import os
import re
import secrets
import time
from collections import OrderedDict
from threading import Lock
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

import httpx
import requests
import uvicorn
import yt_dlp
from fastapi import FastAPI, Header, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from ytmusicapi import YTMusic

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Remove root_path for Vercel deployment - routes will be /api/* via vercel.json
app = FastAPI(title="YouTube Music API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yt_language = os.environ.get("YOUTUBE_MUSIC_LANGUAGE", "en").strip()
yt_location = os.environ.get("YOUTUBE_MUSIC_LOCATION", "IN").strip()
yt = YTMusic(language=yt_language, location=yt_location)
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(15.0, read=None),
    follow_redirects=True,
)

YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")


def normalize_netscape_cookies(content: str) -> str:
    lines = []
    has_header = False
    for line in content.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("# Netscape HTTP Cookie File") or trimmed.startswith("# HTTP Cookie File") or trimmed.startswith("#cookies.txt"):
            has_header = True
        if not trimmed or trimmed.startswith("#"):
            lines.append(line)
            continue
        parts = trimmed.split()
        if len(parts) >= 6:
            lines.append("\t".join(parts))
        else:
            lines.append(line)
    result = "\n".join(lines)
    if not has_header:
        result = "# Netscape HTTP Cookie File\n# This is a generated file! Do not edit.\n\n" + result
    return result
AUDIO_FORMAT_SELECTOR = "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best"
AUDIO_CACHE_MAX_ITEMS = 100
AUDIO_CACHE_MAX_AGE_SECONDS = 20 * 60
AUDIO_CACHE_EXPIRY_MARGIN_SECONDS = 90
AUDIO_RESOLVER_TOKEN = os.environ.get("YOUTUBE_MUSIC_AUDIO_TOKEN", "").strip()
SAFE_PLAYBACK_HEADERS = {
    "accept",
    "accept-language",
    "origin",
    "referer",
    "user-agent",
}


def get_positive_int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


audio_resolver_semaphore = asyncio.Semaphore(
    get_positive_int_env("YOUTUBE_MUSIC_AUDIO_CONCURRENCY", 2)
)
audio_stream_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
audio_stream_cache_lock = Lock()


def safe_call(fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
        return result if result is not None else {}
    except Exception as e:
        logger.error(f"ytmusicapi error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_audio_url_expiry(audio_url: str) -> int:
    try:
        raw_expiry = parse_qs(urlparse(audio_url).query).get("expire", [None])[0]
        expiry = int(raw_expiry) if raw_expiry else 0
        if expiry > int(time.time()):
            return expiry
    except (TypeError, ValueError):
        pass
    return int(time.time()) + AUDIO_CACHE_MAX_AGE_SECONDS


def get_safe_playback_headers(raw_headers: Any) -> dict[str, str]:
    if not isinstance(raw_headers, dict):
        return {}

    headers: dict[str, str] = {}
    for key, value in raw_headers.items():
        normalized_key = str(key).strip()
        if normalized_key.lower() not in SAFE_PLAYBACK_HEADERS:
            continue
        normalized_value = str(value).strip()
        if normalized_value:
            headers[normalized_key] = normalized_value
    return headers


def get_cached_audio_stream(video_id: str) -> Optional[dict[str, Any]]:
    now = int(time.time())
    with audio_stream_cache_lock:
        cached = audio_stream_cache.get(video_id)
        if not cached:
            return None
        if int(cached.get("_cacheUntil", 0)) <= now:
            audio_stream_cache.pop(video_id, None)
            return None
        audio_stream_cache.move_to_end(video_id)
        return {key: value for key, value in cached.items() if key != "_cacheUntil"}


def cache_audio_stream(video_id: str, stream: dict[str, Any]) -> None:
    now = int(time.time())
    expires_at = int(stream.get("expiresAt", now + AUDIO_CACHE_MAX_AGE_SECONDS))
    cache_until = min(
        expires_at - AUDIO_CACHE_EXPIRY_MARGIN_SECONDS,
        now + AUDIO_CACHE_MAX_AGE_SECONDS,
    )
    if cache_until <= now:
        return

    with audio_stream_cache_lock:
        audio_stream_cache[video_id] = {**stream, "_cacheUntil": cache_until}
        audio_stream_cache.move_to_end(video_id)
        while len(audio_stream_cache) > AUDIO_CACHE_MAX_ITEMS:
            audio_stream_cache.popitem(last=False)


def extract_audio_stream(video_id: str) -> dict[str, Any]:
    cached = get_cached_audio_stream(video_id)
    if cached:
        return cached

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    options = {
        "format": AUDIO_FORMAT_SELECTOR,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 12,
        "retries": 1,
        "fragment_retries": 1,
        "extractor_retries": 1,
        "cachedir": False,
        "extractor_args": {
            "youtube": {
                "player_client": ["ios", "android"]
            }
        },
    }

    cookie_path = None
    cookies_content = os.environ.get("YOUTUBE_COOKIES", "").strip()
    if cookies_content:
        import tempfile
        try:
            normalized_cookies = normalize_netscape_cookies(cookies_content)
            with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt", encoding="utf-8") as f:
                f.write(normalized_cookies)
                cookie_path = f.name
            options["cookiefile"] = cookie_path
        except Exception as e:
            logger.warning("Failed to create temporary cookies file: %s", e)

    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(watch_url, download=False)
    finally:
        if cookie_path:
            try:
                os.unlink(cookie_path)
            except Exception:
                pass

    if not isinstance(info, dict):
        raise RuntimeError("YouTube returned no stream information")

    formats = info.get("formats", [])
    if not formats and info.get("url"):
        formats = [info]
    playable_formats = []
    for f in formats:
        url = f.get("url")
        if not url or not url.startswith("https://"):
            continue
        # Format must have an audio codec
        acodec = f.get("acodec")
        if not acodec or acodec == "none":
            continue
        playable_formats.append(f)

    if not playable_formats:
        format_summaries = [
            f"{f.get('format_id')}: ext={f.get('ext')}, acodec={f.get('acodec')}, vcodec={f.get('vcodec')}, has_url={bool(f.get('url'))}"
            for f in formats
        ]
        logger.error("No playable formats found. Available formats: %s", ", ".join(format_summaries))
        raise RuntimeError("No playable audio formats found for this video")

    # Sort playable formats:
    # 1. Prefer audio-only (vcodec is None or 'none')
    # 2. Prefer higher bitrate (abr or tbr)
    def format_sort_key(f):
        is_audio_only = 1 if f.get("vcodec") in (None, "none") else 0
        bitrate = f.get("abr") or f.get("tbr") or 0
        return (is_audio_only, bitrate)

    playable_formats.sort(key=format_sort_key, reverse=True)
    best_format = playable_formats[0]

    audio_url = best_format["url"]
    extension = str(best_format.get("ext") or "").strip().lower()
    mime_type = {
        "m4a": "audio/mp4",
        "mp4": "audio/mp4",
        "webm": "audio/webm",
        "opus": "audio/ogg",
    }.get(extension, "audio/mpeg")
    playback_headers = get_safe_playback_headers(
        best_format.get("http_headers") or info.get("http_headers")
    )
    stream = {
        "videoId": video_id,
        "url": audio_url,
        "expiresAt": get_audio_url_expiry(audio_url),
        "headers": playback_headers,
        "formatId": str(best_format.get("format_id") or info.get("format_id") or ""),
        "extension": extension,
        "mimeType": mime_type,
        "audioCodec": str(best_format.get("acodec") or info.get("acodec") or ""),
        "bitrateKbps": best_format.get("abr") or best_format.get("tbr") or info.get("abr"),
        "duration": best_format.get("duration") or info.get("duration"),
        "contentLength": best_format.get("filesize") or best_format.get("filesize_approx") or info.get("filesize") or info.get("filesize_approx"),
    }
    logger.info(
        "yt-dlp audio stream resolved videoId=%s formatId=%s extension=%s mimeType=%s audioCodec=%s host=%s",
        video_id,
        stream["formatId"],
        stream["extension"],
        stream["mimeType"],
        stream["audioCodec"],
        urlparse(audio_url).hostname or "",
    )
    cache_audio_stream(video_id, stream)
    return stream


def verify_audio_resolver_token(provided_token: Optional[str]) -> None:
    if AUDIO_RESOLVER_TOKEN and not secrets.compare_digest(
        provided_token or "", AUDIO_RESOLVER_TOKEN
    ):
        raise HTTPException(status_code=403, detail="Invalid audio resolver token")


@app.get("/healthz")
def health_check(test_id: Optional[str] = None):
    import yt_dlp
    res = {
        "status": "ok",
        "yt_dlp_version": yt_dlp.version.__version__,
        "has_cookies": bool(os.environ.get("YOUTUBE_COOKIES", "").strip())
    }
    if test_id:
        try:
            stream_res = extract_audio_stream(test_id)
            res["test_stream"] = stream_res
        except Exception as e:
            import traceback
            res["test_error"] = str(e)
            res["test_traceback"] = traceback.format_exc()
    return res


@app.get("/search")
def search(
    q: Optional[str] = Query(default=None),
    search_query: Optional[str] = Query(default=None, alias="query"),
    filter: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=50),
):
    term = (q or search_query or "").strip()
    if not term:
        raise HTTPException(status_code=400, detail="Missing search query")

    valid_filters = [
        "songs", "videos", "albums", "artists", "playlists",
        "community_playlists", "featured_playlists", "uploads",
    ]
    if filter and filter not in valid_filters:
        raise HTTPException(status_code=400, detail=f"Invalid filter. Choose from: {valid_filters}")
    results = safe_call(yt.search, term, filter=filter, limit=limit)
    if not isinstance(results, list):
        return []
    return results


@app.get("/search/suggestions")
def get_search_suggestions(
    q: Optional[str] = Query(default=None),
    search_query: Optional[str] = Query(default=None, alias="query"),
):
    term = (q or search_query or "").strip()
    if not term:
        raise HTTPException(status_code=400, detail="Missing search query")

    result = safe_call(yt.get_search_suggestions, term)
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


async def resolve_audio_stream_info(
    videoId: str,
    token: Optional[str] = None,
    x_resolver_token: Optional[str] = None,
):
    videoId = videoId.removesuffix(".m4a").removesuffix(".mp4")
    if not YOUTUBE_VIDEO_ID_PATTERN.fullmatch(videoId):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID")

    verify_audio_resolver_token(x_resolver_token or token)

    try:
        import anyio
        async with audio_resolver_semaphore:
            stream_info = await anyio.to_thread.run_sync(extract_audio_stream, videoId)
        return {"stream": stream_info}
    except Exception as error:
        logger.exception("YouTube audio resolver failed for %s", videoId)
        raise HTTPException(status_code=502, detail="Unable to resolve YouTube audio") from error


@app.get("/audio/{videoId}")
@app.get("/stream-info/{videoId}")
@app.get("/api/audio/{videoId}")
@app.get("/api/stream-info/{videoId}")
@app.get("/api/youtube-music/audio/{videoId}")
@app.get("/api/youtube-music/stream-info/{videoId}")
async def get_audio_stream_info(
    videoId: str,
    token: Optional[str] = Query(default=None),
    x_resolver_token: Optional[str] = Header(default=None),
):
    return await resolve_audio_stream_info(videoId, token, x_resolver_token)


async def build_audio_stream_response(
    videoId: str,
    request: Request,
    head_only: bool = False,
    token: Optional[str] = Query(default=None),
    x_resolver_token: Optional[str] = Header(default=None),
):
    videoId = videoId.removesuffix(".m4a").removesuffix(".mp4")
    if not YOUTUBE_VIDEO_ID_PATTERN.fullmatch(videoId):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID")
    
    provided_token = x_resolver_token or token
    verify_audio_resolver_token(provided_token)

    try:
        import anyio
        async with audio_resolver_semaphore:
            stream_info = await anyio.to_thread.run_sync(extract_audio_stream, videoId)
        target_url = stream_info["url"]

        req_headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "*/*",
        }
        client_range = request.headers.get("range")
        if client_range:
            req_headers["Range"] = client_range

        req = http_client.build_request("HEAD" if head_only else "GET", target_url, headers=req_headers)
        r = await http_client.send(req, stream=True)
        
        res_headers = {}
        for h in ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]:
            if h in r.headers:
                res_headers[h] = r.headers[h]
            elif h.lower() in r.headers:
                res_headers[h] = r.headers[h.lower()]

        if "Content-Type" not in res_headers or "octet-stream" in res_headers.get("Content-Type", ""):
            res_headers["Content-Type"] = stream_info.get("mimeType", "audio/mp4")
        res_headers["Accept-Ranges"] = res_headers.get("Accept-Ranges", "bytes")
        res_headers["Cache-Control"] = "no-store"
        res_headers["Content-Disposition"] = f'inline; filename="{videoId}.m4a"'

        if head_only:
            await r.aclose()
            return Response(status_code=r.status_code, headers=res_headers)

        async def iterate_chunks():
            try:
                async for chunk in r.aiter_bytes(chunk_size=65536):
                    yield chunk
            except Exception as e:
                logger.warning(f"Error streaming video {videoId}: {e}")
            finally:
                await r.aclose()

        return StreamingResponse(
            iterate_chunks(),
            status_code=r.status_code,
            headers=res_headers
        )
    except Exception as error:
        logger.exception("YouTube audio resolver failed for %s", videoId)
        raise HTTPException(status_code=502, detail="Unable to resolve YouTube audio") from error


@app.get("/stream/{videoId}")
async def get_audio_stream(
    videoId: str,
    request: Request,
    token: Optional[str] = Query(default=None),
    x_resolver_token: Optional[str] = Header(default=None),
):
    return await build_audio_stream_response(videoId, request, False, token, x_resolver_token)


@app.head("/stream/{videoId}")
async def head_audio_stream(
    videoId: str,
    request: Request,
    token: Optional[str] = Query(default=None),
    x_resolver_token: Optional[str] = Header(default=None),
):
    return await build_audio_stream_response(videoId, request, True, token, x_resolver_token)


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
        return {"tracks": tracks, "playlistId": playlist_id}
    return {"tracks": [], "playlistId": None}


@app.get("/playlist/{playlistId}")
def get_playlist(playlistId: str):
    return safe_call(yt.get_playlist, playlistId, limit=100)


def get_custom_indian_home():
    shelves = []
    
    # 1. India Trending Charts
    try:
        charts = yt.get_charts(country='IN')
        chart_items = []
        
        daily = charts.get('daily', [])
        weekly = charts.get('weekly', [])
        for item in (daily + weekly):
            p_id = item.get('playlistId') or item.get('browseId')
            if p_id:
                chart_items.append({
                    'title': item.get('title'),
                    'playlistId': p_id,
                    'thumbnails': item.get('thumbnails', []),
                    'description': item.get('description', 'Chart • YouTube Music')
                })
        if chart_items:
            shelves.append({
                'title': 'India Trending Charts',
                'contents': chart_items[:12]
            })
    except Exception as e:
        logger.error(f"Error fetching Indian charts: {e}")

    # 2. Curated Indian Search-based categories targeting official featured playlists
    search_queries = [
        ("Bollywood Hits (Official)", "Bollywood"),
        ("Punjabi Hits (Official)", "Punjabi"),
        ("Tamil Hits (Official)", "Tamil Hits"),
        ("Telugu Hits (Official)", "Telugu Hits"),
        ("Indian Pop & Indie (Official)", "Indian Indie")
    ]
    
    for shelf_title, query in search_queries:
        try:
            results = yt.search(query, filter="featured_playlists", limit=12)
            contents = []
            for item in results:
                p_id = item.get('browseId') or item.get('playlistId')
                if p_id:
                    # Strip 'VL' prefix if present for clean routing or keep as ytmusicapi returns
                    contents.append({
                        'title': item.get('title'),
                        'playlistId': p_id,
                        'thumbnails': item.get('thumbnails', []),
                        'description': f"Playlist • {item.get('author', 'YouTube Music')}"
                    })
            if contents:
                shelves.append({
                    'title': shelf_title,
                    'contents': contents
                })
        except Exception as e:
            logger.error(f"Error fetching custom Indian playlists for {query}: {e}")
            
    return shelves


@app.get("/home")
def get_home(limit: int = Query(default=3, ge=1, le=10)):
    if yt_location == "IN":
        try:
            return get_custom_indian_home()
        except Exception as e:
            logger.error(f"Failed to generate custom Indian home feed: {e}")
            pass

    result = safe_call(yt.get_home, limit=limit)
    if not isinstance(result, list):
        return []
    return [shelf for shelf in result if isinstance(shelf, dict)]


@app.get("/mood-playlists")
def get_mood_playlists():
    """Get mood and genre based playlists"""
    result = safe_call(yt.get_mood_categories)
    if isinstance(result, dict):
        categories = []
        for title, items in result.items():
            categories.append({"title": title, "items": items})
        return categories
    return []


@app.get("/new-releases")
def get_new_releases():
    """New releases are derived from the home feed on the client side.
    This endpoint is kept for compatibility but the client should use /home.
    """
    return []


@app.on_event("shutdown")
async def shutdown_event():
    await http_client.aclose()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, app_dir=os.path.dirname(__file__))
