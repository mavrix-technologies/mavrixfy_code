package com.mavrixfy.app.auto

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaControllerCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.media.MediaBrowserServiceCompat
import androidx.media.utils.MediaConstants
import com.mavrixfy.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Calendar
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "MavrixfyAuto"
private const val AUTO_PLAY_ACTION = "com.mavrixfy.app.AUTO_PLAY_TRACKS"
private const val AUTO_SYNC_ACTION = "com.mavrixfy.app.AUTO_SYNC_STATE"
private const val AUTO_TRANSPORT_ACTION = "com.mavrixfy.app.AUTO_TRANSPORT_COMMAND"
private const val AUTO_PREFS = "mavrixfy_auto_bridge"
private const val PREF_PENDING_PLAY_PAYLOAD = "pending_play_payload"
private const val PREF_PENDING_TRANSPORT_PAYLOAD = "pending_transport_payload"
private val AUTO_PLAY_RETRY_DELAYS_MS = longArrayOf(300L, 1_000L, 2_500L, 5_000L)
private val AUTO_TRANSPORT_RETRY_DELAYS_MS = longArrayOf(250L, 900L)

private const val ROOT_ID         = "root"
private const val TAB_DRIVE       = "tab_drive"
private const val TAB_FRESH       = "tab_fresh"
private const val TAB_DAYPART     = "tab_daypart"
private const val TAB_SWITCHUP    = "tab_switchup"
private const val PLAYLIST_PREFIX = "playlist:"
private const val QUERY_PLAYLIST_PREFIX = "query:"
private const val TRACK_PREFIX    = "track:"
private const val MAX_PLAYLISTS_PER_SHELF = 10
private const val MIN_PLAYLISTS_PER_SHELF = 6
private const val MAX_PLAYLIST_QUERY_ATTEMPTS = 2
private const val EXTRA_DURATION_MS = "mavrixfy.duration_ms"

private const val API_BASE = "https://jiosaavn-api-privatecvc2.vercel.app"
private const val TIMEOUT  = 5_000

private enum class AutoDayPart {
    MORNING,
    AFTERNOON,
    EVENING,
    NIGHT,
}

private data class AutoShelfSpec(
    val id: String,
    val title: String,
    val subtitle: String,
    val queries: List<String>,
    val iconResId: Int,
)

/**
 * MavrixfyAutoService — MediaBrowserServiceCompat for Android Auto.
 *
 * Follows the official Google UAMP pattern:
 *  1. onGetRoot()      → root with content-style hints (tabs)
 *  2. onLoadChildren() → tabs → playlists → tracks
 *  3. MediaSession     → bridges to react-native-track-player's MusicService
 *                        so phone app and car display stay in sync
 *
 * Playback flow:
 *  Car taps track → onPlayFromMediaId → broadcast to RN → TrackPlayer plays
 *  TrackPlayer session state → mirrored into our session → car shows Now Playing
 */
class MavrixfyAutoService : MediaBrowserServiceCompat() {

    private val scope   = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val handler = Handler(Looper.getMainLooper())
    private val artCache = linkedMapOf<String, Bitmap>()
    private val mediaItemCache = linkedMapOf<String, MediaBrowserCompat.MediaItem>()
    private val searchQueueCache = linkedMapOf<String, List<MediaBrowserCompat.MediaItem>>()
    private val searchQueueTitles = linkedMapOf<String, String>()
    private val playlistTitleCache = linkedMapOf<String, String>()
    private val mediaDurationMsCache = linkedMapOf<String, Long>()
    private val shelfPlaylistCache = linkedMapOf<String, MutableList<MediaBrowserCompat.MediaItem>>()
    private val claimedPlaylistIds = linkedSetOf<String>()
    private val claimedPlaylistKeys = linkedSetOf<String>()
    private var browseCycleKey = ""
    private var lastSessionQueueIds: List<String> = emptyList()
    private var lastSessionQueueTitle: String? = null
    private var lastSessionMetadataId: String? = null
    private var mirroredPlaybackState = PlaybackStateCompat.STATE_STOPPED
    private var mirroredPlaybackPositionMs = 0L
    private var mirroredPlaybackBufferedMs = 0L
    private var mirroredPlaybackActiveQueueItemId = -1L
    private var mirroredPlaybackSpeed = 0f
    private var mirroredPlaybackUpdatedAtMs = SystemClock.elapsedRealtime()
    private val playbackTicker = object : Runnable {
        override fun run() {
            if (mirroredPlaybackState != PlaybackStateCompat.STATE_PLAYING || mirroredPlaybackSpeed <= 0f) {
                handler.removeCallbacks(this)
                return
            }

            val now = SystemClock.elapsedRealtime()
            val elapsedMs = (now - mirroredPlaybackUpdatedAtMs).coerceAtLeast(0L)
            val nextPositionMs = (
                mirroredPlaybackPositionMs + (elapsedMs * mirroredPlaybackSpeed).toLong()
            ).coerceAtLeast(0L)

            publishPlaybackState(
                playbackState = mirroredPlaybackState,
                positionMs = nextPositionMs,
                bufferedMs = maxOf(mirroredPlaybackBufferedMs, nextPositionMs),
                activeQueueItemId = mirroredPlaybackActiveQueueItemId,
                playbackSpeed = mirroredPlaybackSpeed
            )

            // Schedule next tick for smooth progress updates
            handler.postDelayed(this, 1000L)
        }
    }

    // Our own session — exposed as sessionToken so Android Auto connects
    private lateinit var session: MediaSessionCompat

    // Bridge to react-native-track-player's MusicService
    private var tpBrowser: MediaBrowserCompat? = null
    private var tpController: MediaControllerCompat? = null

