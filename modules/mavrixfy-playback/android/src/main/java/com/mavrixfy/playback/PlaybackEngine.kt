package com.mavrixfy.playback

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.WrappingMediaSource
import androidx.media3.exoplayer.drm.DrmSessionManagerProvider
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import android.media.audiofx.Equalizer
import kotlin.math.abs
import org.json.JSONObject

/** One process-wide queue, decoder and audio-focus owner. All calls use main. */
class PlaybackEngine private constructor(private val context: Context) {
  companion object {
    var instance: PlaybackEngine? = null; private set
    fun get(context: Context): PlaybackEngine = instance ?: PlaybackEngine(context.applicationContext).also { instance = it }
  }
  private fun requestHeaders(item: MediaItem): Map<String, String> {
    val track = item.localConfiguration?.tag as? Map<*, *>
    return (track?.get("headers") as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value.toString() } ?: emptyMap()
  }
  private fun mediaFactory(): MediaSource.Factory = object : MediaSource.Factory {
    private var drm: DrmSessionManagerProvider? = null
    private var errorPolicy: LoadErrorHandlingPolicy? = null
    override fun getSupportedTypes() = DefaultMediaSourceFactory(context).supportedTypes
    override fun setDrmSessionManagerProvider(provider: DrmSessionManagerProvider) = apply { drm = provider }
    override fun setLoadErrorHandlingPolicy(policy: LoadErrorHandlingPolicy) = apply { errorPolicy = policy }
    override fun createMediaSource(item: MediaItem): MediaSource {
      if (item.localConfiguration?.uri?.let { it.scheme == "mavrixfy" && it.host == "unresolved" } == true) return UnresolvedMediaSource(item)
      val headers = requestHeaders(item)
      val http = DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
      val factory = DefaultMediaSourceFactory(DefaultDataSource.Factory(context, http))
      drm?.let { factory.setDrmSessionManagerProvider(it) }; errorPolicy?.let { factory.setLoadErrorHandlingPolicy(it) }
      // HTTP headers belong to the DataSource factory, not MediaItem metadata.
      // Reject metadata-only replacement when they change so ExoPlayer creates
      // a fresh source instead of retaining the old HTTP request properties.
      return object : WrappingMediaSource(factory.createMediaSource(item)) {
        override fun canUpdateMediaItem(mediaItem: MediaItem): Boolean =
          headers == requestHeaders(mediaItem) && super.canUpdateMediaItem(mediaItem)
      }
    }
  }
  val player = ExoPlayer.Builder(context).setMediaSourceFactory(mediaFactory()).build().apply {
    setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
    setHandleAudioBecomingNoisy(true)
    setWakeMode(C.WAKE_MODE_NETWORK)
    setPreloadConfiguration(ExoPlayer.PreloadConfiguration(5_000_000L))
  }
  var emit: ((String, Map<String, Any?>) -> Unit)? = null
  private var serviceAttached = false
  fun attachService() { serviceAttached = true }
  fun detachService() { serviceAttached = false; releaseIfUnowned() }
  fun detachBridge() { emit = null; carClientReady = false; releaseIfUnowned() }
  private fun releaseIfUnowned() {
    if (serviceAttached || emit != null) return
    handler.removeCallbacksAndMessages(null)
    equalizer?.release(); equalizer = null
    player.release()
    if (instance === this) instance = null
  }
  internal val carLibrary = CarMediaRepository(context)
  var catalogChanged: (() -> Unit)? = null
  var controls = emptyMap<String, Any?>()
  var controlsChanged: (() -> Unit)? = null
  var carClientReady = false
  var carResolutionComplete: ((Map<String, Any?>) -> Unit)? = null
  var cancelCarResolution: (() -> Unit)? = null
  var remoteSelection = false
  var internalChange = false
  private var sourceRequestSerial = 0L
  private var pendingSourceRequest: Map<String, Any?>? = null
  private var sourceRequestDeadline: Runnable? = null
  private var sourceResolutionFailure: String? = null
  private var tracks = mutableListOf<Map<String, Any?>>()
  private var equalizer: Equalizer? = null
  private var gains = listOf<Double>()
  private var eqEnabled = false
  private val handler = Handler(Looper.getMainLooper())
  fun event(name: String, data: Map<String, Any?> = emptyMap()) { emit?.invoke(name, data) }
  fun cancelSourceRequest() {
    sourceRequestDeadline?.let(handler::removeCallbacks)
    sourceRequestDeadline = null
    pendingSourceRequest = null
  }
  private fun requestCurrentSource() {
    val index = player.currentMediaItemIndex
    val track = tracks.getOrNull(index) ?: return
    if (!player.playWhenReady || !((track["url"] as? String).isNullOrBlank())) return
    val id = track["id"]?.toString() ?: return
    if (pendingSourceRequest?.get("index") == index && pendingSourceRequest?.get("trackId") == id) return
    val request = mapOf("requestId" to ++sourceRequestSerial, "index" to index, "trackId" to id,
      "position" to player.currentPosition.coerceAtLeast(0) / 1000.0)
    cancelSourceRequest()
    sourceResolutionFailure = null
    pendingSourceRequest = request
    val deadline = Runnable {
      if (pendingSourceRequest?.get("requestId") != request["requestId"] || player.currentMediaItemIndex != index ||
        tracks.getOrNull(index)?.get("id")?.toString() != id || !((tracks[index]["url"] as? String).isNullOrBlank())) return@Runnable
      cancelSourceRequest()
      sourceResolutionFailure = "SOURCE_RESOLUTION_TIMEOUT"
      internalChange = false
      player.pause()
      event("remote-pause")
      event("playback-error", mapOf("trackId" to id, "code" to sourceResolutionFailure,
        "message" to "This song could not be prepared. Tap Play to retry."))
    }
    sourceRequestDeadline = deadline
    handler.postDelayed(deadline, 45000)
    event("playback-source-required", request)
  }
  init {
    player.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(state: Int) {
        event("playback-state", mapOf("state" to status()))
        if (state == Player.STATE_ENDED) event("playback-queue-ended")
      }
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (!isPlaying) carLibrary.rememberPosition(player.currentMediaItem?.mediaId, player.currentPosition)
        event("playback-state", mapOf("state" to status()))
      }
      override fun onPlayWhenReadyChanged(ready: Boolean, reason: Int) {
        if (!ready && !internalChange) cancelSourceRequest()
        if (!ready && (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS || reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY)) event("remote-pause")
        event("playback-play-when-ready", mapOf("playWhenReady" to ready, "reason" to if (internalChange) "source-change" else "pause"))
        if (ready) requestCurrentSource()
      }
      override fun onPlaybackSuppressionReasonChanged(reason: Int) {
        if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) event("playback-interruption", mapOf("resumed" to false))
        else if (player.playWhenReady) event("playback-interruption", mapOf("resumed" to true))
      }
      override fun onMediaItemTransition(item: MediaItem?, reason: Int) {
        cancelSourceRequest()
        sourceResolutionFailure = null
        val index = player.currentMediaItemIndex
        tracks.getOrNull(index)?.takeIf { item != null && it["id"] == item.mediaId }?.let {
          carLibrary.rememberSelection(it)
          catalogChanged?.invoke()
        }
        event("playback-active-track", mapOf("index" to index, "track" to tracks.getOrNull(index), "externalSelection" to remoteSelection))
        remoteSelection = false
        requestCurrentSource()
      }
      override fun onPlayerError(error: PlaybackException) {
        internalChange = false
        player.pause()
        event("playback-error", mapOf("trackId" to tracks.getOrNull(player.currentMediaItemIndex)?.get("id"), "code" to error.errorCodeName, "message" to error.errorCodeName))
      }
      override fun onAudioSessionIdChanged(audioSessionId: Int) {
        equalizer?.release(); equalizer = null
        if (audioSessionId != C.AUDIO_SESSION_ID_UNSET) runCatching { equalizer = Equalizer(0, audioSessionId); applyEqualizer() }
      }
    })
    handler.post(object : Runnable {
      override fun run() {
        if (player.mediaItemCount > 0) event("playback-progress", mapOf("position" to player.currentPosition / 1000.0, "duration" to duration(), "buffered" to player.bufferedPosition.coerceAtLeast(0) / 1000.0, "track" to player.currentMediaItemIndex, "trackId" to player.currentMediaItem?.mediaId))
        handler.postDelayed(this, if (player.isPlaying) 500 else 1000)
      }
    })
  }
  private fun status(): String = when {
    sourceResolutionFailure != null -> "error"
    player.playerError != null -> "error"
    player.playbackState == Player.STATE_ENDED -> "ended"
    player.playbackState == Player.STATE_BUFFERING -> "buffering"
    player.isPlaying -> "playing"
    player.mediaItemCount == 0 -> "none"
    else -> "paused"
  }
  private fun duration(): Double = if (player.duration == C.TIME_UNSET) 0.0 else player.duration.coerceAtLeast(0) / 1000.0
  fun snapshot(): Map<String, Any?> = mapOf("queue" to tracks, "index" to if (tracks.isEmpty()) -1 else player.currentMediaItemIndex,
    "state" to status(), "position" to player.currentPosition / 1000.0, "duration" to duration(), "buffered" to player.bufferedPosition.coerceAtLeast(0) / 1000.0, "playWhenReady" to player.playWhenReady,
    "equalizerAvailable" to (equalizer != null), "sourceRequest" to pendingSourceRequest, "supportsSourceRequests" to true)
  private fun source(track: Map<String, Any?>): MediaSource {
    val url = track["url"] as? String ?: ""
    val item = MediaItem.Builder().setUri(url.ifBlank { "mavrixfy://unresolved/${track["id"]}" }).setMediaId(track["id"]?.toString() ?: url).setTag(track)
      .setMediaMetadata(MediaMetadata.Builder().setTitle(track["title"]?.toString()).setArtist(track["artist"]?.toString()).setAlbumTitle(track["album"]?.toString())
        .setArtworkUri((track["artwork"] as? String)?.let { Uri.parse(it) }).build()).build()
    return mediaFactory().createMediaSource(item)
  }
  private fun publishQueue() {
    carLibrary.rememberQueue(tracks)
    catalogChanged?.invoke()
  }
  private fun applyEqualizer() {
    val eq = equalizer ?: return
    val frequencies = doubleArrayOf(25.0,40.0,63.0,100.0,160.0,250.0,400.0,630.0,1000.0,1600.0,2500.0,4000.0,6300.0,10000.0,16000.0)
    for (band in 0 until eq.numberOfBands.toInt()) {
      val center = eq.getCenterFreq(band.toShort()) / 1000.0
      val index = frequencies.indices.minByOrNull { abs(kotlin.math.ln(frequencies[it] / center)) } ?: 0
      val level = ((gains.getOrNull(index) ?: 0.0) * 100).toInt().coerceIn(eq.bandLevelRange[0].toInt(), eq.bandLevelRange[1].toInt())
      eq.setBandLevel(band.toShort(), level.toShort())
    }
    eq.enabled = eqEnabled
  }
  @Suppress("UNCHECKED_CAST")
  fun command(name: String, args: Map<String, Any?>): Map<String, Any?> {
    val index = (args["index"] as? Number)?.toInt() ?: 0
    val position = ((args["position"] as? Number)?.toDouble() ?: 0.0).coerceAtLeast(0.0)
    when (name) {
      "sourceRequestFinished" -> {
        if ((args["requestId"] as? Number)?.toLong() == pendingSourceRequest?.get("requestId")) {
          cancelSourceRequest()
          sourceResolutionFailure = "SOURCE_UNAVAILABLE"
          internalChange = false
          player.pause()
          event("playback-state", mapOf("state" to status()))
        }
      }
      "carSelection" -> {
        val selection = carLibrary.preparedSelection(args["id"] as? String ?: "")
        return snapshot() + mapOf("queue" to selection.tracks, "index" to selection.index)
      }
      "carClient" -> { carClientReady = args["ready"] == true; controlsChanged?.invoke() }
      "carResolution" -> carResolutionComplete?.invoke(args)
      "catalog" -> {
        if (carLibrary.updateCatalog(args["json"] as? String ?: "{}")) {
          cancelCarResolution?.invoke()
          if (tracks.any { (it["accountId"] ?: "guest") != carLibrary.owner }) {
            tracks.clear(); player.stop(); player.clearMediaItems()
          }
        }
        catalogChanged?.invoke()
      }
      "controls" -> { controls = args; controlsChanged?.invoke() }
      "setQueue" -> {
        cancelSourceRequest()
        sourceResolutionFailure = null
        val next = (args["tracks"] as? List<Map<String, Any?>> ?: emptyList()).toMutableList()
        val playing = player.playWhenReady
        val current = tracks.getOrNull(player.currentMediaItemIndex)
        val target = next.getOrNull(index)
        val preserve = args["preserveCurrentTrack"] == true && current != null && target != null && current["id"] == target["id"] && current["url"] == target["url"] && current["headers"] == target["headers"]
        tracks = next
        carLibrary.rememberSources(next)
        if (next.isEmpty()) player.clearMediaItems()
        else if (preserve) {
          next.forEachIndexed { at, track ->
            val wanted = source(track)
            val found = (at until player.mediaItemCount).firstOrNull { candidate -> val item = player.getMediaItemAt(candidate); item.mediaId == wanted.mediaItem.mediaId && item.localConfiguration?.uri == wanted.mediaItem.localConfiguration?.uri }
            if (found == null) player.addMediaSource(at, wanted)
            else { if (found != at) player.moveMediaItem(found, at); player.replaceMediaItem(at, wanted.mediaItem) }
          }
          while (player.mediaItemCount > next.size) player.removeMediaItem(player.mediaItemCount - 1)
        } else { player.setMediaSources(next.map(::source), index.coerceIn(0, next.lastIndex), (position * 1000).toLong()); player.prepare(); player.playWhenReady = playing }
        publishQueue()
      }
      "update" -> if (index in tracks.indices) {
        if (args["expectedTrackId"] != null && args["expectedTrackId"] != tracks[index]["id"]) return snapshot()
        if (args["onlyCurrent"] == true && index != player.currentMediaItemIndex) return snapshot()
        if (args["onlyUpcoming"] == true && index <= player.currentMediaItemIndex) return snapshot()
        val old = tracks[index]; val next = old + (args["metadata"] as? Map<String, Any?> ?: emptyMap()); tracks[index] = next
        if (index == player.currentMediaItemIndex) { cancelSourceRequest(); sourceResolutionFailure = null }
        carLibrary.rememberSources(listOf(next))
        if (old["url"] != next["url"] || old["headers"] != next["headers"]) {
          val current = player.currentMediaItemIndex; val pos = player.currentPosition; val playing = player.playWhenReady
          if (index == current) {
            // Removing the current source during replaceMediaItem can select
            // a shuffled successor before a restoring seek. Set an explicit
            // index/position in one operation and retain the existing order.
            val order = player.shuffleOrder
            player.setMediaSources(tracks.map(::source), current, pos)
            player.setShuffleOrder(order)
            player.prepare()
            player.playWhenReady = playing
          } else player.replaceMediaItem(index, source(next).mediaItem)
        } else player.replaceMediaItem(index, source(next).mediaItem)
        publishQueue()
      }
      "add" -> { val additions = args["tracks"] as? List<Map<String, Any?>> ?: emptyList(); val at = index.coerceIn(0, tracks.size); tracks.addAll(at, additions); carLibrary.rememberSources(additions); player.addMediaSources(at, additions.map(::source)); player.prepare(); publishQueue() }
      "remove" -> if (index in tracks.indices) { tracks.removeAt(index); player.removeMediaItem(index); publishQueue() }
      "move" -> { val to = (args["to"] as? Number)?.toInt() ?: index; if (index in tracks.indices && to in tracks.indices) { tracks.add(to, tracks.removeAt(index)); player.moveMediaItem(index, to); publishQueue() } }
      "skip" -> if (index in tracks.indices) { cancelSourceRequest(); sourceResolutionFailure = null; player.seekTo(index, (position * 1000).toLong()); player.prepare(); requestCurrentSource() }
      "begin" -> {
        if ((args["sourceRequestId"] as? Number)?.toLong() != pendingSourceRequest?.get("requestId")) cancelSourceRequest()
        internalChange = true
        player.pause()
      }
      "play" -> { sourceResolutionFailure = null; internalChange = false; if (player.playbackState == Player.STATE_ENDED) player.seekToDefaultPosition(); if (player.playbackState == Player.STATE_IDLE) player.prepare(); player.play(); requestCurrentSource() }
      "pause" -> { cancelCarResolution?.invoke(); cancelSourceRequest(); internalChange = false; player.pause() }
      "stop" -> { cancelCarResolution?.invoke(); cancelSourceRequest(); internalChange = false; player.pause(); player.seekTo(0) }
      "seek" -> { player.seekTo((position * 1000).toLong()); event("playback-progress", mapOf("position" to position, "duration" to duration(), "track" to player.currentMediaItemIndex, "trackId" to player.currentMediaItem?.mediaId)) }
      "reset" -> { cancelCarResolution?.invoke(); cancelSourceRequest(); sourceResolutionFailure = null; internalChange = false; player.stop(); player.clearMediaItems(); tracks.clear(); equalizer?.enabled = false; publishQueue() }
      "repeat" -> player.repeatMode = when(args["mode"]) { "track" -> Player.REPEAT_MODE_ONE; "queue" -> Player.REPEAT_MODE_ALL; else -> Player.REPEAT_MODE_OFF }
      "volume" -> player.volume = ((args["volume"] as? Number)?.toFloat() ?: 1f).coerceIn(0f, 1f)
      "equalizer" -> { gains = (args["gains"] as? List<Number> ?: emptyList()).map { it.toDouble() }; eqEnabled = args["enabled"] == true; runCatching { applyEqualizer() } }
      else -> error("Unknown playback command: $name")
    }
    // Queue edits can move the selected occurrence without a media transition.
    // Retire a token whose index changed, then publish the new occurrence token.
    pendingSourceRequest?.let { pending ->
      val selected = player.currentMediaItemIndex
      if (pending["index"] != selected || pending["trackId"] != tracks.getOrNull(selected)?.get("id")) cancelSourceRequest()
    }
    if (!internalChange) requestCurrentSource()
    return snapshot()
  }
}
