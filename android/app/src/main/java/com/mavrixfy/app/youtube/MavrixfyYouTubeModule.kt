package com.mavrixfy.app.youtube

import android.net.Uri
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory as Filters
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Anonymous YouTube Music catalog and extraction only. Playback stays in the app's audio engine. */
class MavrixfyYouTubeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = ConcurrentHashMap<String, Job>()
    private val http = OkHttpClient.Builder().connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS).callTimeout(10, TimeUnit.SECONDS).build()
    private val legacy = YouTubeStreamExtractor(http)
    private val modern = InnerTubeXStreamExtractor()
    private data class Cursor(val url: String, val page: Page, val createdAt: Long)
    private val pages = ConcurrentHashMap<String, Cursor>()
    private val streams = ConcurrentHashMap<String, YouTubeAudioStream>()
    override fun getName() = "MavrixfyYouTube"

    private fun request(id: String, promise: Promise, block: suspend () -> Any) {
        YouTubeRequests.begin(id)
        val job = scope.launch(YouTubeRequests.current.asContextElement(id), start = CoroutineStart.LAZY) {
            try { promise.resolve(withTimeout(25_000) { block() }) }
            catch (error: CancellationException) { promise.reject("YOUTUBE_CANCELLED", "YouTube request cancelled or timed out") }
            catch (error: Exception) {
                if (com.mavrixfy.app.BuildConfig.DEBUG) {
                    val causes = generateSequence<Throwable>(error) { it.cause }.take(5)
                        .joinToString(" <- ") { it.javaClass.simpleName + ": " + it.message.orEmpty().replace(Regex("https?://[^\\s]+"), "[redacted]").take(240) }
                    android.util.Log.w("MavrixfyYouTube", causes)
                }
                promise.reject("YOUTUBE_UNAVAILABLE", "Mavrixfy Music could not load this item. Please retry.")
            }
            finally { jobs.remove(id); YouTubeRequests.cancel(id) }
        }
        jobs[id] = job
        job.start()
    }

    @ReactMethod fun cancel(id: String) { jobs.remove(id)?.cancel(); YouTubeRequests.cancel(id) }

    @ReactMethod fun search(query: String, filter: String, id: String, promise: Promise) = request(id, promise) {
        legacy.preWarm()
        require(query.isNotBlank())
        val results = coroutineScope {
            val songs = async { if (filter == "playlists") emptyList() else searchItems(query, Filters.MUSIC_SONGS).filterIsInstance<StreamInfoItem>() }
            val playlists = async { if (filter == "songs") emptyList() else searchItems(query, Filters.MUSIC_PLAYLISTS).filterIsInstance<PlaylistInfoItem>() }
            Arguments.createMap().apply {
                putArray("songs", Arguments.createArray().apply { songs.await().forEach { pushMap(song(it)) } })
                putArray("playlists", Arguments.createArray().apply { playlists.await().forEach { item ->
                    pushMap(Arguments.createMap().apply {
                        putString("id", Uri.parse(item.url).getQueryParameter("list") ?: item.url.substringAfterLast("list="))
                        putString("name", item.name)
                        putString("coverUrl", item.thumbnails.lastOrNull()?.url.orEmpty())
                        putDouble("songCount", item.streamCount.coerceAtLeast(0).toDouble())
                        putString("url", item.url)
                        putString("description", item.uploaderName.orEmpty())
                    })
                } })
            }
        }
        results
    }

    private fun searchItems(query: String, filter: String): List<InfoItem> {
        val handler = ServiceList.YouTube.searchQHFactory.fromQuery(query, listOf(filter), "")
        val result = SearchInfo.getInfo(ServiceList.YouTube, handler)
        if (result.relatedItems.isEmpty() && result.errors.isNotEmpty()) throw IOException("Catalog parsing failed")
        return result.relatedItems
    }

    private fun song(item: StreamInfoItem): WritableMap = Arguments.createMap().apply {
        val uri = Uri.parse(item.url)
        putString("videoId", uri.getQueryParameter("v") ?: uri.lastPathSegment.orEmpty())
        putString("title", item.name)
        putString("artist", item.uploaderName.orEmpty())
        putString("coverUrl", item.thumbnails.lastOrNull()?.url.orEmpty())
        putDouble("duration", item.duration.coerceAtLeast(0).toDouble())
    }

    @ReactMethod fun playlist(playlistId: String, cursor: String, id: String, promise: Promise) = request(id, promise) {
        legacy.preWarm()
        require(playlistId.matches(Regex("[A-Za-z0-9_-]+")))
        val url = "https://www.youtube.com/playlist?list=$playlistId"
        val response = Arguments.createMap()
        val items: List<StreamInfoItem>
        val next: Page?
        if (cursor.isBlank()) {
            val info = PlaylistInfo.getInfo(ServiceList.YouTube, url)
            if (info.errors.isNotEmpty()) throw IOException("Incomplete playlist")
            items = info.relatedItems
            next = info.nextPage
            response.putString("name", info.name)
            response.putString("coverUrl", info.thumbnails.lastOrNull()?.url.orEmpty())
            response.putDouble("songCount", info.streamCount.coerceAtLeast(0).toDouble())
        } else {
            val saved = pages[cursor] ?: throw IOException("Playlist cursor expired")
            require(saved.url == url && System.currentTimeMillis() - saved.createdAt < 600_000)
            val more = PlaylistInfo.getMoreItems(ServiceList.YouTube, url, saved.page)
            if (more.errors.isNotEmpty()) throw IOException("Incomplete playlist page")
            items = more.items
            next = more.nextPage
            pages.remove(cursor)
        }
        pages.entries.removeIf { System.currentTimeMillis() - it.value.createdAt > 600_000 }
        if (pages.size > 100) pages.clear()
        val token = if (Page.isValid(next)) UUID.randomUUID().toString().also { pages[it] = Cursor(url, next!!, System.currentTimeMillis()) } else ""
        response.putString("cursor", token)
        response.putArray("songs", Arguments.createArray().apply { items.forEach { pushMap(song(it)) } })
        response
    }

    @ReactMethod fun resolveStream(videoId: String, quality: String, id: String, promise: Promise) = request(id, promise) {
        require(videoId.matches(Regex("[A-Za-z0-9_-]{11}")))
        // InnerTubeX and NewPipe are alternatives inside YouTube only, never another song provider.
        val candidate = withTimeoutOrNull(5_000) { modern.resolve(videoId, null, "anonymous", quality) }
        val resolved = candidate?.takeIf { it.mimeType?.startsWith("audio/") == true } ?: legacy.resolveAudioStream(videoId, preferM4a = true, preferLow = quality == "low")
        require(resolved.url.startsWith("https://") && resolved.mimeType?.startsWith("audio/") == true)
        val token = UUID.randomUUID().toString()
        streams.entries.removeIf { (it.value.expiresAtEpochMs ?: 0) < System.currentTimeMillis() }
        if (streams.size >= 80) streams.clear()
        streams[token] = resolved
        Arguments.createMap().apply {
            putString("resolutionId", token)
            putString("videoId", videoId)
            putString("url", resolved.url)
            putString("mimeType", resolved.mimeType)
            putString("codec", resolved.codec)
            putString("clientProfile", resolved.clientProfile)
            putDouble("bitrate", resolved.bitrate.toDouble())
            putDouble("expiresAt", (resolved.expiresAtEpochMs ?: System.currentTimeMillis() + 300_000).toDouble())
            putMap("headers", Arguments.createMap().apply { resolved.requestHeaders.forEach { (key, value) -> putString(key, value) } })
        }
    }

    @ReactMethod fun rejectStream(resolutionId: String) {
        val stream = streams.remove(resolutionId) ?: return
        modern.reportPlaybackFailure(stream.videoId, stream.authScope, stream.clientProfile)
        if (stream.clientProfile == "NEWPIPE") legacy.invalidatePlayerState(stream.videoId)
    }

    @ReactMethod fun related(videoId: String, id: String, promise: Promise) = request(id, promise) {
        require(videoId.matches(Regex("[A-Za-z0-9_-]{11}")))
        legacy.preWarm()
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
        Arguments.createArray().apply { info.relatedItems.filterIsInstance<StreamInfoItem>().forEach { pushMap(song(it)) } }
    }

    override fun invalidate() { scope.cancel(); pages.clear(); streams.clear(); super.invalidate() }
}
