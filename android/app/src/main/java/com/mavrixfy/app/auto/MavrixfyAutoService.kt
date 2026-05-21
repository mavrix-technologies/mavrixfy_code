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

    private val browserExecutor = Executors.newSingleThreadExecutor()
    private val artExecutor = Executors.newFixedThreadPool(2)
    private val categoryCache = ConcurrentHashMap<String, List<AutoSong>>()
    private val songCache = ConcurrentHashMap<String, AutoSong>()
    private val albumArtCache = ConcurrentHashMap<String, Bitmap>()
    private val generatedArtCache = ConcurrentHashMap<String, Bitmap>()
    private var likedSongCache: List<AutoSong> = emptyList()
    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var mediaSession: MediaSessionCompat
    private var currentState = PlaybackStateCompat.STATE_STOPPED
    private var phonePlaybackActive = false
    private var phonePlaybackMediaId = ""
    private var phonePlaybackTitle = ""
    private var phonePlaybackArtist = ""
    private var phonePlaybackAlbum = ""
    private var phonePlaybackArtUrl = ""
    private var phonePlaybackDurationMs = 0L
    private var phonePlaybackPositionMs = 0L
    private var isShuffleEnabled = false
    private var currentAutoQueue: List<AutoSong> = emptyList()
    private var currentAutoQueueIndex = -1

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate")
        AutoMediaModule.warmReactRuntime(applicationContext)

        mediaSession = MediaSessionCompat(this, "MavrixfyAutoService").apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlayFromMediaId(mediaId: String, extras: Bundle?) {
                    val song = songCache[mediaId]
                    if (song == null) {
                        playDefaultPlaylist()
                        return
                    }

                    val categoryId = mediaId.removePrefix(SONG_PREFIX).substringBefore(":")
                    val queue = categoryCache[categoryId].orEmpty().ifEmpty { listOf(song) }
                    playSongQueue(song, queue)
                }

                override fun onPlay() {
                    if (phonePlaybackActive) {
                        setPhonePlaybackState(PlaybackStateCompat.STATE_PLAYING)
                        emitCurrentAutoCommand("play")
                    } else {
                        playDefaultPlaylist()
                    }
                }

                override fun onPause() {
                    AutoMediaModule.emitRemoteCommand(applicationContext, "pause")
                    if (phonePlaybackActive) setPhonePlaybackState(PlaybackStateCompat.STATE_PAUSED)
                }

                override fun onStop() {
                    AutoMediaModule.emitRemoteCommand(applicationContext, "pause")
                    if (phonePlaybackActive) setPhonePlaybackState(PlaybackStateCompat.STATE_PAUSED)
                }

                override fun onSkipToNext() {
                    if (moveAutoQueueBy(1)) {
                        emitCurrentAutoCommand("next")
                    } else {
                        AutoMediaModule.emitRemoteCommand(applicationContext, "next")
                    }
                }

                override fun onSkipToPrevious() {
                    if (moveAutoQueueBy(-1)) {
                        emitCurrentAutoCommand("previous")
                    } else {
                        AutoMediaModule.emitRemoteCommand(applicationContext, "previous")
                    }
                }

                override fun onSkipToQueueItem(id: Long) {
                    val index = id.toInt()
                    if (index !in currentAutoQueue.indices) return
                    val nextSong = currentAutoQueue[index]
                    publishAutoPlayback(nextSong, currentAutoQueue, index)
                    AutoMediaModule.emitRemoteCommand(
                        context = applicationContext,
                        command = "skipToQueueItem",
                        queueIndex = index,
                        song = nextSong.toBridgeBundle(),
                        queue = currentAutoQueue.map { it.toBridgeBundle() }
                    )
                }

                override fun onSeekTo(pos: Long) {
                    phonePlaybackPositionMs = pos.coerceAtLeast(0L)
                    AutoMediaModule.emitRemoteCommand(applicationContext, "seek", phonePlaybackPositionMs)
                    if (phonePlaybackActive) setPhonePlaybackState(currentState)
                }

                override fun onSetShuffleMode(shuffleMode: Int) {
                    isShuffleEnabled = shuffleMode == PlaybackStateCompat.SHUFFLE_MODE_ALL
                    if (phonePlaybackActive) {
                        setPhonePlaybackState(currentState)
                    } else {
                        setIdlePlaybackState()
                    }
                }
            })
            isActive = false
        }

        sessionToken = mediaSession.sessionToken
        mediaSession.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Mavrixfy")
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Ready to browse")
                .build()
        )
        setIdlePlaybackState()
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

        categoryCache[playlist.id]?.let { cachedSongs ->
            result.sendResult(playlist.toChildren(cachedSongs))
            return
        }

        result.detach()
        browserExecutor.execute {
            val songs = fetchSongs(playlist)
            Log.d(TAG, "loaded ${songs.size} songs for ${playlist.id}")
            categoryCache[playlist.id] = songs
            songs.forEach { songCache[it.mediaId] = it }
            result.sendResult(playlist.toChildren(songs))
        }
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

    override fun onDestroy() {
        browserExecutor.shutdownNow()
        artExecutor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        mediaSession.release()
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

        val allPlaylistsReady = sectionPlaylists.all { categoryCache.containsKey(it.id) }
        if (allPlaylistsReady) {
            result.sendResult(sectionPlaylists.map { it.toMediaItem() })
            return
        }

        result.detach()
        browserExecutor.execute {
            sectionPlaylists.forEach { playlist ->
                if (!categoryCache.containsKey(playlist.id)) {
                    val songs = fetchSongs(playlist)
                    Log.d(TAG, "loaded ${songs.size} card songs for ${playlist.id}")
                    categoryCache[playlist.id] = songs
                    songs.forEach { songCache[it.mediaId] = it }
                    preloadPlaylistArt(playlist.id, songs.firstOrNull()?.artUrl)
                }
            }
            result.sendResult(sectionPlaylists.map { it.toMediaItem() })
        }
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

    private fun AutoSong.toMediaItem(): MediaBrowserCompat.MediaItem {
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

        return MediaBrowserCompat.MediaItem(builder.build(), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
    }

    private fun AutoPlaylist.toChildren(songs: List<AutoSong>): List<MediaBrowserCompat.MediaItem> {
        return songs.map { it.toMediaItem() }
    }

    private fun playDefaultPlaylist() {
        browserExecutor.execute {
            val playlist = playlists.firstOrNull { "home" in it.navIds } ?: playlists.firstOrNull()
            if (playlist == null) {
                AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                return@execute
            }
            val songs = categoryCache[playlist.id] ?: fetchSongs(playlist).also { fetchedSongs ->
                categoryCache[playlist.id] = fetchedSongs
                fetchedSongs.forEach { songCache[it.mediaId] = it }
            }
            val firstSong = songs.firstOrNull { it.audioUrl.isNotBlank() }
            if (firstSong == null) {
                AutoMediaModule.emitRemoteCommand(applicationContext, "play")
                return@execute
            }
            playSongQueue(firstSong, songs)
        }
    }

    private fun playSongQueue(selectedSong: AutoSong, queue: List<AutoSong>) {
        val playableQueue = queue.filter { it.audioUrl.isNotBlank() }

        if (playableQueue.isEmpty()) {
            AutoMediaModule.emitRemoteCommand(applicationContext, "play")
            return
        }

        val orderedQueue = if (isShuffleEnabled) {
            listOf(selectedSong) + playableQueue
                .filterNot { it.mediaId == selectedSong.mediaId }
                .shuffled()
        } else {
            playableQueue
        }
        publishAutoPlayback(selectedSong, orderedQueue)
        AutoMediaModule.emitRemoteCommand(
            context = applicationContext,
            command = "playFromMediaId",
            queueIndex = currentAutoQueueIndex,
            song = selectedSong.toBridgeBundle(),
            queue = orderedQueue.map { it.toBridgeBundle() }
        )
    }

    private fun moveAutoQueueBy(delta: Int): Boolean {
        if (currentAutoQueue.isEmpty()) return false
        val nextIndex = (currentAutoQueueIndex + delta).coerceIn(0, currentAutoQueue.lastIndex)
        if (nextIndex == currentAutoQueueIndex) return false
        val nextSong = currentAutoQueue[nextIndex]
        publishAutoPlayback(nextSong, currentAutoQueue, nextIndex)
        return true
    }

    private fun publishAutoPlayback(
        selectedSong: AutoSong,
        queue: List<AutoSong>,
        selectedIndex: Int = queue.indexOfFirst { it.mediaId == selectedSong.mediaId }.coerceAtLeast(0)
    ) {
        currentAutoQueue = queue
        currentAutoQueueIndex = selectedIndex.coerceIn(0, queue.lastIndex.coerceAtLeast(0))
        phonePlaybackActive = true
        mediaSession.isActive = true
        phonePlaybackMediaId = selectedSong.mediaId
        phonePlaybackTitle = selectedSong.title
        phonePlaybackArtist = selectedSong.artist
        phonePlaybackAlbum = selectedSong.album
        phonePlaybackArtUrl = selectedSong.artUrl.orEmpty()
        phonePlaybackDurationMs = selectedSong.durationSeconds.coerceAtLeast(0L) * 1000L
        phonePlaybackPositionMs = 0L
        updateSessionQueue(queue)
        setPhonePlaybackMetadata(albumArtCache[phoneArtCacheKey(phonePlaybackMediaId, phonePlaybackArtUrl)])
        loadPhoneAlbumArt(phonePlaybackMediaId, phonePlaybackArtUrl)
        setPhonePlaybackState(PlaybackStateCompat.STATE_PLAYING)
    }

    private fun emitCurrentAutoCommand(command: String) {
        val selectedSong = currentAutoQueue.getOrNull(currentAutoQueueIndex)
            ?: songCache[phonePlaybackMediaId]
        if (selectedSong == null || currentAutoQueue.isEmpty()) {
            AutoMediaModule.emitRemoteCommand(applicationContext, command)
            return
        }

        AutoMediaModule.emitRemoteCommand(
            context = applicationContext,
            command = command,
            queueIndex = currentAutoQueueIndex,
            song = selectedSong.toBridgeBundle(),
            queue = currentAutoQueue.map { it.toBridgeBundle() }
        )
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

    private fun AutoSong.toQueueItem(index: Int): MediaSessionCompat.QueueItem {
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(mediaId)
            .setTitle(title)
            .setSubtitle(artist.ifBlank { album })
            .setDescription(album)
            .apply {
                artUrl?.takeIf { it.isNotBlank() }?.let { setIconUri(Uri.parse(it)) }
            }
            .build()
        return MediaSessionCompat.QueueItem(description, index.toLong())
    }

    private fun updateSessionQueue(queue: List<AutoSong>, title: String = "Mavrixfy") {
        currentAutoQueue = queue
        val indexByMediaId = queue.indexOfFirst { it.mediaId == phonePlaybackMediaId }
        if (indexByMediaId >= 0) {
            currentAutoQueueIndex = indexByMediaId
        } else if (currentAutoQueueIndex !in queue.indices) {
            currentAutoQueueIndex = if (queue.isNotEmpty()) 0 else -1
        }
        mediaSession.setQueue(queue.mapIndexed { index, song -> song.toQueueItem(index) })
        mediaSession.setQueueTitle(title)
    }

    private fun currentActiveQueueItemId(): Long {
        val indexByMediaId = currentAutoQueue.indexOfFirst { it.mediaId == phonePlaybackMediaId }
        val resolvedIndex = if (indexByMediaId >= 0) indexByMediaId else currentAutoQueueIndex
        if (resolvedIndex in currentAutoQueue.indices) {
            currentAutoQueueIndex = resolvedIndex
            return resolvedIndex.toLong()
        }
        currentAutoQueueIndex = -1
        return MediaSessionCompat.QueueItem.UNKNOWN_ID.toLong()
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

    private fun setIdlePlaybackState() {
        currentState = PlaybackStateCompat.STATE_STOPPED
        val actions = PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_STOP or
            PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SKIP_TO_QUEUE_ITEM or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE

        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(PlaybackStateCompat.STATE_STOPPED, 0L, 0f)
                .build()
        )
    }

    private fun handlePhonePlaybackSync(intent: Intent) {
        val title = cleanText(intent.getStringExtra(EXTRA_TITLE).orEmpty()).ifBlank { "Mavrixfy" }
        val artist = cleanText(intent.getStringExtra(EXTRA_ARTIST).orEmpty()).ifBlank { "Phone playback" }
        val album = cleanText(intent.getStringExtra(EXTRA_ALBUM).orEmpty())
        val mediaId = intent.getStringExtra(EXTRA_SONG_ID).orEmpty().ifBlank { "phone" }
        val artUrl = cleanUrl(intent.getStringExtra(EXTRA_ART_URL).orEmpty())
        val durationMs = intent.getLongExtra(EXTRA_DURATION_MS, 0L).coerceAtLeast(0L)
        phonePlaybackPositionMs = intent.getLongExtra(EXTRA_POSITION_MS, 0L).coerceAtLeast(0L)
        val state = if (intent.getBooleanExtra(EXTRA_IS_PLAYING, false)) {
            PlaybackStateCompat.STATE_PLAYING
        } else {
            PlaybackStateCompat.STATE_PAUSED
        }

        phonePlaybackActive = true
        mediaSession.isActive = true
        val metadataChanged = mediaId != phonePlaybackMediaId ||
            title != phonePlaybackTitle ||
            artist != phonePlaybackArtist ||
            album != phonePlaybackAlbum ||
            artUrl != phonePlaybackArtUrl ||
            durationMs != phonePlaybackDurationMs

        if (metadataChanged) {
            phonePlaybackMediaId = mediaId
            phonePlaybackTitle = title
            phonePlaybackArtist = artist
            phonePlaybackAlbum = album
            phonePlaybackArtUrl = artUrl
            phonePlaybackDurationMs = durationMs
            val syncedQueueIndex = currentAutoQueue.indexOfFirst { it.mediaId == mediaId }
            if (syncedQueueIndex >= 0) {
                currentAutoQueueIndex = syncedQueueIndex
                mediaSession.setQueueTitle("Mavrixfy")
            } else {
                updateSessionQueue(
                    listOf(
                        AutoSong(
                            mediaId = mediaId,
                            title = title,
                            artist = artist,
                            album = album,
                            durationSeconds = durationMs / 1000L,
                            audioUrl = "",
                            artUrl = artUrl.takeIf { it.isNotBlank() }
                        )
                    ),
                    "Mavrixfy"
                )
                mediaSession.setQueueTitle("Mavrixfy phone")
            }
            setPhonePlaybackMetadata(albumArtCache[phoneArtCacheKey(mediaId, artUrl)])
            loadPhoneAlbumArt(mediaId, artUrl)
        }
        setPhonePlaybackState(state)
    }

    private fun handlePhoneQueueSync(intent: Intent) {
        @Suppress("DEPRECATION")
        val bundles: ArrayList<Bundle> =
            intent.getParcelableArrayListExtra(EXTRA_QUEUE_SONGS) ?: arrayListOf()
        val songs = bundles.mapIndexedNotNull { index, bundle -> bundleToAutoSong(bundle, index) }
        if (songs.isEmpty()) return

        val requestedIndex = intent.getIntExtra(EXTRA_QUEUE_INDEX, -1)
        currentAutoQueueIndex = when {
            requestedIndex in songs.indices -> requestedIndex
            phonePlaybackMediaId.isNotBlank() -> songs.indexOfFirst { it.mediaId == phonePlaybackMediaId }
            else -> 0
        }.coerceAtLeast(0)
        songs.forEach { songCache[it.mediaId] = it }
        updateSessionQueue(songs)
        if (phonePlaybackActive) {
            setPhonePlaybackState(currentState)
        }
        Log.i(TAG, "synced playback queue size=${songs.size} activeIndex=$currentAutoQueueIndex mediaId=$phonePlaybackMediaId")
    }

    private fun clearPhonePlayback() {
        if (!phonePlaybackActive) return
        phonePlaybackActive = false
        phonePlaybackMediaId = ""
        phonePlaybackTitle = ""
        phonePlaybackArtist = ""
        phonePlaybackAlbum = ""
        phonePlaybackArtUrl = ""
        phonePlaybackDurationMs = 0L
        phonePlaybackPositionMs = 0L
        setIdlePlaybackState()
        mediaSession.isActive = false
    }

    private fun handleLikedSongsSync(intent: Intent) {
        @Suppress("DEPRECATION")
        val bundles: ArrayList<Bundle> =
            intent.getParcelableArrayListExtra(EXTRA_LIKED_SONGS) ?: arrayListOf()
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

    private fun setPhonePlaybackMetadata(albumArt: Bitmap?) {
        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, phonePlaybackMediaId)
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, phonePlaybackTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, phonePlaybackArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, phonePlaybackAlbum)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, phonePlaybackDurationMs)

        phonePlaybackArtUrl.takeIf { it.isNotBlank() }?.let {
            builder.putString(MediaMetadataCompat.METADATA_KEY_ART_URI, it)
            builder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, it)
            builder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, it)
        }

        albumArt?.let {
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, it)
        }

        mediaSession.setMetadata(builder.build())
    }

    private fun loadPhoneAlbumArt(mediaId: String, artUrl: String) {
        if (artUrl.isBlank()) return
        val cacheKey = phoneArtCacheKey(mediaId, artUrl)
        if (albumArtCache.containsKey(cacheKey)) return

        artExecutor.execute {
            val bitmap = fetchBitmap(artUrl) ?: return@execute
            albumArtCache[cacheKey] = bitmap
            mainHandler.post {
                if (phonePlaybackActive &&
                    phonePlaybackMediaId == mediaId &&
                    phonePlaybackArtUrl == artUrl
                ) {
                    setPhonePlaybackMetadata(bitmap)
                }
            }
        }
    }

    private fun setPhonePlaybackState(state: Int) {
        currentState = state
        val actions = PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_STOP or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SKIP_TO_QUEUE_ITEM or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE

        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(actions)
                .setActiveQueueItemId(currentActiveQueueItemId())
                .setState(state, phonePlaybackPositionMs, if (state == PlaybackStateCompat.STATE_PLAYING) 1f else 0f)
                .build()
        )
    }

    private fun phoneArtCacheKey(mediaId: String, artUrl: String) = "phone:$mediaId:$artUrl"

    private fun fetchSongs(playlist: AutoPlaylist): List<AutoSong> {
        return try {
            val encodedQuery = URLEncoder.encode(playlist.query, "UTF-8")
            val connection = URL("$API_BASE/api/search/songs?query=$encodedQuery&limit=20")
                .openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 15000
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")

            connection.inputStream.bufferedReader().use { reader ->
                parseSongs(playlist.id, JSONObject(reader.readText()))
            }.also {
                connection.disconnect()
            }
        } catch (_: Exception) {
            Log.w(TAG, "fetchSongs failed for ${playlist.id}")
            emptyList()
        }
    }

    private fun parseSongs(categoryId: String, json: JSONObject): List<AutoSong> {
        val data = json.optJSONObject("data")
        val songs = firstArray(
            data?.optJSONArray("results"),
            data?.optJSONArray("songs"),
            json.optJSONArray("results"),
            json.optJSONArray("songs")
        ) ?: return emptyList()

        val seenSongs = mutableSetOf<String>()
        return buildList {
            for (index in 0 until songs.length()) {
                val item = songs.optJSONObject(index) ?: continue
                val audioUrl = bestDownloadUrl(item) ?: continue
                val id = item.optString("id", "song-$index")
                val title = cleanText(item.optString("name", item.optString("title", "Unknown song")))
                val artist = cleanText(primaryArtists(item)).ifBlank { "Mavrixfy" }
                val uniqueKey = id.takeIf { it.isNotBlank() } ?: "$title|$artist|$audioUrl"
                if (!seenSongs.add(uniqueKey)) continue

                add(
                    AutoSong(
                        mediaId = "$SONG_PREFIX$categoryId:$id",
                        title = title,
                        artist = artist,
                        album = cleanText(item.optJSONObject("album")?.optString("name").orEmpty()),
                        durationSeconds = item.optLong("duration", 0L),
                        audioUrl = audioUrl,
                        artUrl = bestImageUrl(item)
                    )
                )
            }
        }
    }

    private fun firstArray(vararg arrays: JSONArray?): JSONArray? {
        return arrays.firstOrNull { it != null && it.length() > 0 }
    }

    private fun primaryArtists(item: JSONObject): String {
        val primary = item.optJSONObject("artists")?.optJSONArray("primary") ?: return ""
        return buildList {
            for (index in 0 until primary.length()) {
                val name = cleanText(primary.optJSONObject(index)?.optString("name").orEmpty())
                if (name.isNotBlank()) add(name)
            }
        }.joinToString(", ")
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

    private fun bestDownloadUrl(item: JSONObject): String? {
        val downloads = item.optJSONArray("downloadUrl") ?: return item.optString("audioUrl").takeIf { it.isNotBlank() }
        var fallback: String? = null
        for (index in 0 until downloads.length()) {
            val entry = downloads.optJSONObject(index) ?: continue
            val url = cleanUrl(entry.optString("url"))
            if (url.isBlank()) continue
            fallback = url
            if (entry.optString("quality").contains("320")) return url
        }
        return fallback
    }

    private fun bestImageUrl(item: JSONObject): String? {
        val images = item.optJSONArray("image") ?: return cleanUrl(item.optString("imageUrl")).takeIf { it.isNotBlank() }
        var fallback: String? = null
        for (index in 0 until images.length()) {
            val entry = images.optJSONObject(index) ?: continue
            val url = cleanUrl(entry.optString("url"))
            if (url.isBlank()) continue
            fallback = url
            if (entry.optString("quality").contains("500")) return url
        }
        return fallback
    }

    private fun playlistParentId(id: String) = "$PLAYLIST_PREFIX$id"
    private fun navParentId(id: String) = "$NAV_PREFIX$id"

    companion object {
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