    private val autoSyncReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != AUTO_SYNC_ACTION) return
            val payload = intent.getStringExtra("payload") ?: return
            applyExternalPlaybackSync(payload)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()

        session = MediaSessionCompat(this, TAG).apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setPlaybackState(stoppedState())
            setCallback(sessionCallback)
            isActive = true
        }
        sessionToken = session.sessionToken

        registerAutoSyncReceiver()

        // Start TrackPlayer service and connect to it
        ensureTrackPlayerStarted()
    }

    override fun onDestroy() {
        disconnectFromTrackPlayer()
        handler.removeCallbacks(playbackTicker)
        unregisterAutoSyncReceiver()
        session.release()
        scope.cancel()
        super.onDestroy()
    }

    // ── TrackPlayer bridge ────────────────────────────────────────────────────

    private fun ensureTrackPlayerStarted() {
        try {
            // Start TrackPlayer's MusicService if not already running
            val intent = Intent(this, com.doublesymmetry.trackplayer.service.MusicService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            Log.d(TAG, "Started TrackPlayer MusicService")
            
            // Give it a moment to start, then connect
            handler.postDelayed({ connectToTrackPlayer() }, 500)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start TrackPlayer MusicService", e)
        }
    }

    private fun connectToTrackPlayer() {
        try {
            val component = ComponentName(
                this,
                com.doublesymmetry.trackplayer.service.MusicService::class.java
            )
            tpBrowser = MediaBrowserCompat(this, component, tpConnectionCallback, null)
                .also { it.connect() }
        } catch (e: Exception) {
            Log.w(TAG, "connectToTrackPlayer failed: ${e.message}")
            // Retry after 3s — TrackPlayer may not be started yet
            handler.postDelayed({ connectToTrackPlayer() }, 3_000)
        }
    }

    private fun disconnectFromTrackPlayer() {
        tpController?.unregisterCallback(tpControllerCallback)
        tpController = null
        try { tpBrowser?.disconnect() } catch (_: Exception) {}
        tpBrowser = null
    }

    private val tpConnectionCallback = object : MediaBrowserCompat.ConnectionCallback() {
        override fun onConnected() {
            try {
                Log.d(TAG, "Connected to TrackPlayer MusicService")
                val browser = tpBrowser ?: return
                val ctrl = MediaControllerCompat(this@MavrixfyAutoService, browser.sessionToken)
                ctrl.registerCallback(tpControllerCallback)
                tpController = ctrl
                // Keep our own sessionToken — Android Auto already subscribed to it.
                // Swapping to TrackPlayer's token mid-connection breaks content browsing
                // and causes the "Getting your selection..." spinner to hang forever.
                // Instead we mirror state into our own session via tpControllerCallback.
                // Sync current state immediately so Now Playing shows up right away.
                tpControllerCallback.onPlaybackStateChanged(ctrl.playbackState)
                tpControllerCallback.onMetadataChanged(ctrl.metadata)
                tpControllerCallback.onQueueChanged(ctrl.queue?.toMutableList())
                tpControllerCallback.onQueueTitleChanged(ctrl.queueTitle)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to attach MediaControllerCompat: ${e.message}")
                disconnectFromTrackPlayer()
                handler.postDelayed({ connectToTrackPlayer() }, 1_500)
            }
        }

        override fun onConnectionFailed() {
            Log.w(TAG, "TrackPlayer connection failed — retrying in 3s")
            handler.postDelayed({ connectToTrackPlayer() }, 3_000)
        }

        override fun onConnectionSuspended() {
            Log.w(TAG, "TrackPlayer connection suspended — reconnecting in 2s")
            tpController?.unregisterCallback(tpControllerCallback)
            tpController = null
            handler.postDelayed({ connectToTrackPlayer() }, 2_000)
        }
    }

    // Mirror TrackPlayer state into our session so the car display updates
    private val tpControllerCallback = object : MediaControllerCompat.Callback() {
        override fun onPlaybackStateChanged(state: PlaybackStateCompat?) {
            Log.d(TAG, "Mirroring playback state: ${state?.state ?: "null"}")
            if (state == null) {
                publishPlaybackState(
                    playbackState = PlaybackStateCompat.STATE_STOPPED,
                    positionMs = 0L,
                    bufferedMs = 0L,
                    activeQueueItemId = -1L,
                    playbackSpeed = 0f
                )
                return
            }

            val playbackSpeed = when {
                state.state == PlaybackStateCompat.STATE_PLAYING && state.playbackSpeed > 0f -> state.playbackSpeed
                state.state == PlaybackStateCompat.STATE_PLAYING -> 1f
                else -> 0f
            }
            publishPlaybackState(
                playbackState = state.state,
                positionMs = state.position.coerceAtLeast(0L),
                bufferedMs = state.bufferedPosition.coerceAtLeast(0L),
                activeQueueItemId = state.activeQueueItemId,
                playbackSpeed = playbackSpeed
            )
        }
        override fun onMetadataChanged(metadata: MediaMetadataCompat?) {
            Log.d(TAG, "Mirroring metadata: ${metadata?.description?.title ?: "null"}")
            val enrichedMetadata = enrichMetadata(metadata)
            lastSessionMetadataId = enrichedMetadata?.getString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID)
                ?: enrichedMetadata?.description?.mediaId
            session.setMetadata(enrichedMetadata)
        }
        override fun onQueueChanged(queue: MutableList<MediaSessionCompat.QueueItem>?) {
            lastSessionQueueIds = queue
                ?.mapNotNull { it.description.mediaId }
                ?.filter { it.isNotBlank() }
                ?: emptyList()
            session.setQueue(queue)
        }
        override fun onQueueTitleChanged(title: CharSequence?) {
            lastSessionQueueTitle = title?.toString()?.trim()?.ifBlank { null }
            session.setQueueTitle(title)
        }
        override fun onSessionDestroyed() {
            Log.w(TAG, "TrackPlayer session destroyed — reconnecting")
            disconnectFromTrackPlayer()
            handler.postDelayed({ connectToTrackPlayer() }, 2_000)
        }
    }

    // ── MediaSession callback — forward controls to TrackPlayer ──────────────

    private val sessionCallback = object : MediaSessionCompat.Callback() {
        override fun onPlay()             { dispatchTransportCommand("play") }
        override fun onPause()            { dispatchTransportCommand("pause") }
        override fun onStop()             { dispatchTransportCommand("stop") }
        override fun onSkipToNext()       { dispatchTransportCommand("next") }
        override fun onSkipToPrevious()   { dispatchTransportCommand("previous") }
        override fun onSeekTo(pos: Long)  { dispatchTransportCommand("seek", JSONObject().put("position", pos / 1000.0)) }
        override fun onSkipToQueueItem(id: Long) {
            dispatchTransportCommand("skipToQueueItem", JSONObject().put("queueIndex", id.toInt()))
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            if (mediaId.isNullOrBlank()) return
            Log.d(TAG, "onPlayFromMediaId($mediaId)")
            scope.launch { handlePlayFromMediaId(mediaId) }
        }

        override fun onPlayFromSearch(query: String?, extras: Bundle?) {
            scope.launch {
                val q = query?.trim().orEmpty().ifBlank { "trending" }
                val tracks = try { searchTracks(q) } catch (_: Exception) { mutableListOf() }
                if (tracks.isNotEmpty()) {
                    publishSelectionToAutoSession(tracks, 0, q)
                    sendQueueToTrackPlayer(tracks, 0, q)
                }
            }
        }
    }

    // ── onGetRoot ─────────────────────────────────────────────────────────────

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        val extras = Bundle().apply {
            putInt(
                MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM
            )
            putInt(
                MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_PLAYABLE,
                MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM
            )
        }
        return BrowserRoot(ROOT_ID, extras)
    }

    // ── onLoadChildren ────────────────────────────────────────────────────────

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>
    ) {
        result.detach()
        scope.launch {
            val items = try {
                when {
                    parentId == ROOT_ID              -> buildTabs()
                    parentId.startsWith(PLAYLIST_PREFIX) -> loadTracks(parentId.removePrefix(PLAYLIST_PREFIX))
                    else                             -> loadPlaylists(parentId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "onLoadChildren error for $parentId", e)
                mutableListOf()
            }
            result.sendResult(items)
        }
    }

    override fun onLoadItem(
        itemId: String,
        result: Result<MediaBrowserCompat.MediaItem>
    ) {
        result.detach()
        scope.launch {
            val cached = mediaItemCache[itemId]
            if (cached != null) {
                Log.d(TAG, "onLoadItem cache hit for $itemId")
                result.sendResult(cached)
                return@launch
            }

            val resolved = try {
                resolveMediaItem(itemId)
            } catch (e: Exception) {
                Log.w(TAG, "onLoadItem failed for $itemId: ${e.message}")
                null
            }
            result.sendResult(resolved)
        }
    }

    // ── onSearch ──────────────────────────────────────────────────────────────

    override fun onSearch(
        query: String,
        extras: Bundle?,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>
    ) {
        result.detach()
        scope.launch {
            val items = try { searchTracks(query) } catch (_: Exception) { mutableListOf() }
            result.sendResult(items)
        }
    }

    // ── Content builders ──────────────────────────────────────────────────────

    private fun buildTabs(): MutableList<MediaBrowserCompat.MediaItem> {
        ensureBrowseCycle()
        return buildShelfSpecs().map { spec ->
            MediaBrowserCompat.MediaItem(
                MediaDescriptionCompat.Builder()
                    .setMediaId(spec.id)
                    .setTitle(spec.title)
                    .setIconUri(resourceUri(spec.iconResId))
                    .build(),
                MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
            )
        }.toMutableList()
    }

    private suspend fun loadPlaylists(tabId: String): MutableList<MediaBrowserCompat.MediaItem> =
        withContext(Dispatchers.IO) {
            ensureBrowseCycle()
            shelfPlaylistCache[tabId]?.let { return@withContext it.toMutableList() }

            val spec = buildShelfSpecs().firstOrNull { it.id == tabId }
                ?: return@withContext mutableListOf()
            val items = mutableListOf<MediaBrowserCompat.MediaItem>()
            val localIds = linkedSetOf<String>()
            val localKeys = linkedSetOf<String>()

            fun addPlaylist(obj: JSONObject, relaxed: Boolean): Boolean {
                val id = obj.optString("id").trim()
                val name = obj.optString("name").trim().ifBlank { obj.optString("title").trim() }
                val key = normalizeKey(name)
                if (id.isBlank() || name.isBlank() || key.isBlank()) return false
                if (localIds.contains(id) || localKeys.contains(key)) return false
                if (!relaxed && (claimedPlaylistIds.contains(id) || claimedPlaylistKeys.contains(key))) {
                    return false
                }

                val count = obj.optInt("songCount", obj.optInt("count", 0))
                val imgUrl = extractImageUrl(obj.opt("image"))
                cachePlaylistTitle(id, name)

                val item = MediaBrowserCompat.MediaItem(
                    MediaDescriptionCompat.Builder()
                        .setMediaId("$PLAYLIST_PREFIX$id")
                        .setTitle(name)
                        .setSubtitle(if (count > 0) "$count songs" else spec.subtitle)
                        .setDescription(spec.subtitle)
                        .apply {
                            if (imgUrl.isNotBlank()) setIconUri(Uri.parse(imgUrl))
                        }
                        .build(),
                    MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                )

                items.add(item)
                localIds.add(id)
                localKeys.add(key)
                claimedPlaylistIds.add(id)
                claimedPlaylistKeys.add(key)
                return true
            }

            val queryOrder = rotatedQueriesFor(spec)
            for (relaxed in listOf(false, true)) {
                var attempts = 0
                for (query in queryOrder) {
                    if (attempts >= MAX_PLAYLIST_QUERY_ATTEMPTS) break
                    attempts += 1
                    val results = searchPlaylistsJson(query, MAX_PLAYLISTS_PER_SHELF) ?: continue
                    for (i in 0 until results.length()) {
                        val obj = results.optJSONObject(i) ?: continue
                        addPlaylist(obj, relaxed)
                        if (items.size >= MAX_PLAYLISTS_PER_SHELF) break
                    }
                    if (items.size >= MAX_PLAYLISTS_PER_SHELF) break
                }
                if (items.size >= MIN_PLAYLISTS_PER_SHELF || items.size >= MAX_PLAYLISTS_PER_SHELF) {
                    break
                }
            }

            if (items.size < MIN_PLAYLISTS_PER_SHELF) {
                appendFallbackPlaylists(spec, items, localIds, localKeys)
            }

            shelfPlaylistCache[tabId] = items.toMutableList()
            items
        }

    private fun appendFallbackPlaylists(
        spec: AutoShelfSpec,
        items: MutableList<MediaBrowserCompat.MediaItem>,
        localIds: MutableSet<String>,
        localKeys: MutableSet<String>
    ) {
        val fallbackQueries = rotatedQueriesFor(spec).ifEmpty { spec.queries }
        fallbackQueries
            .take(MAX_PLAYLISTS_PER_SHELF)
            .forEachIndexed { index, query ->
                if (items.size >= MIN_PLAYLISTS_PER_SHELF) return

                val title = when (index) {
                    0 -> "${spec.title} Mix"
                    1 -> "Popular ${spec.title}"
                    2 -> "${spec.title} Favorites"
                    else -> query
                        .split(' ')
                        .filter { it.isNotBlank() }
                        .joinToString(" ") { word ->
                            word.replaceFirstChar { char ->
                                if (char.isLowerCase()) char.titlecase(Locale.US) else char.toString()
                            }
                        }
                }
                val playlistId = "$QUERY_PLAYLIST_PREFIX${enc(query)}"
                val key = normalizeKey(title)
                if (!localIds.add(playlistId) || !localKeys.add(key)) return@forEachIndexed

                cachePlaylistTitle(playlistId, title)
                items.add(
                    MediaBrowserCompat.MediaItem(
                        MediaDescriptionCompat.Builder()
                            .setMediaId("$PLAYLIST_PREFIX$playlistId")
                            .setTitle(title)
                            .setSubtitle(spec.subtitle)
                            .setDescription("Search-backed picks")
                            .setIconUri(resourceUri(spec.iconResId))
                            .build(),
                        MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
                    )
                )
            }
    }

    private suspend fun loadTracks(playlistId: String): MutableList<MediaBrowserCompat.MediaItem> =
        withContext(Dispatchers.IO) {
            if (playlistId.startsWith(QUERY_PLAYLIST_PREFIX)) {
                val query = dec(playlistId.removePrefix(QUERY_PLAYLIST_PREFIX))
                return@withContext searchTracks(query)
            }

            val json = fetchJson("$API_BASE/playlists?id=${enc(playlistId)}")
                ?: return@withContext mutableListOf()
            val data  = json.optJSONObject("data") ?: json
            cachePlaylistTitle(
                playlistId,
                data.optString("name").trim().ifBlank { data.optString("title").trim() }
            )
            val songs = data.optJSONArray("songs") ?: data.optJSONArray("list")
                ?: return@withContext mutableListOf()

            val items = mutableListOf<MediaBrowserCompat.MediaItem>()
            val seenIds = linkedSetOf<String>()
            val seenKeys = linkedSetOf<String>()
            for (i in 0 until songs.length()) {
                val obj      = songs.optJSONObject(i) ?: continue
                val id       = obj.optString("id").trim()
                val title    = obj.optString("name").trim().ifBlank { obj.optString("title").trim() }
                val audioUrl = extractAudioUrl(obj.opt("downloadUrl") ?: obj.opt("download_url"))
                if (id.isBlank() || title.isBlank() || audioUrl.isBlank()) continue

                val artist = extractArtist(obj)
                val dedupeKey = normalizeKey(title, artist)
                if (!seenIds.add(id) || !seenKeys.add(dedupeKey)) continue
                val durationMs = extractDurationMs(obj)
                val imgUrl = extractImageUrl(obj.opt("image"))

                val item = MediaBrowserCompat.MediaItem(
                    MediaDescriptionCompat.Builder()
                        .setMediaId("$TRACK_PREFIX$playlistId::$id")
                        .setTitle(title)
                        .setSubtitle(artist)
                        .setMediaUri(Uri.parse(audioUrl))
                        .setIconUri(if (imgUrl.isNotBlank()) Uri.parse(imgUrl) else null)
                        .setExtras(Bundle().apply {
                            if (durationMs > 0) putLong(EXTRA_DURATION_MS, durationMs)
                        })
                        .build(),
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                )
                cacheDurationMs(item.description.mediaId, durationMs)
                cacheMediaItem(item)
                items.add(item)
            }
            items
        }

    private suspend fun searchTracks(query: String): MutableList<MediaBrowserCompat.MediaItem> =
        withContext(Dispatchers.IO) {
            val json = fetchJson("$API_BASE/search/songs?query=${enc(query)}&limit=20")
                ?: return@withContext mutableListOf()
            val results = json.optJSONObject("data")?.optJSONArray("results")
                ?: return@withContext mutableListOf()

            val items = mutableListOf<MediaBrowserCompat.MediaItem>()
            val seenIds = linkedSetOf<String>()
            val seenKeys = linkedSetOf<String>()
            for (i in 0 until results.length()) {
                val obj      = results.optJSONObject(i) ?: continue
                val id       = obj.optString("id").trim()
                val title    = obj.optString("name").trim().ifBlank { obj.optString("title").trim() }
                val audioUrl = extractAudioUrl(obj.opt("downloadUrl") ?: obj.opt("download_url"))
                if (id.isBlank() || title.isBlank() || audioUrl.isBlank()) continue

                val artist = extractArtist(obj)
                val dedupeKey = normalizeKey(title, artist)
                if (!seenIds.add(id) || !seenKeys.add(dedupeKey)) continue
                val durationMs = extractDurationMs(obj)
                val imgUrl = extractImageUrl(obj.opt("image"))

                val item = MediaBrowserCompat.MediaItem(
                    MediaDescriptionCompat.Builder()
                        .setMediaId("${TRACK_PREFIX}search::$id")
                        .setTitle(title)
                        .setSubtitle(artist)
                        .setMediaUri(Uri.parse(audioUrl))
                        .setIconUri(if (imgUrl.isNotBlank()) Uri.parse(imgUrl) else null)
                        .setExtras(Bundle().apply {
                            if (durationMs > 0) putLong(EXTRA_DURATION_MS, durationMs)
                        })
                        .build(),
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                )
                cacheDurationMs(item.description.mediaId, durationMs)
                cacheMediaItem(item)
                items.add(item)
            }
            cacheSearchQueue(query, items)
            items
        }

    // ── Playback ──────────────────────────────────────────────────────────────

    private suspend fun handlePlayFromMediaId(mediaId: String) {
        if (!mediaId.startsWith(TRACK_PREFIX)) return
        val payload    = mediaId.removePrefix(TRACK_PREFIX)
        val parts      = payload.split("::", limit = 2)
        if (parts.size != 2) return
        val playlistId = parts[0]

        val allTracks = try {
            if (playlistId == "search") {
                searchQueueCache[mediaId]?.toMutableList()
                    ?: mediaItemCache[mediaId]?.let { mutableListOf(it) }
                    ?: mutableListOf()
            } else {
                loadTracks(playlistId)
            }
        } catch (_: Exception) { mutableListOf() }

        if (allTracks.isEmpty()) return

        val startIndex = allTracks.indexOfFirst {
            it.description.mediaId == mediaId
        }.coerceAtLeast(0)

        val queueTitle = resolveQueueTitle(playlistId, mediaId)
        publishSelectionToAutoSession(allTracks, startIndex, queueTitle)
        sendQueueToTrackPlayer(allTracks, startIndex, queueTitle)
    }

    /**
     * Send the full track queue to react-native-track-player via broadcast.
     * The AutoPlayModule receives this and calls TrackPlayer.setQueue() + play().
     * TrackPlayer's MusicService then updates its MediaSession which we mirror.
     */
    private fun sendQueueToTrackPlayer(
        tracks: List<MediaBrowserCompat.MediaItem>,
        startIndex: Int,
        queueTitle: String
    ) {
        val tracksJson = org.json.JSONArray()
        tracks.forEach { item ->
            val d  = item.description
            val id = d.mediaId?.removePrefix(TRACK_PREFIX)?.substringAfterLast("::") ?: return@forEach
            // Extract cover URL from icon bitmap URI or use empty string
            val coverUrl = d.iconUri?.toString() ?: ""
            // Extract duration from extras
            val durationMs = d.extras?.getLong(EXTRA_DURATION_MS, 0L) ?: 0L
            val durationSeconds = if (durationMs > 0) durationMs / 1000.0 else 0.0
            
            tracksJson.put(
                org.json.JSONObject()
                    .put("id", id)
                    .put("title", d.title ?: "")
                    .put("artist", d.subtitle ?: "")
                    .put("audioUrl", d.mediaUri?.toString() ?: "")
                    .put("coverUrl", coverUrl)
                    .put("duration", durationSeconds)
            )
        }

        val payload = org.json.JSONObject()
            .put("tracks", tracksJson)
            .put("startIndex", startIndex.coerceIn(0, tracks.lastIndex))
            .put("queueTitle", queueTitle)
            .put("playWhenReady", true)
            .toString()

        queueAutoPlayPayload(payload)

        Log.d(TAG, "sendQueueToTrackPlayer: ${tracks.size} tracks, start=$startIndex")
    }

    private fun dispatchTransportCommand(command: String, extras: JSONObject? = null) {
        val payload = (extras ?: JSONObject())
            .put("command", command)
            .toString()

        queueAutoTransportPayload(payload)

        Log.d(TAG, "dispatchTransportCommand: $payload")
    }

    private fun queueAutoPlayPayload(payload: String) {
        ensureTrackPlayerStarted()
        persistPendingAutoPayload(PREF_PENDING_PLAY_PAYLOAD, payload)
        sendAutoPlayBroadcastIfPending(payload)
        AUTO_PLAY_RETRY_DELAYS_MS.forEach { delayMs ->
            handler.postDelayed({ sendAutoPlayBroadcastIfPending(payload) }, delayMs)
        }
    }

    private fun queueAutoTransportPayload(payload: String) {
        persistPendingAutoPayload(PREF_PENDING_TRANSPORT_PAYLOAD, payload)
        sendAutoTransportBroadcastIfPending(payload)
        AUTO_TRANSPORT_RETRY_DELAYS_MS.forEach { delayMs ->
            handler.postDelayed({ sendAutoTransportBroadcastIfPending(payload) }, delayMs)
        }
    }

    private fun sendAutoPlayBroadcastIfPending(payload: String) {
        if (readPendingAutoPayload(PREF_PENDING_PLAY_PAYLOAD) != payload) return
        sendBroadcast(Intent(AUTO_PLAY_ACTION).apply {
            setPackage(packageName)
            putExtra("payload", payload)
        })
    }

    private fun sendAutoTransportBroadcastIfPending(payload: String) {
        if (readPendingAutoPayload(PREF_PENDING_TRANSPORT_PAYLOAD) != payload) return
        sendBroadcast(Intent(AUTO_TRANSPORT_ACTION).apply {
            setPackage(packageName)
            putExtra("payload", payload)
        })
    }

    private fun persistPendingAutoPayload(key: String, payload: String) {
        getSharedPreferences(AUTO_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(key, payload)
            .apply()
    }

    private fun readPendingAutoPayload(key: String): String? {
        return getSharedPreferences(AUTO_PREFS, Context.MODE_PRIVATE)
            .getString(key, null)
            ?.takeIf { it.isNotBlank() }
    }

    private suspend fun resolveMediaItem(itemId: String): MediaBrowserCompat.MediaItem? {
        if (!itemId.startsWith(TRACK_PREFIX)) {
            return null
        }

        mediaItemCache[itemId]?.let { return it }

        val payload = itemId.removePrefix(TRACK_PREFIX)
        val parts = payload.split("::", limit = 2)
        if (parts.size != 2) return null

        val playlistId = parts[0]
        val mediaItems = if (playlistId == "search") {
            searchQueueCache[itemId]?.toMutableList() ?: mutableListOf()
        } else {
            loadTracks(playlistId)
        }

        return mediaItems.firstOrNull { it.description.mediaId == itemId }
    }

    private fun cacheMediaItem(item: MediaBrowserCompat.MediaItem) {
        val mediaId = item.description.mediaId ?: return
        if (mediaItemCache.size >= 150) {
            mediaItemCache.remove(mediaItemCache.keys.toList().first())
        }
        mediaItemCache[mediaId] = item
    }

    private fun buildPlayableItem(
        mediaId: String,
        title: String,
        artist: String,
        audioUrl: String,
        coverUrl: String,
        durationMs: Long = 0L
    ): MediaBrowserCompat.MediaItem {
        val item = MediaBrowserCompat.MediaItem(
            MediaDescriptionCompat.Builder()
                .setMediaId(mediaId)
                .setTitle(title)
                .setSubtitle(artist)
                .setMediaUri(if (audioUrl.isNotBlank()) Uri.parse(audioUrl) else null)
                .setIconUri(if (coverUrl.isNotBlank()) Uri.parse(coverUrl) else null)
                .setExtras(Bundle().apply {
                    if (durationMs > 0) putLong(EXTRA_DURATION_MS, durationMs)
                })
                .build(),
            MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
        )
        cacheDurationMs(mediaId, durationMs)
        cacheMediaItem(item)
        return item
    }

    private fun buildSessionQueue(
        tracks: List<MediaBrowserCompat.MediaItem>
    ): MutableList<MediaSessionCompat.QueueItem> {
        return tracks.mapIndexed { index, item ->
            MediaSessionCompat.QueueItem(item.description, index.toLong())
        }.toMutableList()
    }

    private fun buildMetadata(item: MediaBrowserCompat.MediaItem): MediaMetadataCompat {
        val description = item.description
        val durationMs = resolveDurationMs(description.mediaId, null)
        return MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, description.mediaId)
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, description.title?.toString())
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, description.title?.toString())
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, description.subtitle?.toString())
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, description.subtitle?.toString())
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs.coerceAtLeast(0L))
            .putString(
                MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI,
                description.iconUri?.toString()
            )
            .putString(
                MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI,
                description.iconUri?.toString()
            )
            .apply {
                description.iconBitmap?.let {
                    putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
                    putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, it)
                }
            }
            .build()
    }

    private fun sessionActions(): Long {
        return PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_STOP or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
            PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SKIP_TO_QUEUE_ITEM
    }

    private fun buildPlaybackState(
        playbackState: Int,
        positionSeconds: Double,
        bufferedSeconds: Double,
        activeQueueItemId: Long,
        playbackSpeed: Float = if (playbackState == PlaybackStateCompat.STATE_PLAYING) 1f else 0f
    ): PlaybackStateCompat {
        return PlaybackStateCompat.Builder()
            .setActions(sessionActions())
            .setBufferedPosition((bufferedSeconds.coerceAtLeast(0.0) * 1000).toLong())
            .setState(
                playbackState,
                (positionSeconds.coerceAtLeast(0.0) * 1000).toLong(),
                playbackSpeed,
                SystemClock.elapsedRealtime()
            )
            .setActiveQueueItemId(activeQueueItemId)
            .build()
    }

    private fun publishPlaybackState(
        playbackState: Int,
        positionMs: Long,
        bufferedMs: Long,
        activeQueueItemId: Long,
        playbackSpeed: Float
    ) {
        val safePositionMs = positionMs.coerceAtLeast(0L)
        val safeBufferedMs = bufferedMs.coerceAtLeast(safePositionMs)
        val safePlaybackSpeed = when {
            playbackState == PlaybackStateCompat.STATE_PLAYING && playbackSpeed > 0f -> playbackSpeed
            else -> 0f
        }

        mirroredPlaybackState = playbackState
        mirroredPlaybackPositionMs = safePositionMs
        mirroredPlaybackBufferedMs = safeBufferedMs
        mirroredPlaybackActiveQueueItemId = activeQueueItemId
        mirroredPlaybackSpeed = safePlaybackSpeed
        mirroredPlaybackUpdatedAtMs = SystemClock.elapsedRealtime()

        session.setPlaybackState(
            buildPlaybackState(
                playbackState = mirroredPlaybackState,
                positionSeconds = mirroredPlaybackPositionMs / 1000.0,
                bufferedSeconds = mirroredPlaybackBufferedMs / 1000.0,
                activeQueueItemId = mirroredPlaybackActiveQueueItemId,
                playbackSpeed = mirroredPlaybackSpeed
            )
        )

        handler.removeCallbacks(playbackTicker)
        if (mirroredPlaybackState == PlaybackStateCompat.STATE_PLAYING && mirroredPlaybackSpeed > 0f) {
            handler.postDelayed(playbackTicker, 1_000)
        }
    }

    private fun playingState(activeQueueItemId: Long): PlaybackStateCompat {
        return buildPlaybackState(
            PlaybackStateCompat.STATE_PLAYING,
            positionSeconds = 0.0,
            bufferedSeconds = 0.0,
            activeQueueItemId = activeQueueItemId
        )
    }

    private fun mapExternalState(state: String?): Int {
        return when (state?.trim()?.lowercase()) {
            "playing" -> PlaybackStateCompat.STATE_PLAYING
            "paused", "ready" -> PlaybackStateCompat.STATE_PAUSED
            "buffering", "loading" -> PlaybackStateCompat.STATE_BUFFERING
            "none", "stopped", "ended" -> PlaybackStateCompat.STATE_STOPPED
            else -> PlaybackStateCompat.STATE_STOPPED
        }
    }

    private fun buildQueueFromSyncPayload(queue: JSONArray?): MutableList<MediaBrowserCompat.MediaItem> {
        if (queue == null) return mutableListOf()

        val items = mutableListOf<MediaBrowserCompat.MediaItem>()
        for (i in 0 until queue.length()) {
            val obj = queue.optJSONObject(i) ?: continue
            val id = obj.optString("id").trim()
            val title = obj.optString("title").trim().ifBlank { "Unknown Title" }
            val artist = obj.optString("artist").trim().ifBlank { "Unknown Artist" }
            val audioUrl = obj.optString("audioUrl").trim()
            val coverUrl = obj.optString("coverUrl").trim()
            val durationMs = parseDurationMs(obj.opt("duration"))
            val mediaId = if (id.startsWith(TRACK_PREFIX)) id else "$TRACK_PREFIX$id"
            items.add(buildPlayableItem(mediaId, title, artist, audioUrl, coverUrl, durationMs))
        }
        return items
    }

    private fun applyExternalPlaybackSync(payload: String) {
        try {
            val json = JSONObject(payload)
            val queueItems = buildQueueFromSyncPayload(json.optJSONArray("queue"))
            val activeIndex = if (queueItems.isEmpty()) {
                -1
            } else {
                json.optInt("activeIndex", 0).coerceIn(0, queueItems.lastIndex)
            }
            val activeItem = queueItems.getOrNull(activeIndex)
            val queueTitle = json.optString("queueTitle").trim()
            val queueIds = queueItems
                .mapNotNull { it.description.mediaId }
                .filter { it.isNotBlank() }
            val nextQueueTitle = queueTitle.ifBlank { null }
            val activeMediaId = activeItem?.description?.mediaId?.trim()?.ifBlank { null }

            if (queueIds != lastSessionQueueIds) {
                session.setQueue(if (queueItems.isNotEmpty()) buildSessionQueue(queueItems) else null)
                lastSessionQueueIds = queueIds
            }
            if (nextQueueTitle != null && nextQueueTitle != lastSessionQueueTitle) {
                session.setQueueTitle(nextQueueTitle)
                lastSessionQueueTitle = nextQueueTitle
            }
            if (activeMediaId != lastSessionMetadataId) {
                session.setMetadata(activeItem?.let { buildMetadata(it) })
                lastSessionMetadataId = activeMediaId
            }
            publishPlaybackState(
                playbackState = mapExternalState(json.optString("state")),
                positionMs = (json.optDouble("position", 0.0).coerceAtLeast(0.0) * 1000.0).toLong(),
                bufferedMs = (json.optDouble("buffered", 0.0).coerceAtLeast(0.0) * 1000.0).toLong(),
                activeQueueItemId = activeIndex.toLong(),
                playbackSpeed = if (mapExternalState(json.optString("state")) == PlaybackStateCompat.STATE_PLAYING) 1f else 0f
            )
            session.isActive = true

            Log.d(
                TAG,
                "applyExternalPlaybackSync state=${json.optString("state")} index=$activeIndex title=${activeItem?.description?.title}"
            )
        } catch (e: Exception) {
            Log.w(TAG, "applyExternalPlaybackSync failed: ${e.message}")
        }
    }

    private fun publishSelectionToAutoSession(
        tracks: List<MediaBrowserCompat.MediaItem>,
        startIndex: Int,
        queueTitle: String
    ) {
        val safeIndex = startIndex.coerceIn(0, tracks.lastIndex)
        val selected = tracks.getOrNull(safeIndex) ?: return
        lastSessionQueueIds = tracks
            .mapNotNull { it.description.mediaId }
            .filter { it.isNotBlank() }
        lastSessionQueueTitle = queueTitle.ifBlank { null }
        lastSessionMetadataId = selected.description.mediaId?.trim()?.ifBlank { null }
        session.setQueue(buildSessionQueue(tracks))
        session.setQueueTitle(lastSessionQueueTitle)
        session.setMetadata(buildMetadata(selected))
        publishPlaybackState(
            playbackState = PlaybackStateCompat.STATE_BUFFERING,
            positionMs = 0L,
            bufferedMs = 0L,
            activeQueueItemId = safeIndex.toLong(),
            playbackSpeed = 0f
        )
        session.isActive = true
        Log.d(
            TAG,
            "publishSelectionToAutoSession: ${selected.description.title} at index=$safeIndex queue=${tracks.size}"
        )
    }

    private fun registerAutoSyncReceiver() {
        val filter = IntentFilter(AUTO_SYNC_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(autoSyncReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(autoSyncReceiver, filter)
        }
    }

    private fun unregisterAutoSyncReceiver() {
        try {
            unregisterReceiver(autoSyncReceiver)
        } catch (_: Exception) {
            // Receiver was already unregistered.
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun stoppedState() = PlaybackStateCompat.Builder()
        .setActions(sessionActions())
        .setState(PlaybackStateCompat.STATE_STOPPED, 0, 1f)
        .build()

    private fun fetchJson(url: String): org.json.JSONObject? {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = TIMEOUT
            conn.readTimeout    = TIMEOUT
            conn.setRequestProperty("Accept", "application/json")
            conn.connect()
            if (conn.responseCode !in 200..299) return null
            val text = conn.inputStream.bufferedReader().readText()
            org.json.JSONObject(text)
        } catch (e: Exception) {
            Log.w(TAG, "fetchJson failed: $url — ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun loadArt(url: String): Bitmap? {
        artCache[url]?.let { return it }
        return try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 5_000
            conn.readTimeout    = 5_000
            conn.instanceFollowRedirects = true
            conn.connect()
            val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
            val bmp  = BitmapFactory.decodeStream(conn.inputStream, null, opts)
            conn.disconnect()
            if (bmp != null) {
                if (artCache.size >= 30) artCache.remove(artCache.keys.toList().first())
                artCache[url] = bmp
            }
            bmp
        } catch (_: Exception) { null }
    }

    private fun currentDayPart(): AutoDayPart {
        return when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
            in 5..10 -> AutoDayPart.MORNING
            in 11..16 -> AutoDayPart.AFTERNOON
            in 17..21 -> AutoDayPart.EVENING
            else -> AutoDayPart.NIGHT
        }
    }

    private fun currentContentCycleKey(): String {
        val calendar = Calendar.getInstance()
        return buildString {
            append(calendar.get(Calendar.YEAR))
            append('-')
            append(calendar.get(Calendar.DAY_OF_YEAR))
            append('-')
            append(currentDayPart().name.lowercase(Locale.US))
        }
    }

    private fun ensureBrowseCycle() {
        val cycleKey = currentContentCycleKey()
        if (browseCycleKey == cycleKey) return

        browseCycleKey = cycleKey
        shelfPlaylistCache.clear()
        claimedPlaylistIds.clear()
        claimedPlaylistKeys.clear()
        Log.d(TAG, "Auto browse cycle refreshed: $browseCycleKey")
    }

    private fun buildShelfSpecs(): List<AutoShelfSpec> {
        val dayPartShelf = when (currentDayPart()) {
            AutoDayPart.MORNING -> AutoShelfSpec(
                id = TAB_DAYPART,
                title = "Morning",
                subtitle = "Easy start",
                queries = listOf(
                    "morning hindi songs",
                    "feel good bollywood",
                    "soft punjabi morning",
                    "sunrise acoustic india",
                    "chai time songs",
                    "positive vibes hindi",
                ),
                iconResId = R.drawable.ic_auto_daypart,
            )

            AutoDayPart.AFTERNOON -> AutoShelfSpec(
                id = TAB_DAYPART,
                title = "Day",
                subtitle = "Smooth picks",
                queries = listOf(
                    "afternoon chill hindi",
                    "light bollywood songs",
                    "office playlist india",
                    "easy listening hindi",
                    "soft pop punjabi",
                    "focus songs india",
                ),
                iconResId = R.drawable.ic_auto_daypart,
            )

            AutoDayPart.EVENING -> AutoShelfSpec(
                id = TAB_DAYPART,
                title = "Evening",
                subtitle = "Unwind",
                queries = listOf(
                    "evening bollywood songs",
                    "sunset vibes hindi",
                    "romantic evening playlist",
                    "punjabi chill songs",
                    "after work music india",
                    "indie evening india",
                ),
                iconResId = R.drawable.ic_auto_daypart,
            )

            AutoDayPart.NIGHT -> AutoShelfSpec(
                id = TAB_DAYPART,
                title = "Night",
                subtitle = "Late vibe",
                queries = listOf(
                    "night drive hindi songs",
                    "late night bollywood",
                    "lofi hindi night",
                    "moody punjabi songs",
                    "midnight vibes india",
                    "slow burn songs hindi",
                ),
                iconResId = R.drawable.ic_auto_daypart,
            )
        }

        val switchThemes = listOf(
            AutoShelfSpec(
                id = TAB_SWITCHUP,
                title = "Indie",
                subtitle = "Switch vibe",
                queries = listOf(
                    "indie india",
                    "lofi hindi",
                    "unplugged bollywood",
                    "acoustic punjabi",
                    "coffee house india",
                    "indie love songs india",
                ),
                iconResId = R.drawable.ic_auto_switchup,
            ),
            AutoShelfSpec(
                id = TAB_SWITCHUP,
                title = "Retro",
                subtitle = "Old gems",
                queries = listOf(
                    "90s bollywood hits",
                    "2000s hindi songs",
                    "evergreen bollywood",
                    "retro punjabi songs",
                    "old is gold hindi",
                    "classic romantic hindi",
                ),
                iconResId = R.drawable.ic_auto_switchup,
            ),
            AutoShelfSpec(
                id = TAB_SWITCHUP,
                title = "Energy",
                subtitle = "Fast lane",
                queries = listOf(
                    "workout songs hindi",
                    "party mix bollywood",
                    "gym songs punjabi",
                    "dance hits india",
                    "desi hip hop playlist",
                    "high energy road trip songs",
                ),
                iconResId = R.drawable.ic_auto_switchup,
            ),
            AutoShelfSpec(
                id = TAB_SWITCHUP,
                title = "Soft",
                subtitle = "Slow mood",
                queries = listOf(
                    "sad songs hindi",
                    "heartbreak bollywood",
                    "soulful punjabi",
                    "slow songs india",
                    "romantic soft songs",
                    "peaceful playlist hindi",
                ),
                iconResId = R.drawable.ic_auto_switchup,
            ),
        )
        val switchTheme = switchThemes[Math.floorMod(currentContentCycleKey().hashCode(), switchThemes.size)]

        return listOf(
            AutoShelfSpec(
                id = TAB_DRIVE,
                title = "Drive",
                subtitle = "Road ready",
                queries = listOf(
                    "road trip songs hindi",
                    "driving songs india",
                    "highway mix bollywood",
                    "car songs punjabi",
                    "travel playlist india",
                    "long drive songs hindi",
                ),
                iconResId = R.drawable.ic_auto_drive,
            ),
            AutoShelfSpec(
                id = TAB_FRESH,
                title = "Fresh",
                subtitle = "New picks",
                queries = listOf(
                    "new hindi songs",
                    "latest punjabi songs",
                    "fresh bollywood hits",
                    "viral india music",
                    "new releases india",
                    "trending new songs hindi",
                ),
                iconResId = R.drawable.ic_auto_fresh,
            ),
            dayPartShelf,
            switchTheme,
        )
    }

    private fun rotatedQueriesFor(spec: AutoShelfSpec): List<String> {
        if (spec.queries.isEmpty()) return emptyList()
        val shift = Math.floorMod((browseCycleKey + ":" + spec.id).hashCode(), spec.queries.size)
        return spec.queries.indices.map { offset ->
            spec.queries[(offset + shift) % spec.queries.size]
        }.distinct()
    }

    private fun searchPlaylistsJson(query: String, limit: Int): JSONArray? {
        val json = fetchJson("$API_BASE/search/playlists?query=${enc(query)}&limit=$limit")
            ?: return null
        return json.optJSONObject("data")?.optJSONArray("results")
    }

    private fun cacheSearchQueue(query: String, items: List<MediaBrowserCompat.MediaItem>) {
        if (items.isEmpty()) return
        items.forEach { item ->
            val mediaId = item.description.mediaId ?: return@forEach
            if (!searchQueueCache.containsKey(mediaId) && searchQueueCache.size >= 160) {
                val evicted = searchQueueCache.keys.toList().first()
                searchQueueCache.remove(evicted)
                searchQueueTitles.remove(evicted)
            }
            searchQueueCache[mediaId] = items
            searchQueueTitles[mediaId] = query
        }
    }

    private fun cachePlaylistTitle(playlistId: String, title: String) {
        if (playlistId.isBlank() || title.isBlank()) return
        if (!playlistTitleCache.containsKey(playlistId) && playlistTitleCache.size >= 120) {
            playlistTitleCache.remove(playlistTitleCache.keys.toList().first())
        }
        playlistTitleCache[playlistId] = title
    }

    private fun resolveQueueTitle(playlistId: String, mediaId: String): String {
        if (playlistId == "search") {
            return searchQueueTitles[mediaId].orEmpty().ifBlank { "Search Results" }
        }
        return playlistTitleCache[playlistId].orEmpty().ifBlank { "Playlist" }
    }

    private fun normalizeKey(vararg parts: String): String {
        val raw = parts.joinToString(" ").lowercase(Locale.US)
        val normalized = StringBuilder(raw.length)
        var lastWasSpace = true
        raw.forEach { char ->
            when {
                char.isLetterOrDigit() -> {
                    normalized.append(char)
                    lastWasSpace = false
                }

                !lastWasSpace -> {
                    normalized.append(' ')
                    lastWasSpace = true
                }
            }
        }
        return normalized.toString().trim()
    }

    private fun parseDurationMs(raw: Any?): Long {
        return when (raw) {
            is Number -> {
                val value = raw.toDouble()
                if (!value.isFinite()) 0L else if (value > 10_000) value.toLong() else (value * 1000.0).toLong()
            }

            is String -> {
                val trimmed = raw.trim()
                if (trimmed.isBlank()) return 0L
                if (trimmed.contains(":")) {
                    val parts = trimmed
                        .split(":")
                        .mapNotNull { it.trim().toLongOrNull() }
                    if (parts.isEmpty()) return 0L
                    var seconds = 0L
                    for (part in parts) {
                        seconds = (seconds * 60) + part
                    }
                    return seconds * 1000L
                }

                val parsed = trimmed.toDoubleOrNull() ?: return 0L
                if (!parsed.isFinite()) 0L else if (parsed > 10_000) parsed.toLong() else (parsed * 1000.0).toLong()
            }

            else -> 0L
        }
    }

    private fun extractDurationMs(obj: JSONObject): Long {
        return parseDurationMs(
            obj.opt("duration").takeUnless { it == JSONObject.NULL }
                ?: obj.opt("duration_ms").takeUnless { it == JSONObject.NULL }
                ?: obj.optJSONObject("more_info")?.opt("duration")
        )
    }

    private fun mediaIdCandidates(mediaId: String?): List<String> {
        val normalizedMediaId = mediaId?.trim().orEmpty()
        if (normalizedMediaId.isBlank()) return emptyList()

        val rawMediaId = normalizedMediaId.removePrefix(TRACK_PREFIX)
        val prefixedMediaId = if (normalizedMediaId.startsWith(TRACK_PREFIX)) {
            normalizedMediaId
        } else {
            "$TRACK_PREFIX$normalizedMediaId"
        }

        return linkedSetOf(normalizedMediaId, rawMediaId, prefixedMediaId)
            .filter { it.isNotBlank() }
            .toList()
    }

    private fun resolveDurationMs(
        mediaId: String?,
        metadata: MediaMetadataCompat?
    ): Long {
        val metadataDurationMs = metadata?.getLong(MediaMetadataCompat.METADATA_KEY_DURATION)
            ?.takeIf { it > 0L }
        if (metadataDurationMs != null) {
            return metadataDurationMs
        }

        val descriptionDurationMs = metadata?.description?.extras?.getLong(EXTRA_DURATION_MS)
            ?.takeIf { it > 0L }
        if (descriptionDurationMs != null) {
            return descriptionDurationMs
        }

        for (candidate in mediaIdCandidates(mediaId)) {
            val cachedDurationMs = mediaDurationMsCache[candidate]?.takeIf { it > 0L }
            if (cachedDurationMs != null) {
                return cachedDurationMs
            }
        }

        return 0L
    }

    private fun enrichMetadata(metadata: MediaMetadataCompat?): MediaMetadataCompat? {
        if (metadata == null) return null

        val mediaId = metadata.getString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID)
            ?: metadata.description?.mediaId
        val durationMs = resolveDurationMs(mediaId, metadata)
        if (durationMs <= 0L) {
            return metadata
        }

        if (metadata.getLong(MediaMetadataCompat.METADATA_KEY_DURATION) == durationMs) {
            return metadata
        }

        return MediaMetadataCompat.Builder(metadata)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build()
    }

    private fun cacheDurationMs(mediaId: String?, durationMs: Long) {
        if (durationMs <= 0L) return

        val candidates = mediaIdCandidates(mediaId)
        for (candidate in candidates) {
            // Check size before adding to avoid ConcurrentModificationException
            if (!mediaDurationMsCache.containsKey(candidate)) {
                if (mediaDurationMsCache.size >= 300) {
                    // Remove oldest entry (first key) - convert to list first to avoid ConcurrentModificationException
                    val firstKey = mediaDurationMsCache.keys.toList().firstOrNull()
                    if (firstKey != null) {
                        mediaDurationMsCache.remove(firstKey)
                    }
                }
            }
            mediaDurationMsCache[candidate] = durationMs
        }
    }

    private fun scaleBmp(bmp: Bitmap, max: Int): Bitmap {
        val w = bmp.width; val h = bmp.height
        if (w <= max && h <= max) return bmp
        val s = max.toFloat() / maxOf(w, h)
        return Bitmap.createScaledBitmap(bmp, (w * s).toInt(), (h * s).toInt(), true)
    }

    private fun resourceUri(resId: Int): Uri {
        return Uri.parse(
            "android.resource://$packageName/${resources.getResourceTypeName(resId)}/${resources.getResourceEntryName(resId)}"
        )
    }

    private fun enc(v: String) = URLEncoder.encode(v, StandardCharsets.UTF_8.name())

    private fun dec(v: String) = URLDecoder.decode(v, StandardCharsets.UTF_8.name())

    private fun extractImageUrl(value: Any?): String {
        val arr = value as? org.json.JSONArray ?: return (value as? String)?.trim() ?: ""
        var best = ""; var bestScore = -1
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val u = item.optString("url").ifBlank { item.optString("link") }.trim()
            val q = item.optString("quality").trim()
            val score = when {
                q.contains("500") || u.contains("500x500") -> 3
                q.contains("150") || u.contains("150x150") -> 2
                else -> 0
            }
            if (score > bestScore) { bestScore = score; best = u }
        }
        return best
    }

    private fun extractAudioUrl(value: Any?): String {
        val arr = value as? org.json.JSONArray ?: return (value as? String)?.trim() ?: ""
        var best = ""; var bestScore = -1
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val u = item.optString("url").ifBlank { item.optString("link") }.trim()
            val q = item.optString("quality").trim().lowercase()
            val score = when {
                q.contains("320") -> 4
                q.contains("160") -> 3
                q.contains("96")  -> 2
                else -> 0
            }
            if (score > bestScore) { bestScore = score; best = u }
        }
        return best
    }

    private fun extractArtist(obj: org.json.JSONObject): String {
        val primary = obj.optJSONObject("artists")?.optJSONArray("primary")
        if (primary != null && primary.length() > 0) {
            val names = mutableListOf<String>()
            for (i in 0 until primary.length()) {
                val n = primary.optJSONObject(i)?.optString("name")?.trim() ?: continue
                if (n.isNotBlank()) names.add(n)
            }
            if (names.isNotEmpty()) return names.joinToString(", ")
        }
        return obj.optString("primaryArtists").ifBlank {
            obj.optString("primary_artists").ifBlank {
                obj.optString("artist").ifBlank { "Unknown Artist" }
            }
        }
    }
}
