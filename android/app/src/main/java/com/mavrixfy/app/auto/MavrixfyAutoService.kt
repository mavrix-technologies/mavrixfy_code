package com.mavrixfy.app.auto

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.content.Intent
import android.content.ComponentName
import android.content.ServiceConnection
import android.content.Context
import android.os.IBinder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Html
import android.util.Log
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media.MediaBrowserServiceCompat
import com.mavrixfy.app.R
import com.doublesymmetry.trackplayer.service.MusicService
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class MavrixfyAutoService : MediaBrowserServiceCompat() {
    private data class AutoNavItem(
        val id: String,
        val title: String,
        val subtitle: String,
        val accentColor: Int
    )

    private data class AutoPlaylist(
        val id: String,
        val title: String,
        val subtitle: String,
        val tag: String,
        val query: String,
        val navIds: Set<String>,
        val accentColor: Int
    )

    private data class AutoSong(
        val mediaId: String,
        val title: String,
        val artist: String,
        val album: String,
        val durationSeconds: Long,
        val audioUrl: String,
        val artUrl: String?
    )

    private val navItems = listOf(
        AutoNavItem("home", "Home", "Good afternoon", Color.rgb(30, 215, 96)),
        AutoNavItem("recent", "Recently Played", "Jump back in", Color.rgb(76, 117, 242)),
        AutoNavItem("browse", "Browse", "Find music", Color.rgb(148, 91, 255)),
        AutoNavItem("library", "Your Library", "Saved for you", Color.rgb(255, 109, 84))
    )

    private val playlists = listOf(
        AutoPlaylist(
            id = "top_songs",
            title = "Top songs",
            subtitle = "Popular now",
            tag = "POPULAR",
            query = "top hindi songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(30, 215, 96)
        ),
        AutoPlaylist(
            id = "new",
            title = "New releases",
            subtitle = "New • Fresh tracks",
            tag = "NEW",
            query = "new bollywood songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(76, 117, 242)
        ),
        AutoPlaylist(
            id = "viral_india",
            title = "Viral India",
            subtitle = "Popular • Social hits",
            tag = "POPULAR",
            query = "viral india songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(255, 109, 84)
        ),
        AutoPlaylist(
            id = "top_bollywood",
            title = "Top Bollywood",
            subtitle = "Popular • Bollywood",
            tag = "POPULAR",
            query = "top bollywood songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(255, 176, 0)
        ),
        AutoPlaylist(
            id = "fresh_hindi",
            title = "Fresh Hindi",
            subtitle = "New • Hindi picks",
            tag = "NEW",
            query = "fresh hindi songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(0, 188, 212)
        ),
        AutoPlaylist(
            id = "new_punjabi",
            title = "New Punjabi",
            subtitle = "New • Punjabi drops",
            tag = "NEW",
            query = "new punjabi songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(255, 79, 129)
        ),
        AutoPlaylist(
            id = "drive_hits",
            title = "Drive hits",
            subtitle = "Popular • Road mix",
            tag = "POPULAR",
            query = "best driving songs hindi",
            navIds = setOf("home"),
            accentColor = Color.rgb(148, 91, 255)
        ),
        AutoPlaylist(
            id = "editor_picks",
            title = "Editor picks",
            subtitle = "New • Curated",
            tag = "NEW",
            query = "latest hindi hit songs",
            navIds = setOf("home"),
            accentColor = Color.rgb(233, 64, 87)
        ),
        AutoPlaylist(
            id = "artist_suggest",
            title = "Artist suggestions",
            subtitle = "Artist • Suggested mix",
            tag = "ARTIST",
            query = "popular indian artist songs",
            navIds = setOf("home", "browse"),
            accentColor = Color.rgb(29, 185, 84)
        ),
        AutoPlaylist(
            id = "arijit_artist",
            title = "Arijit Singh Mix",
            subtitle = "Artist • Suggested",
            tag = "ARTIST",
            query = "Arijit Singh hits",
            navIds = setOf("home", "browse", "library"),
            accentColor = Color.rgb(76, 117, 242)
        ),
        AutoPlaylist(
            id = "rahman_artist",
            title = "A.R. Rahman Mix",
            subtitle = "Artist • Composer mix",
            tag = "ARTIST",
            query = "A R Rahman songs",
            navIds = setOf("browse", "library"),
            accentColor = Color.rgb(255, 176, 0)
        ),
        AutoPlaylist(
            id = "shreya_artist",
            title = "Shreya Ghoshal Mix",
            subtitle = "Artist • Vocal hits",
            tag = "ARTIST",
            query = "Shreya Ghoshal songs",
            navIds = setOf("browse", "library"),
            accentColor = Color.rgb(255, 79, 129)
        ),
        AutoPlaylist(
            id = "trending",
            title = "Trending songs",
            subtitle = "Trending • Hot right now",
            tag = "TRENDING",
            query = "trending songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(255, 176, 0)
        ),
        AutoPlaylist(
            id = "hindi",
            title = "Hindi hits",
            subtitle = "Bollywood • Essentials",
            tag = "HINDI",
            query = "latest bollywood songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(255, 109, 84)
        ),
        AutoPlaylist(
            id = "bollywood_party",
            title = "Bollywood Party",
            subtitle = "Browse • Party",
            tag = "PARTY",
            query = "bollywood party songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(0, 188, 212)
        ),
        AutoPlaylist(
            id = "punjabi_hits",
            title = "Punjabi hits",
            subtitle = "Browse • Punjabi",
            tag = "PUNJABI",
            query = "punjabi hit songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(30, 215, 96)
        ),
        AutoPlaylist(
            id = "indie_india",
            title = "Indie India",
            subtitle = "Browse • Indie",
            tag = "INDIE",
            query = "indie india songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(76, 117, 242)
        ),
        AutoPlaylist(
            id = "lofi_hindi",
            title = "Lofi Hindi",
            subtitle = "Browse • Chill",
            tag = "CHILL",
            query = "lofi hindi songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(148, 91, 255)
        ),
        AutoPlaylist(
            id = "workout",
            title = "Workout mix",
            subtitle = "Browse • Energy",
            tag = "ENERGY",
            query = "workout hindi songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(255, 79, 129)
        ),
        AutoPlaylist(
            id = "sufi",
            title = "Sufi soul",
            subtitle = "Browse • Sufi",
            tag = "SUFI",
            query = "sufi bollywood songs",
            navIds = setOf("browse"),
            accentColor = Color.rgb(255, 176, 0)
        ),
        AutoPlaylist(
            id = "romance",
            title = "Romantic songs",
            subtitle = "Romance • Drive mix",
            tag = "ROMANCE",
            query = "romantic hindi songs",
            navIds = setOf("library"),
            accentColor = Color.rgb(255, 79, 129)
        ),
        AutoPlaylist(
            id = "liked_style",
            title = "Liked style",
            subtitle = "Library • Favorites",
            tag = "LIBRARY",
            query = "most liked hindi songs",
            navIds = setOf("library"),
            accentColor = Color.rgb(30, 215, 96)
        ),
        AutoPlaylist(
            id = "chill_library",
            title = "Chill library",
            subtitle = "Library • Relaxed",
            tag = "CHILL",
            query = "chill bollywood songs",
            navIds = setOf("library"),
            accentColor = Color.rgb(76, 117, 242)
        ),
        AutoPlaylist(
            id = "old_is_gold",
            title = "Old is gold",
            subtitle = "Library • Classics",
            tag = "CLASSIC",
            query = "old hindi songs",
            navIds = setOf("library"),
            accentColor = Color.rgb(255, 176, 0)
        ),
        AutoPlaylist(
            id = "sad_hits",
            title = "Sad hits",
            subtitle = "Library • Mood",
            tag = "MOOD",
            query = "sad hindi songs",
            navIds = setOf("library"),
            accentColor = Color.rgb(108, 99, 255)
        ),
        AutoPlaylist(
            id = "arijit_mix",
            title = "Arijit mix",
            subtitle = "Library • Artist mix",
            tag = "ARTIST",
            query = "Arijit Singh songs",
            navIds = setOf("library"),
            accentColor = Color.rgb(0, 188, 212)
        ),
        AutoPlaylist(
            id = "party",
            title = "Party mix",
            subtitle = "Party • Upbeat",
            tag = "PARTY",
            query = "party songs hindi",
            navIds = setOf("recent"),
            accentColor = Color.rgb(0, 188, 212)
        ),
        AutoPlaylist(
            id = "recent_top",
            title = "Recent top",
            subtitle = "Recent • Top picks",
            tag = "RECENT",
            query = "top trending hindi songs",
            navIds = setOf("recent"),
            accentColor = Color.rgb(30, 215, 96)
        ),
        AutoPlaylist(
            id = "recent_new",
            title = "Recent new",
            subtitle = "Recent • New",
            tag = "RECENT",
            query = "new songs india",
            navIds = setOf("recent"),
            accentColor = Color.rgb(76, 117, 242)
        ),
        AutoPlaylist(
            id = "recent_drive",
            title = "Recent drive",
            subtitle = "Recent • Road",
            tag = "RECENT",
            query = "car drive songs hindi",
            navIds = setOf("recent"),
            accentColor = Color.rgb(148, 91, 255)
        ),
        AutoPlaylist(
            id = "recent_romance",
            title = "Recent romance",
            subtitle = "Recent • Romance",
            tag = "RECENT",
            query = "new romantic hindi songs",
            navIds = setOf("recent"),
            accentColor = Color.rgb(255, 79, 129)
        ),
        AutoPlaylist(
            id = "recent_chill",
            title = "Recent chill",
            subtitle = "Recent • Chill",
            tag = "RECENT",
            query = "new chill hindi songs",
            navIds = setOf("recent"),
            accentColor = Color.rgb(255, 176, 0)
        )
    )

    private val browserExecutor = Executors.newFixedThreadPool(4)
    private val artExecutor = Executors.newFixedThreadPool(2)
    private val categoryCache = ConcurrentHashMap<String, List<AutoSong>>()
    private val songCache = ConcurrentHashMap<String, AutoSong>()
    private val albumArtCache = ConcurrentHashMap<String, Bitmap>()
    private val generatedArtCache = ConcurrentHashMap<String, Bitmap>()
    private var likedSongCache: List<AutoSong> = emptyList()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var sessionHookRetryCount = 0
    private var musicService: MusicService? = null
    private lateinit var autoMediaSession: MediaSessionCompat

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as? MusicService.MusicBinder ?: return
            musicService = binder.service
            Log.d(TAG, "MusicService bound — extracting session token")
            extractAndSetSessionToken()
        }
        override fun onServiceDisconnected(name: ComponentName?) {
            Log.d(TAG, "MusicService unbound")
            musicService = null
        }
    }

    private var phonePlaybackActive = false
    private var phonePlaybackMediaId = ""
    private var phonePlaybackTitle = ""
    private var phonePlaybackArtist = ""
    private var phonePlaybackAlbum = ""
    private var phonePlaybackArtUrl = ""
    private var phonePlaybackDurationMs = 0L
    private var phonePlaybackPositionMs = 0L
    private var phonePlaybackIsPlaying = false
    private var currentAutoQueue: List<AutoSong> = emptyList()
    private var currentAutoQueueIndex = -1

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "onCreate")
        AutoMediaModule.warmReactRuntime(applicationContext)
        setupAutoMediaSession()
        warmHomeContent()
    }

    private fun setupAutoMediaSession() {
        autoMediaSession = MediaSessionCompat(this, TAG).apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    Log.d(TAG, "AutoSession: onPlay")
                    if (phonePlaybackActive) {
                        phonePlaybackIsPlaying = true
                        updatePlaybackState(isPlaying = true, positionMs = phonePlaybackPositionMs)
                        AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                    } else {
                        playDefaultPlaylist()
                    }
                }

                override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
                    Log.d(TAG, "AutoSession: onPlayFromMediaId $mediaId")
                    playFromMediaId(mediaId.orEmpty())
                }

                override fun onPause() {
                    Log.d(TAG, "AutoSession: onPause")
                    phonePlaybackIsPlaying = false
                    updatePlaybackState(isPlaying = false, positionMs = phonePlaybackPositionMs)
                    AutoMediaModule.emitRemoteCommand(applicationContext, "pause")
                }

                override fun onSkipToNext() {
                    Log.d(TAG, "AutoSession: onSkipToNext")
                    AutoMediaModule.emitRemoteCommand(applicationContext, "next")
                }

                override fun onSkipToPrevious() {
                    Log.d(TAG, "AutoSession: onSkipToPrevious")
                    AutoMediaModule.emitRemoteCommand(applicationContext, "previous")
                }

                override fun onStop() {
                    Log.d(TAG, "AutoSession: onStop")
                    phonePlaybackIsPlaying = false
                    updatePlaybackState(isPlaying = false, positionMs = phonePlaybackPositionMs)
                    AutoMediaModule.emitRemoteCommand(applicationContext, "pause")
                }

                override fun onSeekTo(pos: Long) {
                    Log.d(TAG, "AutoSession: onSeekTo $pos")
                    AutoMediaModule.emitRemoteCommand(applicationContext, "seek", positionMs = pos)
                }

                override fun onSkipToQueueItem(id: Long) {
                    val index = id.toInt()
                    Log.d(TAG, "AutoSession: onSkipToQueueItem $index")
                    val song = currentAutoQueue.getOrNull(index)
                    if (song != null) {
                        AutoMediaModule.emitRemoteCommand(
                            context = applicationContext,
                            command = "skipToQueueItem",
                            queueIndex = index,
                            song = song.toBridgeBundle(),
                            queue = currentAutoQueue.map { it.toBridgeBundle() }
                        )
                    }
                }
            })
            setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setActions(playbackActions())
                    .setState(PlaybackStateCompat.STATE_NONE, 0L, 1f)
                    .build()
            )
            isActive = true
        }
        sessionToken = autoMediaSession.sessionToken
        Log.i(TAG, "Android Auto MediaSession ready")
    }

    private fun setupMediaSessionHook() {
        // Bind WITHOUT BIND_AUTO_CREATE (flag 0) so we don't start a fresh MusicService.
        // If RNTP's service isn't running yet, bindService returns false and we retry.
        val intent = Intent(this, MusicService::class.java)
        val bound = try {
            bindService(intent, serviceConnection, 0)
        } catch (e: Exception) {
            Log.w(TAG, "bindService failed: ${e.message}")
            false
        }
        if (!bound) {
            Log.d(TAG, "MusicService not running yet, retrying (attempt $sessionHookRetryCount)")
            scheduleSessionHookRetry()
        }
    }

    private fun extractAndSetSessionToken() {
        val service = musicService ?: return
        try {
            // Walk the class hierarchy to find the mediaSession field on the ExoPlayer wrapper
            var playerObj: Any? = null
            var clazz: Class<*>? = service.javaClass
            while (clazz != null && playerObj == null) {
                try {
                    val f = clazz.getDeclaredField("player")
                    f.isAccessible = true
                    playerObj = f.get(service)
                } catch (_: NoSuchFieldException) { clazz = clazz.superclass }
            }
            if (playerObj == null) {
                Log.w(TAG, "player field not found — Android Auto will use default")
                return
            }
            var mediaSession: android.support.v4.media.session.MediaSessionCompat? = null
            var pClazz: Class<*>? = playerObj.javaClass
            while (pClazz != null && mediaSession == null) {
                try {
                    val f = pClazz.getDeclaredField("mediaSession")
                    f.isAccessible = true
                    mediaSession = f.get(playerObj) as? android.support.v4.media.session.MediaSessionCompat
                } catch (_: NoSuchFieldException) { pClazz = pClazz.superclass }
            }
            if (mediaSession != null) {
                sessionToken = mediaSession.sessionToken
                sessionHookRetryCount = 0
                Log.i(TAG, "MediaSession token set — Android Auto ready")

                // Forward Android Auto transport controls through the JS bridge.
                // TrackPlayer's background service registers the matching listener.
                mediaSession.setCallback(object : android.support.v4.media.session.MediaSessionCompat.Callback() {
                    override fun onPlay() {
                        Log.d(TAG, "MediaCallback: onPlay")
                        AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                    }

                    override fun onPause() {
                        Log.d(TAG, "MediaCallback: onPause")
                        AutoMediaModule.emitRemoteCommand(applicationContext, "pause")
                    }

                    override fun onSkipToNext() {
                        Log.d(TAG, "MediaCallback: onSkipToNext")
                        AutoMediaModule.emitRemoteCommand(applicationContext, "next")
                    }

                    override fun onSkipToPrevious() {
                        Log.d(TAG, "MediaCallback: onSkipToPrevious")
                        AutoMediaModule.emitRemoteCommand(applicationContext, "previous")
                    }

                    override fun onStop() {
                        Log.d(TAG, "MediaCallback: onStop")
                        AutoMediaModule.emitRemoteCommand(applicationContext, "pause")
                    }

                    override fun onSeekTo(pos: Long) {
                        Log.d(TAG, "MediaCallback: onSeekTo $pos")
                        AutoMediaModule.emitRemoteCommand(applicationContext, "seek", positionMs = pos)
                    }
                })
                Log.i(TAG, "Notification media callback registered")
            } else {
                Log.w(TAG, "mediaSession not found on player — Android Auto may not connect")
            }
        } catch (e: Exception) {
            Log.e(TAG, "extractAndSetSessionToken failed", e)
        }
    }

    private fun scheduleSessionHookRetry() {
        if (sessionHookRetryCount < 20) {
            sessionHookRetryCount++
            val delayMs = if (sessionHookRetryCount <= 5) 800L else 2000L
            mainHandler.postDelayed({ setupMediaSessionHook() }, delayMs)
        } else {
            Log.w(TAG, "Could not hook MediaSession after $sessionHookRetryCount attempts")
        }
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        Log.d(TAG, "onGetRoot client=$clientPackageName")
        AutoMediaModule.warmReactRuntime(applicationContext)
        return BrowserRoot(ROOT_ID, browserRootExtras())
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>
    ) {
        Log.d(TAG, "onLoadChildren parentId=$parentId")
        if (parentId == ROOT_ID) {
            result.sendResult(navItems.map { it.toMediaItem() })
            return
        }

        if (parentId.startsWith(NAV_PREFIX)) {
            val navId = parentId.removePrefix(NAV_PREFIX)
            sendPlaylistCards(navId, result)
            return
        }

        val playlist = playlists.firstOrNull { parentId == playlistParentId(it.id) }
        if (playlist == null) {
            result.sendResult(emptyList())
            return
        }

        val songs = playableCachedSongs(playlist)
        result.sendResult(playlist.toChildren(songs))
        refreshPlaylistAsync(playlist)
    }

    override fun onSearch(
        query: String,
        extras: Bundle?,
        result: Result<List<MediaBrowserCompat.MediaItem>>
    ) {
        val cleanQuery = query.trim()
        if (cleanQuery.isBlank()) {
            result.sendResult(emptyList())
            return
        }

        result.detach()
        browserExecutor.execute {
            val searchPlaylist = AutoPlaylist(
                id = "$SEARCH_PREFIX${cleanQuery.hashCode()}",
                title = "Search",
                subtitle = cleanQuery,
                tag = "SEARCH",
                query = cleanQuery,
                navIds = emptySet(),
                accentColor = Color.rgb(30, 215, 96)
            )
            val songs = fetchSongs(searchPlaylist)
            categoryCache[searchPlaylist.id] = songs
            songs.forEach { songCache[it.mediaId] = it }
            result.sendResult(songs.map { it.toMediaItem() })
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand")
        when (intent?.action) {
            ACTION_SYNC_PHONE_PLAYBACK -> handlePhonePlaybackSync(intent)
            ACTION_CLEAR_PHONE_PLAYBACK -> clearPhonePlayback()
            ACTION_SYNC_PHONE_QUEUE -> handlePhoneQueueSync(intent)
            ACTION_SYNC_LIKED_SONGS -> handleLikedSongsSync(intent)
        }
        return START_STICKY
    }

    fun syncPlaybackDirect(
        songId: String?,
        title: String?,
        artist: String?,
        album: String?,
        artUrl: String?,
        durationMs: Double,
        positionMs: Double,
        isPlaying: Boolean
    ) {
        mainHandler.post {
            performPhonePlaybackSync(
                songId = songId.orEmpty(),
                title = title.orEmpty(),
                artist = artist.orEmpty(),
                album = album.orEmpty(),
                artUrl = artUrl.orEmpty(),
                durationMs = durationMs.toLong(),
                positionMs = positionMs.toLong(),
                isPlaying = isPlaying
            )
        }
    }

    fun clearPlaybackDirect() {
        mainHandler.post {
            clearPhonePlayback()
        }
    }

    fun syncQueueDirect(queueSongs: ArrayList<Bundle>, activeIndex: Int) {
        mainHandler.post {
            performPhoneQueueSync(queueSongs, activeIndex)
        }
    }

    fun syncLikedSongsDirect(likedSongs: ArrayList<Bundle>) {
        mainHandler.post {
            performLikedSongsSync(likedSongs)
        }
    }

    override fun onDestroy() {
        instance = null
        browserExecutor.shutdownNow()
        artExecutor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        if (musicService != null) {
            try { unbindService(serviceConnection) } catch (_: Exception) {}
            musicService = null
        }
        if (::autoMediaSession.isInitialized) {
            autoMediaSession.isActive = false
            autoMediaSession.release()
        }
        super.onDestroy()
    }

    private fun AutoNavItem.toMediaItem(): MediaBrowserCompat.MediaItem {
        val extras = Bundle().apply {
            putInt(
                DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                CONTENT_STYLE_GRID_ITEM_HINT_VALUE
            )
        }
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(navParentId(id))
            .setTitle(title)
            .setSubtitle(subtitle)
            .setDescription("Mavrixfy")
            .setIconUri(navIconUri(id))
            .setExtras(extras)
            .build()
        return MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
    }

    private fun sendPlaylistCards(navId: String, result: Result<List<MediaBrowserCompat.MediaItem>>) {
        val sectionPlaylists = playlistsForNav(navId)
        if (sectionPlaylists.isEmpty()) {
            result.sendResult(emptyList())
            return
        }

        result.sendResult(sectionPlaylists.map { it.toMediaItem() })
        sectionPlaylists.take(6).forEach { refreshPlaylistAsync(it) }
    }

    private fun AutoPlaylist.toMediaItem(): MediaBrowserCompat.MediaItem {
        val extras = Bundle().apply {
            putInt(
                DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                CONTENT_STYLE_CATEGORY_GRID_ITEM_HINT_VALUE
            )
            putString(EXTRA_PLAYLIST_TAG, tag)
        }
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(playlistParentId(id))
            .setTitle(title)
            .setSubtitle(subtitle)
            .setDescription(tag)
            .setIconBitmap(playlistCoverBitmap(id) ?: generatedTileBitmap("playlist:$id", title, accentColor, tag))
            .setExtras(extras)
            .build()
        return MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
    }

    private fun AutoSong.toSessionDescription(): MediaDescriptionCompat {
        val extras = Bundle().apply {
            putInt(
                DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_PLAYABLE,
                CONTENT_STYLE_LIST_ITEM_HINT_VALUE
            )
        }
        val builder = MediaDescriptionCompat.Builder()
            .setMediaId(mediaId)
            .setTitle(title)
            .setSubtitle(artist.ifBlank { album })
            .setDescription(album)
            .setExtras(extras)

        artUrl?.takeIf { it.isNotBlank() }?.let { builder.setIconUri(Uri.parse(it)) }

        return builder.build()
    }

    private fun AutoSong.toMediaItem(): MediaBrowserCompat.MediaItem {
        return MediaBrowserCompat.MediaItem(toSessionDescription(), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
    }

    private fun AutoPlaylist.toChildren(songs: List<AutoSong>): List<MediaBrowserCompat.MediaItem> {
        return songs.map { it.toMediaItem() }
    }

    private fun playDefaultPlaylist() {
        browserExecutor.execute {
            val playlist = playlists.firstOrNull { pl -> "home" in pl.navIds } ?: playlists.firstOrNull()
            if (playlist == null) {
                AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                return@execute
            }
            val songsToPlay = playableCachedSongs(playlist)
            refreshPlaylistAsync(playlist)
            val firstSong = songsToPlay.firstOrNull { s -> s.audioUrl.isNotBlank() }
            if (firstSong == null) {
                AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                return@execute
            }
            playSongQueue(firstSong, songsToPlay)
        }
    }

    private fun playFromMediaId(mediaId: String) {
        browserExecutor.execute {
            val song = songCache[mediaId]
            val playlistId = mediaId
                .takeIf { it.startsWith(SONG_PREFIX) }
                ?.removePrefix(SONG_PREFIX)
                ?.substringBefore(":")
            val playlist = playlists.firstOrNull { it.id == playlistId }
            val queue = when {
                playlist != null -> playableCachedSongs(playlist)
                currentAutoQueue.isNotEmpty() -> currentAutoQueue
                else -> song?.let { listOf(it) } ?: playableCachedSongs(playlists.first())
            }
            val selectedSong = song ?: queue.firstOrNull { it.mediaId == mediaId } ?: queue.firstOrNull()
            if (selectedSong == null) {
                AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                return@execute
            }
            playSongQueue(selectedSong, queue)
            if (playlist != null) refreshPlaylistAsync(playlist)
        }
    }

    private fun fallbackSongsFor(playlist: AutoPlaylist): List<AutoSong> {
        val fallback = listOf(
            AutoSong(
                mediaId = "$SONG_PREFIX${playlist.id}:YiVML4Zo",
                title = "Gehra Hua",
                artist = "Shashwat Sachdev, Arijit Singh",
                album = "Gehra Hua",
                durationSeconds = 362,
                audioUrl = "https://aac.saavncdn.com/450/f467e05e2825cec2203546333e0d0550_320.mp4",
                artUrl = "https://c.saavncdn.com/450/Gehra-Hua-From-Dhurandhar-Hindi-2025-20251205154217-500x500.jpg"
            ),
            AutoSong(
                mediaId = "$SONG_PREFIX${playlist.id}:fallback-2",
                title = playlist.title,
                artist = "Mavrixfy",
                album = playlist.subtitle,
                durationSeconds = 0,
                audioUrl = "https://aac.saavncdn.com/450/f467e05e2825cec2203546333e0d0550_160.mp4",
                artUrl = null
            ),
            AutoSong(
                mediaId = "$SONG_PREFIX${playlist.id}:fallback-3",
                title = "${playlist.tag.lowercase().replaceFirstChar { it.uppercase() }} Mix",
                artist = "Mavrixfy",
                album = playlist.title,
                durationSeconds = 0,
                audioUrl = "https://aac.saavncdn.com/450/f467e05e2825cec2203546333e0d0550_96.mp4",
                artUrl = null
            )
        )
        return fallback.map { song ->
            song.copy(mediaId = song.mediaId.replace(" ", "_"))
        }
    }

    private fun warmHomeContent() {
        playlists.filter { "home" in it.navIds }.take(6).forEach { refreshPlaylistAsync(it) }
    }

    private fun playableCachedSongs(playlist: AutoPlaylist): List<AutoSong> {
        val cachedSongs = categoryCache[playlist.id].orEmpty().filter { it.audioUrl.isNotBlank() }
        if (cachedSongs.isNotEmpty()) return cachedSongs

        val fallbackSongs = fallbackSongsFor(playlist)
        categoryCache.putIfAbsent(playlist.id, fallbackSongs)
        fallbackSongs.forEach { songCache[it.mediaId] = it }
        preloadPlaylistArt(playlist.id, fallbackSongs.firstOrNull()?.artUrl)
        return fallbackSongs
    }

    private fun refreshPlaylistAsync(playlist: AutoPlaylist) {
        browserExecutor.execute {
            val fetchedSongs = fetchSongs(playlist)
            if (fetchedSongs.isEmpty()) return@execute
            categoryCache[playlist.id] = fetchedSongs
            fetchedSongs.forEach { s -> songCache[s.mediaId] = s }
            preloadPlaylistArt(playlist.id, fetchedSongs.firstOrNull()?.artUrl)
            Log.d(TAG, "refreshed ${fetchedSongs.size} songs for ${playlist.id}")
        }
    }

    private fun fetchSongs(playlist: AutoPlaylist): List<AutoSong> {
        return try {
            val encodedQuery = URLEncoder.encode(playlist.query, "UTF-8")
            val url = URL("$API_BASE/api/search/songs?query=$encodedQuery&limit=30")
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 12000
            connection.setRequestProperty("User-Agent", USER_AGENT)
            connection.setRequestProperty("Accept", "application/json")
            val responseCode = connection.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "fetchSongs HTTP $responseCode for ${playlist.id}")
                connection.disconnect()
                return emptyList()
            }
            val json = connection.inputStream.bufferedReader().use { reader -> reader.readText() }
            connection.disconnect()
            val songs = parseSongsFromJson(json, playlist.id)
            Log.d(TAG, "fetchSongs parsed ${songs.size} songs for ${playlist.id}")
            songs
        } catch (e: Exception) {
            Log.e(TAG, "fetchSongs error for ${playlist.id}", e)
            emptyList()
        }
    }

    private fun parseSongsFromJson(json: String, playlistId: String): List<AutoSong> {
        val songs = mutableListOf<AutoSong>()
        try {
            val root = JSONObject(json)
            val dataObject = root.optJSONObject("data")
            val dataArray: JSONArray = when {
                root.optJSONArray("data") != null -> root.getJSONArray("data")
                root.optJSONArray("results") != null -> root.getJSONArray("results")
                root.optJSONArray("songs") != null -> root.getJSONArray("songs")
                dataObject?.optJSONArray("results") != null -> dataObject.getJSONArray("results")
                dataObject?.optJSONArray("songs") != null -> dataObject.getJSONArray("songs")
                dataObject?.optJSONArray("data") != null -> dataObject.getJSONArray("data")
                else -> return emptyList()
            }
            for (i in 0 until dataArray.length()) {
                try {
                    val item = dataArray.getJSONObject(i)
                    val id = item.optString("id", "song-$i")
                    val title = cleanText(item.optString("name", item.optString("title", "")))
                    if (title.isBlank()) continue
                    val audioUrl = extractAudioUrl(item)
                    if (audioUrl.isBlank()) continue
                    val artist = cleanText(
                        item.optString("primaryArtists",
                        item.optString("artist",
                        item.optString("singers", artistNames(item))))
                    ).ifBlank { "Mavrixfy" }
                    val album = cleanText(albumName(item))
                    val duration = item.optLong("duration", 0L)
                    val artUrl = extractArtUrl(item)
                    songs.add(
                        AutoSong(
                            mediaId = "$SONG_PREFIX$playlistId:$id",
                            title = title,
                            artist = artist,
                            album = album,
                            durationSeconds = duration,
                            audioUrl = audioUrl,
                            artUrl = artUrl.takeIf { it.isNotBlank() }
                        )
                    )
                } catch (e: Exception) {
                    Log.d(TAG, "parseSongsFromJson item error", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "parseSongsFromJson error", e)
        }
        return songs
    }

    private fun extractAudioUrl(item: JSONObject): String {
        // Try downloadUrl array first (JioSaavn style)
        if (item.has("downloadUrl")) {
            try {
                val arr = item.getJSONArray("downloadUrl")
                // prefer highest quality
                for (q in listOf("320kbps", "160kbps", "96kbps", "48kbps")) {
                    for (j in arr.length() - 1 downTo 0) {
                        val entry = arr.getJSONObject(j)
                        if (entry.optString("quality") == q) {
                            val u = entry.optString("url", entry.optString("link", ""))
                            if (u.isNotBlank()) return cleanUrl(u)
                        }
                    }
                }
                // fallback: last entry
                val fallbackEntry = arr.getJSONObject(arr.length() - 1)
                val u = fallbackEntry.optString("url", fallbackEntry.optString("link", ""))
                if (u.isNotBlank()) return cleanUrl(u)
            } catch (_: Exception) {}
        }
        // Try direct audio fields
        for (key in listOf("audio_url", "audioUrl", "stream_url", "previewUrl", "url")) {
            val u = item.optString(key, "")
            if (u.isNotBlank()) return cleanUrl(u)
        }
        return ""
    }

    private fun artistNames(item: JSONObject): String {
        return try {
            val primary = item.optJSONObject("artists")?.optJSONArray("primary") ?: return ""
            val names = mutableListOf<String>()
            for (i in 0 until primary.length()) {
                val name = primary.optJSONObject(i)?.optString("name", "").orEmpty()
                if (name.isNotBlank()) names.add(name)
            }
            names.joinToString(", ")
        } catch (_: Exception) {
            ""
        }
    }

    private fun albumName(item: JSONObject): String {
        val albumValue = item.opt("album")
        return when (albumValue) {
            is JSONObject -> albumValue.optString("name", "")
            is String -> albumValue
            else -> ""
        }
    }

    private fun extractArtUrl(item: JSONObject): String {
        if (item.has("image")) {
            try {
                val arr = item.getJSONArray("image")
                for (q in listOf("500x500", "150x150", "50x50")) {
                    for (j in arr.length() - 1 downTo 0) {
                        val entry = arr.getJSONObject(j)
                        if (entry.optString("quality") == q) {
                            val u = entry.optString("url", "")
                            if (u.isNotBlank()) return cleanUrl(u)
                        }
                    }
                }
                val u = arr.getJSONObject(arr.length() - 1).optString("url", "")
                if (u.isNotBlank()) return cleanUrl(u)
            } catch (_: Exception) {}
        }
        for (key in listOf("image_url", "imageUrl", "artwork", "thumbnail", "cover")) {
            val u = item.optString(key, "")
            if (u.isNotBlank()) return cleanUrl(u)
        }
        return ""
    }

    private fun playSongQueue(selectedSong: AutoSong, queue: List<AutoSong>) {
        val playableQueue = queue.filter { it.audioUrl.isNotBlank() }

        if (playableQueue.isEmpty()) {
            AutoMediaModule.emitRemoteCommand(applicationContext, "play")
            return
        }

        val orderedQueue = playableQueue

        currentAutoQueue = orderedQueue
        currentAutoQueueIndex = orderedQueue.indexOfFirst { it.mediaId == selectedSong.mediaId }.coerceAtLeast(0)
        phonePlaybackActive = true
        phonePlaybackMediaId = selectedSong.mediaId
        phonePlaybackTitle = selectedSong.title
        phonePlaybackArtist = selectedSong.artist
        phonePlaybackAlbum = selectedSong.album
        phonePlaybackArtUrl = selectedSong.artUrl.orEmpty()
        phonePlaybackDurationMs = selectedSong.durationSeconds.coerceAtLeast(0L) * 1000L
        phonePlaybackPositionMs = 0L
        phonePlaybackIsPlaying = true

        updateAutoSessionForSong(
            song = selectedSong,
            queue = orderedQueue,
            activeIndex = currentAutoQueueIndex,
            isPlaying = true,
            positionMs = 0L
        )

        AutoMediaModule.emitRemoteCommand(
            context = applicationContext,
            command = "playFromMediaId",
            queueIndex = currentAutoQueueIndex,
            song = selectedSong.toBridgeBundle(),
            queue = orderedQueue.map { it.toBridgeBundle() }
        )
    }

    private fun AutoSong.toBridgeBundle(): Bundle {
        return Bundle().apply {
            putString("id", mediaId)
            putString("title", title)
            putString("artist", artist)
            putString("album", album)
            putDouble("duration", durationSeconds.toDouble())
            putString("coverUrl", artUrl.orEmpty())
            putString("genre", "Mavrixfy")
            putString("audioUrl", audioUrl)
            putString("source", "jiosaavn")
        }
    }

    private fun bundleToAutoSong(bundle: Bundle, index: Int): AutoSong? {
        val mediaId = bundle.getString("id").orEmpty().ifBlank { "phone-$index" }
        val title = cleanText(bundle.getString("title").orEmpty())
        val audioUrl = bundle.getString("audioUrl").orEmpty()
        if (title.isBlank() || audioUrl.isBlank()) return null

        return AutoSong(
            mediaId = mediaId,
            title = title,
            artist = cleanText(bundle.getString("artist").orEmpty()).ifBlank { "Mavrixfy" },
            album = cleanText(bundle.getString("album").orEmpty()),
            durationSeconds = bundle.getDouble("duration", 0.0).toLong(),
            audioUrl = audioUrl,
            artUrl = cleanUrl(bundle.getString("coverUrl").orEmpty()).takeIf { it.isNotBlank() }
        )
    }

    private fun fetchBitmap(url: String): Bitmap? {
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = true
            connection.connectTimeout = 3000
            connection.readTimeout = 5000
            connection.setRequestProperty("User-Agent", USER_AGENT)
            connection.setRequestProperty("Accept", "image/*,*/*")
            connection.inputStream.use { stream ->
                BitmapFactory.decodeStream(stream)
            }.also {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun performPhonePlaybackSync(
        songId: String,
        title: String,
        artist: String,
        album: String,
        artUrl: String,
        durationMs: Long,
        positionMs: Long,
        isPlaying: Boolean
    ) {
        phonePlaybackMediaId = songId.ifBlank { "phone" }
        phonePlaybackTitle = cleanText(title).ifBlank { "Mavrixfy" }
        phonePlaybackArtist = cleanText(artist).ifBlank { "Phone playback" }
        phonePlaybackAlbum = cleanText(album)
        phonePlaybackArtUrl = cleanUrl(artUrl)
        phonePlaybackDurationMs = durationMs.coerceAtLeast(0L)
        phonePlaybackPositionMs = positionMs.coerceAtLeast(0L)
        phonePlaybackIsPlaying = isPlaying
        phonePlaybackActive = phonePlaybackTitle.isNotBlank()
        updateAutoSessionFromPhonePlayback()
    }

    private fun handlePhonePlaybackSync(intent: Intent) {
        performPhonePlaybackSync(
            songId = intent.getStringExtra(EXTRA_SONG_ID).orEmpty(),
            title = intent.getStringExtra(EXTRA_TITLE).orEmpty(),
            artist = intent.getStringExtra(EXTRA_ARTIST).orEmpty(),
            album = intent.getStringExtra(EXTRA_ALBUM).orEmpty(),
            artUrl = intent.getStringExtra(EXTRA_ART_URL).orEmpty(),
            durationMs = intent.getLongExtra(EXTRA_DURATION_MS, 0L),
            positionMs = intent.getLongExtra(EXTRA_POSITION_MS, 0L),
            isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false)
        )
    }

    private fun performPhoneQueueSync(bundles: ArrayList<Bundle>, requestedIndex: Int) {
        val songs = bundles.mapIndexedNotNull { index, bundle -> bundleToAutoSong(bundle, index) }
        if (songs.isEmpty()) return

        currentAutoQueueIndex = when {
            requestedIndex in songs.indices -> requestedIndex
            phonePlaybackMediaId.isNotBlank() -> songs.indexOfFirst { it.mediaId == phonePlaybackMediaId }
            else -> 0
        }.coerceAtLeast(0)
        songs.forEach { songCache[it.mediaId] = it }
        currentAutoQueue = songs
        Log.i(TAG, "synced playback queue size=${songs.size} activeIndex=$currentAutoQueueIndex mediaId=$phonePlaybackMediaId")
        if (phonePlaybackActive) updateAutoSessionFromPhonePlayback()
    }

    private fun handlePhoneQueueSync(intent: Intent) {
        @Suppress("DEPRECATION")
        val bundles: ArrayList<Bundle> =
            intent.getParcelableArrayListExtra(EXTRA_QUEUE_SONGS) ?: arrayListOf()
        val requestedIndex = intent.getIntExtra(EXTRA_QUEUE_INDEX, -1)
        performPhoneQueueSync(bundles, requestedIndex)
    }

    private fun clearPhonePlayback() {
        phonePlaybackActive = false
        phonePlaybackMediaId = ""
        phonePlaybackTitle = ""
        phonePlaybackArtist = ""
        phonePlaybackAlbum = ""
        phonePlaybackArtUrl = ""
        phonePlaybackDurationMs = 0L
        phonePlaybackPositionMs = 0L
        phonePlaybackIsPlaying = false
        updatePlaybackState(isPlaying = false, positionMs = 0L)
    }

    private fun updateAutoSessionFromPhonePlayback() {
        if (!phonePlaybackActive || phonePlaybackTitle.isBlank()) return
        val activeSong = currentAutoQueue.firstOrNull { it.mediaId == phonePlaybackMediaId }
        val song = activeSong ?: AutoSong(
            mediaId = phonePlaybackMediaId.ifBlank { "phone" },
            title = phonePlaybackTitle,
            artist = phonePlaybackArtist.ifBlank { "Mavrixfy" },
            album = phonePlaybackAlbum,
            durationSeconds = phonePlaybackDurationMs.coerceAtLeast(0L) / 1000L,
            audioUrl = "",
            artUrl = phonePlaybackArtUrl.takeIf { it.isNotBlank() }
        )
        val queue = currentAutoQueue.takeIf { it.isNotEmpty() } ?: listOf(song)
        val activeIndex = queue.indexOfFirst { it.mediaId == song.mediaId }.takeIf { it >= 0 }
            ?: currentAutoQueueIndex.coerceAtLeast(0)

        updateAutoSessionForSong(
            song = song,
            queue = queue,
            activeIndex = activeIndex,
            isPlaying = phonePlaybackIsPlaying,
            positionMs = phonePlaybackPositionMs
        )
    }

    private fun updateAutoSessionForSong(
        song: AutoSong,
        queue: List<AutoSong>,
        activeIndex: Int,
        isPlaying: Boolean,
        positionMs: Long
    ) {
        if (!::autoMediaSession.isInitialized) return
        mainHandler.post {
            val durationMs = song.durationSeconds.coerceAtLeast(0L) * 1000L
            val metadata = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, song.mediaId)
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, song.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, song.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, song.album)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, song.title)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, song.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, song.album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
                .apply {
                    song.artUrl?.takeIf { it.isNotBlank() }?.let { artUrl ->
                        putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, artUrl)
                        putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artUrl)
                    }
                }
                .build()
            val queueItems = queue
                .ifEmpty { listOf(song) }
                .mapIndexed { index, item ->
                    MediaSessionCompat.QueueItem(item.toSessionDescription(), index.toLong())
                }

            autoMediaSession.setQueueTitle("Mavrixfy")
            autoMediaSession.setQueue(queueItems)
            autoMediaSession.setMetadata(metadata)
            updatePlaybackState(isPlaying, positionMs, activeIndex)
            autoMediaSession.isActive = true
            Log.d(TAG, "AutoSession metadata updated song=${song.mediaId} playing=$isPlaying")
        }
    }

    private fun updatePlaybackState(
        isPlaying: Boolean,
        positionMs: Long,
        activeIndex: Int = currentAutoQueueIndex.coerceAtLeast(0)
    ) {
        if (!::autoMediaSession.isInitialized) return
        val state = if (isPlaying) {
            PlaybackStateCompat.STATE_PLAYING
        } else {
            PlaybackStateCompat.STATE_PAUSED
        }
        autoMediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(playbackActions())
                .setActiveQueueItemId(activeIndex.coerceAtLeast(0).toLong())
                .setState(state, positionMs.coerceAtLeast(0L), if (isPlaying) 1f else 0f)
                .build()
        )
    }

    private fun playbackActions(): Long {
        return PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SKIP_TO_QUEUE_ITEM
    }

    private fun performLikedSongsSync(bundles: ArrayList<Bundle>) {
        val songs = mutableListOf<AutoSong>()

        for (index in bundles.indices) {
            val bundle = bundles[index]
            val id = bundle.getString("id").orEmpty().ifBlank { "liked-$index" }
            val title = cleanText(bundle.getString("title").orEmpty())
            val audioUrl = bundle.getString("audioUrl").orEmpty()
            if (title.isBlank() || audioUrl.isBlank()) continue

            songs.add(
                AutoSong(
                    mediaId = "$SONG_PREFIX$LIKED_PLAYLIST_ID:$id",
                    title = title,
                    artist = cleanText(bundle.getString("artist").orEmpty()).ifBlank { "Mavrixfy" },
                    album = cleanText(bundle.getString("album").orEmpty()),
                    durationSeconds = bundle.getDouble("duration", 0.0).toLong(),
                    audioUrl = audioUrl,
                    artUrl = cleanUrl(bundle.getString("coverUrl").orEmpty()).takeIf { it.isNotBlank() }
                )
            )
        }

        likedSongCache = songs
        categoryCache[LIKED_PLAYLIST_ID] = songs
        songs.forEach { songCache[it.mediaId] = it }
        songs.firstOrNull()?.artUrl?.let { artUrl ->
            artExecutor.execute {
                fetchBitmap(artUrl)?.let { bitmap ->
                    albumArtCache[playlistArtCacheKey(LIKED_PLAYLIST_ID)] = bitmap
                }
            }
        }
        Log.d(TAG, "synced ${songs.size} liked songs")
    }

    private fun handleLikedSongsSync(intent: Intent) {
        @Suppress("DEPRECATION")
        val bundles: ArrayList<Bundle> =
            intent.getParcelableArrayListExtra(EXTRA_LIKED_SONGS) ?: arrayListOf()
        performLikedSongsSync(bundles)
    }

    private fun generatedTileBitmap(key: String, title: String, accentColor: Int, tag: String? = null): Bitmap {
        return generatedArtCache.getOrPut(key) {
            val size = 640
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = LinearGradient(
                    0f,
                    0f,
                    size.toFloat(),
                    size.toFloat(),
                    accentColor,
                    Color.rgb(18, 18, 18),
                    Shader.TileMode.CLAMP
                )
            }
            canvas.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), 28f, 28f, backgroundPaint)

            val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textAlign = Paint.Align.CENTER
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

            val label = title
                .split(Regex("\\s+"))
                .filter { it.isNotBlank() }
                .take(2)
                .joinToString("") { it.first().uppercaseChar().toString() }
                .ifBlank { "M" }

            textPaint.textSize = if (label.length > 1) 184f else 236f
            val metrics = textPaint.fontMetrics
            val centerY = size / 2f - (metrics.ascent + metrics.descent) / 2f
            canvas.drawText(label, size / 2f, centerY, textPaint)

            tag?.takeIf { it.isNotBlank() }?.let {
                val chipPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.argb(130, 0, 0, 0)
                }
                val chipRect = RectF(34f, 34f, 260f, 94f)
                canvas.drawRoundRect(chipRect, 30f, 30f, chipPaint)
                val tagPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.WHITE
                    textAlign = Paint.Align.CENTER
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    textSize = 30f
                }
                canvas.drawText(it.take(12), chipRect.centerX(), chipRect.centerY() + 11f, tagPaint)
            }
            bitmap
        }
    }

    private fun playlistCoverBitmap(playlistId: String): Bitmap? {
        return albumArtCache[playlistArtCacheKey(playlistId)]
    }

    private fun preloadPlaylistArt(playlistId: String, artUrl: String?) {
        val cleanArtUrl = artUrl?.takeIf { it.isNotBlank() } ?: return
        val cacheKey = playlistArtCacheKey(playlistId)
        if (albumArtCache.containsKey(cacheKey)) return
        artExecutor.execute {
            fetchBitmap(cleanArtUrl)?.let { bitmap ->
                albumArtCache[cacheKey] = bitmap
            }
        }
    }

    private fun playlistArtCacheKey(playlistId: String) = "playlist-art:$playlistId"

    private fun navIconUri(id: String): Uri {
        val drawableId = when (id) {
            "home" -> R.drawable.ic_auto_home
            "recent" -> R.drawable.ic_auto_recent
            "browse" -> R.drawable.ic_auto_browse
            "library" -> R.drawable.ic_auto_library
            else -> R.drawable.ic_auto_home
        }
        return Uri.parse("android.resource://$packageName/$drawableId")
    }

    private fun playlistsForNav(navId: String): List<AutoPlaylist> {
        return playlists.filter { navId in it.navIds }
    }

    private fun browserRootExtras(): Bundle {
        return Bundle().apply {
            putBoolean(BROWSER_SERVICE_EXTRAS_KEY_CONTENT_STYLE_SUPPORTED, true)
            putBoolean(BROWSER_SERVICE_EXTRAS_KEY_SEARCH_SUPPORTED, true)
            putInt(
                DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                CONTENT_STYLE_GRID_ITEM_HINT_VALUE
            )
            putInt(
                DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_PLAYABLE,
                CONTENT_STYLE_LIST_ITEM_HINT_VALUE
            )
        }
    }

    private fun cleanText(value: String): String {
        val decoded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY).toString()
        } else {
            @Suppress("DEPRECATION")
            Html.fromHtml(value).toString()
        }
        return decoded.replace(Regex("\\s+"), " ").trim()
    }

    private fun cleanUrl(value: String): String {
        return cleanText(value).trim()
    }

    private fun playlistParentId(id: String) = "$PLAYLIST_PREFIX$id"
    private fun navParentId(id: String) = "$NAV_PREFIX$id"

    companion object {
        @Volatile
        var instance: MavrixfyAutoService? = null

        const val ROOT_ID = "root"
        const val NAV_PREFIX = "nav:"
        const val PLAYLIST_PREFIX = "playlist:"
        const val SONG_PREFIX = "song:"
        const val SEARCH_PREFIX = "search:"
        const val LIKED_PLAYLIST_ID = "liked_songs"
        const val API_BASE = "https://mavrixfy-song-api.vercel.app"
        const val TAG = "MavrixfyAutoService"
        const val USER_AGENT = "Mavrixfy/2.5.1 AndroidAuto"
        const val BROWSER_SERVICE_EXTRAS_KEY_CONTENT_STYLE_SUPPORTED =
            "android.media.browse.CONTENT_STYLE_SUPPORTED"
        const val BROWSER_SERVICE_EXTRAS_KEY_SEARCH_SUPPORTED =
            "android.media.browse.SEARCH_SUPPORTED"
        const val DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE =
            "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
        const val DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_PLAYABLE =
            "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
        const val CONTENT_STYLE_LIST_ITEM_HINT_VALUE = 1
        const val CONTENT_STYLE_GRID_ITEM_HINT_VALUE = 2
        const val CONTENT_STYLE_CATEGORY_GRID_ITEM_HINT_VALUE = 4
        const val EXTRA_PLAYLIST_TAG = "com.mavrixfy.app.auto.PLAYLIST_TAG"
        const val ACTION_SYNC_PHONE_PLAYBACK = "com.mavrixfy.app.auto.SYNC_PHONE_PLAYBACK"
        const val ACTION_CLEAR_PHONE_PLAYBACK = "com.mavrixfy.app.auto.CLEAR_PHONE_PLAYBACK"
        const val ACTION_SYNC_PHONE_QUEUE = "com.mavrixfy.app.auto.SYNC_PHONE_QUEUE"
        const val ACTION_SYNC_LIKED_SONGS = "com.mavrixfy.app.auto.SYNC_LIKED_SONGS"
        const val EXTRA_LIKED_SONGS = "liked_songs"
        const val EXTRA_QUEUE_SONGS = "queue_songs"
        const val EXTRA_QUEUE_INDEX = "queue_index"
        const val EXTRA_SONG_ID = "song_id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_ALBUM = "album"
        const val EXTRA_ART_URL = "art_url"
        const val EXTRA_DURATION_MS = "duration_ms"
        const val EXTRA_POSITION_MS = "position_ms"
        const val EXTRA_IS_PLAYING = "is_playing"
    }
}
