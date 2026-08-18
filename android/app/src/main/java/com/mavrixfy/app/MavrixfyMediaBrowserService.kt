package com.mavrixfy.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.session.MediaSessionCompat
import android.util.Log
import androidx.media.MediaBrowserServiceCompat
import com.doublesymmetry.trackplayer.service.MusicService
import org.json.JSONObject
import java.lang.reflect.Field

class MavrixfyMediaBrowserService : MediaBrowserServiceCompat() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var musicBinder: MusicService.MusicBinder? = null
    private var isBound = false
    private var sessionBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.d(TAG, "Connected to MusicService")
            if (service is MusicService.MusicBinder) {
                musicBinder = service
                isBound = true
                tryRegisterSessionToken()
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.d(TAG, "Disconnected from MusicService")
            musicBinder = null
            isBound = false
            sessionBound = false
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate()")
        bindToMusicService()
    }

    private fun bindToMusicService() {
        try {
            val intent = Intent(this, MusicService::class.java)
            bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            Log.e(TAG, "Error binding to MusicService", e)
        }
    }

    private fun tryRegisterSessionToken() {
        if (sessionBound) return

        val token = extractSessionToken()
        if (token != null) {
            try {
                if (sessionToken == null) {
                    sessionToken = token
                    Log.i(TAG, "Successfully registered sessionToken on MediaBrowserService!")
                }
                sessionBound = true
            } catch (e: Exception) {
                Log.e(TAG, "Error setting sessionToken", e)
            }
            return
        }

        // Retry until TrackPlayer initializes the player
        mainHandler.removeCallbacks(syncRunnable)
        mainHandler.postDelayed(syncRunnable, 300)
    }

    private val syncRunnable = Runnable {
        tryRegisterSessionToken()
    }

    private fun extractSessionToken(): MediaSessionCompat.Token? {
        val binder = musicBinder ?: return null
        return try {
            val musicService = binder.service
            val playerField = findField(musicService.javaClass, "player") ?: return null
            playerField.isAccessible = true
            val player = playerField.get(musicService) ?: return null

            val sessionField = findField(player.javaClass, "mediaSession") ?: return null
            sessionField.isAccessible = true
            val mediaSession = sessionField.get(player) as? MediaSessionCompat
            mediaSession?.sessionToken
        } catch (e: Throwable) {
            null
        }
    }

    private fun findField(clazz: Class<*>?, fieldName: String): Field? {
        var current = clazz
        while (current != null && current != Any::class.java) {
            try {
                return current.getDeclaredField(fieldName)
            } catch (_: NoSuchFieldException) {
                current = current.superclass
            }
        }
        return null
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot? {
        if (!isKnownBrowserClient(clientPackageName, clientUid)) {
            Log.w(TAG, "Unknown browser client: $clientPackageName uid=$clientUid")
        }

        tryRegisterSessionToken()

        // Media resumption
        if (rootHints?.getBoolean(BrowserRoot.EXTRA_RECENT, false) == true) {
            val extras = Bundle().apply {
                putBoolean(BrowserRoot.EXTRA_RECENT, true)
            }
            return BrowserRoot(MEDIA_RESUMABLE_ROOT_ID, extras)
        }

        val rootExtras = Bundle().apply {
            putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_GRID_ITEM_HINT_VALUE)
            putInt(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_LIST_ITEM_HINT_VALUE)
        }
        return BrowserRoot(MEDIA_ROOT_ID, rootExtras)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>
    ) {
        Log.d(TAG, "onLoadChildren parentId=$parentId")
        when (parentId) {
            MEDIA_RESUMABLE_ROOT_ID -> {
                result.detach()
                mainHandler.post { result.sendResult(buildResumableItems()) }
            }
            MEDIA_ROOT_ID -> {
                result.sendResult(buildRootCategories())
            }
            MEDIA_ID_NOW_PLAYING, MEDIA_ID_RECENT -> {
                result.detach()
                mainHandler.post { result.sendResult(buildNowPlayingItems()) }
            }
            else -> result.sendResult(emptyList())
        }
    }

    override fun onSearch(query: String, extras: Bundle?, result: Result<List<MediaBrowserCompat.MediaItem>>) {
        result.sendResult(emptyList())
    }

    private fun buildRootCategories(): List<MediaBrowserCompat.MediaItem> = listOf(
        makeItem(MEDIA_ID_NOW_PLAYING, "Now Playing", "Current track", null, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE),
        makeItem(MEDIA_ID_RECENT, "Recently Played", "Your listening history", null, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
    )

    private fun buildNowPlayingItems(): List<MediaBrowserCompat.MediaItem> {
        val song = readLastPlayedSong()
        val title  = song?.optString("title")?.takeIf  { it.isNotBlank() } ?: "Now Playing"
        val artist = song?.optString("artist")?.takeIf { it.isNotBlank() } ?: "Mavrixfy"
        val songId = song?.optString("id")?.takeIf    { it.isNotBlank() } ?: "mavrixfy_now_playing"
        val cover  = song?.optString("coverUrl")?.takeIf { it.isNotBlank() }
        return listOf(makeItem(songId, title, artist, cover?.let { safeUri(it) }, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE))
    }

    private fun buildResumableItems(): List<MediaBrowserCompat.MediaItem> {
        val song   = readLastPlayedSong()
        val title  = song?.optString("title")?.takeIf  { it.isNotBlank() } ?: "Mavrixfy"
        val artist = song?.optString("artist")?.takeIf { it.isNotBlank() } ?: "Music"
        val songId = song?.optString("id")?.takeIf    { it.isNotBlank() } ?: "mavrixfy_resume"
        val cover  = song?.optString("coverUrl")?.takeIf { it.isNotBlank() }
        return listOf(makeItem(songId, title, artist, cover?.let { safeUri(it) }, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE))
    }

    private fun makeItem(mediaId: String, title: String, subtitle: String, iconUri: Uri?, flag: Int): MediaBrowserCompat.MediaItem {
        val desc = MediaDescriptionCompat.Builder()
            .setMediaId(mediaId)
            .setTitle(title)
            .setSubtitle(subtitle)
            .apply { iconUri?.let { setIconUri(it) } }
            .build()
        return MediaBrowserCompat.MediaItem(desc, flag)
    }

    private fun safeUri(url: String): Uri? = try { Uri.parse(url) } catch (_: Exception) { null }

    private fun readLastPlayedSong(): JSONObject? {
        val candidates = listOf("RCTAsyncLocalStorage_V1", "${packageName}_preferences")
        val keys = listOf("@mavrixfy_player_state", "mavrixfy_player_state")
        for (name in candidates) {
            try {
                val prefs = getSharedPreferences(name, Context.MODE_PRIVATE)
                for (key in keys) {
                    val raw = prefs.getString(key, null) ?: continue
                    val song = JSONObject(raw).optJSONObject("currentSong")
                    if (song != null && song.optString("id").isNotBlank()) return song
                }
            } catch (_: Exception) {}
        }
        return null
    }

    private fun isKnownBrowserClient(packageName: String, uid: Int): Boolean {
        if (packageName == applicationContext.packageName) return true
        if (uid == android.os.Process.SYSTEM_UID) return true
        return packageName in KNOWN_BROWSER_CLIENTS
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        if (isBound) {
            try { unbindService(serviceConnection) } catch (_: Exception) {}
            isBound = false
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MavrixfyBrowserSvc"

        const val MEDIA_ROOT_ID           = "__MAVRIXFY_ROOT__"
        const val MEDIA_RESUMABLE_ROOT_ID = "__MAVRIXFY_RESUMABLE__"
        const val MEDIA_ID_NOW_PLAYING    = "mavrixfy_now_playing"
        const val MEDIA_ID_RECENT         = "mavrixfy_recent"

        const val CONTENT_STYLE_BROWSABLE_HINT       = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
        const val CONTENT_STYLE_PLAYABLE_HINT        = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
        const val CONTENT_STYLE_LIST_ITEM_HINT_VALUE = 1
        const val CONTENT_STYLE_GRID_ITEM_HINT_VALUE = 2

        val KNOWN_BROWSER_CLIENTS: Set<String> = setOf(
            "com.android.systemui",
            "com.google.android.projection",
            "com.google.android.projection.gearhead",
            "com.google.android.googlequicksearchbox",
            "com.android.bluetooth",
            "com.google.android.carassistant",
            "com.google.android.car.media",
            "com.google.android.wearable.app",
        )
    }
}
