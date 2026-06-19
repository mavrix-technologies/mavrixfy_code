import time
import unittest
from unittest.mock import patch

import main


class FakeYoutubeDL:
    calls = 0

    def __init__(self, options):
        self.options = options

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def extract_info(self, watch_url, download=False):
        type(self).calls += 1
        expiry = int(time.time()) + 3600
        return {
            "url": f"https://example.googlevideo.com/audio.m4a?expire={expiry}",
            "ext": "m4a",
            "format_id": "140",
            "acodec": "mp4a.40.2",
            "abr": 129,
            "duration": 180,
            "filesize": 1024,
            "http_headers": {
                "User-Agent": "test-agent",
                "Accept": "*/*",
                "Cookie": "must-not-leak",
            },
        }


class AudioStreamResolverTests(unittest.TestCase):
    def setUp(self):
        FakeYoutubeDL.calls = 0
        with main.audio_stream_cache_lock:
            main.audio_stream_cache.clear()

    @patch.object(main.yt_dlp, "YoutubeDL", FakeYoutubeDL)
    def test_extracts_and_caches_safe_audio_metadata(self):
        first = main.extract_audio_stream("dQw4w9WgXcQ")
        second = main.extract_audio_stream("dQw4w9WgXcQ")

        self.assertEqual(FakeYoutubeDL.calls, 1)
        self.assertEqual(first, second)
        self.assertEqual(first["mimeType"], "audio/mp4")
        self.assertEqual(first["formatId"], "140")
        self.assertEqual(first["headers"]["User-Agent"], "test-agent")
        self.assertNotIn("Cookie", first["headers"])
        self.assertGreater(first["expiresAt"], int(time.time()))

    def test_rejects_invalid_shared_token_when_configured(self):
        with patch.object(main, "AUDIO_RESOLVER_TOKEN", "expected-token"):
            with self.assertRaises(main.HTTPException) as context:
                main.verify_audio_resolver_token("wrong-token")
        self.assertEqual(context.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
