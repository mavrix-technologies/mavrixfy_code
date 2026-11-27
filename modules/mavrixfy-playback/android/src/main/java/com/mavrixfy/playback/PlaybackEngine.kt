package com.mavrixfy.playback

import android.content.Context
import android.media.AudioTrack
import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.DefaultAudioTrackBufferSizeProvider
import androidx.media3.exoplayer.audio.DefaultAudioTrackProvider
import androidx.media3.exoplayer.drm.DrmSessionManagerProvider
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter
import androidx.media3.exoplayer.mediacodec.SynchronousMediaCodecAdapter
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.WrappingMediaSource
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

/** One process-wide queue, decoder and audio-focus owner. All calls use main. */
@OptIn(UnstableApi::class)
class PlaybackEngine private constructor(private val context: Context) {
  companion object {
    var instance: PlaybackEngine? = null; private set
    fun get(context: Context): PlaybackEngine = instance ?: PlaybackEngine(context.applicationContext).also { instance = it }
    private val EQ_FREQUENCIES_HZ = floatArrayOf(
      25f, 40f, 63f, 100f, 160f, 250f, 400f, 630f,
      1000f, 1600f, 2500f, 4000f, 6300f, 10000f, 16000f
    )
    private const val TARGET_PCM_BUFFER_DURATION_US = 1_000_000
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
      val http = DefaultHttpDataSource.Factory()
        .setDefaultRequestProperties(headers)
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(12000)
        .setReadTimeoutMs(15000)
      val factory = DefaultMediaSourceFactory(DefaultDataSource.Factory(context, http))
      drm?.let { factory.setDrmSessionManagerProvider(it) }
      factory.setLoadErrorHandlingPolicy(errorPolicy ?: DefaultLoadErrorHandlingPolicy(6))
      // HTTP headers belong to the DataSource factory, not MediaItem metadata.
      // Reject metadata-only replacement when they change so ExoPlayer creates
      // a fresh source instead of retaining the old HTTP request properties.
      return object : WrappingMediaSource(factory.createMediaSource(item)) {
        override fun canUpdateMediaItem(mediaItem: MediaItem): Boolean =
          headers == requestHeaders(mediaItem) && super.canUpdateMediaItem(mediaItem)
      }
    }
  }
  private fun buildRenderersFactory(): DefaultRenderersFactory = object : DefaultRenderersFactory(context) {
    private val synchronousAudioCodecFactory = SynchronousMediaCodecAdapter.Factory()

    override fun getCodecAdapterFactory(): MediaCodecAdapter.Factory {
      val fallback = super.getCodecAdapterFactory()
      return MediaCodecAdapter.Factory { configuration ->
        if (MimeTypes.isAudio(configuration.format.sampleMimeType)) {
          synchronousAudioCodecFactory.createAdapter(configuration)
        } else {
          fallback.createAdapter(configuration)
        }
      }
    }

    override fun buildAudioSink(
      context: Context,
      enableFloatOutput: Boolean,
      enableAudioTrackPlaybackParams: Boolean
    ): AudioSink {
      val builder = DefaultAudioSink.Builder(context)
        .setEnableFloatOutput(true)
        .setEnableAudioOutputPlaybackParameters(enableAudioTrackPlaybackParams)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setAudioTrackBufferSizeProvider(
          DefaultAudioTrackBufferSizeProvider.Builder()
            .setMinPcmBufferDurationUs(TARGET_PCM_BUFFER_DURATION_US)
            .setMaxPcmBufferDurationUs(TARGET_PCM_BUFFER_DURATION_US)
            .build()
        )
      }
      val trackProvider = DefaultAudioTrackProvider()
      builder.setAudioTrackProvider { config, audioAttributes, audioSessionId, ctx ->
        val track = trackProvider.getAudioTrack(config, audioAttributes, audioSessionId, ctx)
        if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          !config.offload &&
          !config.tunneling &&
          Util.isEncodingLinearPcm(config.encoding) &&
          track.state == AudioTrack.STATE_INITIALIZED
        ) {
          runCatching {
            val targetStartFrames = max(1, min(track.startThresholdInFrames, config.sampleRate / 10))
            track.setStartThresholdInFrames(targetStartFrames)
          }
        }
        track
      }
      return builder.build()
    }
  }
  private val loadControl = DefaultLoadControl.Builder()
    .setBufferDurationsMs(15_000, 50_000, 1_000, 2_000)
    .setBackBuffer(15_000, true)
    .build()
  val player = ExoPlayer.Builder(context, buildRenderersFactory())
    .setLoadControl(loadControl)
    .setMediaSourceFactory(mediaFactory())
    .build().apply {
      setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
      setHandleAudioBecomingNoisy(true)
      setWakeMode(C.WAKE_MODE_NETWORK)
    }
  var emit: ((String, Map<String, Any?>) -> Unit)? = null
  private var serviceAttached = false
  fun attachService() { serviceAttached = true }
  fun detachService() { serviceAttached = false; releaseIfUnowned() }
  fun detachBridge() { emit = null; carClientReady = false; releaseIfUnowned() }
  private fun releaseIfUnowned() {
    if (serviceAttached || emit != null) return
    handler.removeCallbacksAndMessages(null)
    releaseAudioEffects()
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
  private var activeTrackedId: String? = null
  private var activeTrackedIndex = -1
  private var activeLastPosMs = 0L
  private var activeLastDurMs = 0L
  private var recoveryTrackId: String? = null
  private var recoveryAttempts = 0
  private var refreshingCurrentSource = false
  private fun isLocalTrack(track: Map<String, Any?>?): Boolean {
    val url = track?.get("url") as? String ?: return false
    return url.startsWith("file://", ignoreCase = true) ||
      url.startsWith("content://", ignoreCase = true) ||
      url.startsWith("/")
  }
  private fun updateTrackedProgress() {
    val index = player.currentMediaItemIndex
    val trackId = tracks.getOrNull(index)?.get("id")?.toString() ?: return
    if (activeTrackedId != trackId || activeTrackedIndex != index) {
      activeTrackedId = trackId
      activeTrackedIndex = index
      activeLastPosMs = 0L
      activeLastDurMs = 0L
    }
    val pos = player.currentPosition.coerceAtLeast(0L)
    if (pos > 0L) activeLastPosMs = max(activeLastPosMs, pos)
    val dur = player.duration
    if (dur != C.TIME_UNSET && dur > 0L) activeLastDurMs = dur
  }
  private fun canRecoverTrack(trackId: String?): Boolean {
    if (trackId.isNullOrBlank()) return false
    if (recoveryTrackId != trackId) {
      recoveryTrackId = trackId
      recoveryAttempts = 0
    }
    return recoveryAttempts < 2
  }
  private fun isRecoverableStreamError(error: PlaybackException): Boolean = when (error.errorCode) {
    PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
    PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
    PlaybackException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE,
    PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND,
    PlaybackException.ERROR_CODE_TIMEOUT -> true
    else -> false
  }
  private fun requestSourceRefresh(index: Int, trackId: String, positionMs: Long): Boolean {
    if (index !in tracks.indices || tracks[index]["id"]?.toString() != trackId) return false
    if (!canRecoverTrack(trackId)) return false
    recoveryAttempts++
    val updated = tracks[index].toMutableMap()
    updated["url"] = ""
    tracks[index] = updated
    cancelSourceRequest()
    sourceResolutionFailure = null
    internalChange = true
    refreshingCurrentSource = true
    try {
      val order = player.shuffleOrder
      player.setMediaSources(tracks.map(::source), index, positionMs.coerceAtLeast(0L))
      player.setShuffleOrder(order)
      player.playWhenReady = true
      player.prepare()
    } finally {
      refreshingCurrentSource = false
    }
    requestCurrentSource(refresh = true)
    internalChange = false
    return true
  }
  private var tracks = mutableListOf<Map<String, Any?>>()
  private var equalizer: Equalizer? = null
  private var dynamicsProcessing: DynamicsProcessing? = null
  private var gains = listOf<Double>()
  private var eqEnabled = false
  private var normalizeVolume = false
  private var originalSoundEnabled = false
  private val handler = Handler(Looper.getMainLooper())
  fun event(name: String, data: Map<String, Any?> = emptyMap()) { emit?.invoke(name, data) }
  fun cancelSourceRequest() {
    sourceRequestDeadline?.let(handler::removeCallbacks)
    sourceRequestDeadline = null
    pendingSourceRequest = null
  }
  private fun requestCurrentSource(refresh: Boolean = false) {
    val index = player.currentMediaItemIndex
    val track = tracks.getOrNull(index) ?: return
    if (!player.playWhenReady || !((track["url"] as? String).isNullOrBlank())) return
    val id = track["id"]?.toString() ?: return
    if (!refresh && pendingSourceRequest?.get("index") == index && pendingSourceRequest?.get("trackId") == id) return
    val request = buildMap<String, Any?> {
      put("requestId", ++sourceRequestSerial)
      put("index", index)
      put("trackId", id)
      put("position", player.currentPosition.coerceAtLeast(0) / 1000.0)
      if (refresh) put("refresh", true)
    }
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
        updateTrackedProgress()
        event("playback-state", mapOf("state" to status()))
        if (state == Player.STATE_ENDED) {
          val index = player.currentMediaItemIndex
          val activeTrack = tracks.getOrNull(index)
          val activeId = activeTrack?.get("id")?.toString()
          val durMs = if (player.duration != C.TIME_UNSET && player.duration > 0L) player.duration else activeLastDurMs
          val posMs = max(player.currentPosition.coerceAtLeast(0L), activeLastPosMs)
          val premature = !internalChange && !remoteSelection && activeTrack != null && !isLocalTrack(activeTrack) &&
            durMs > 15_000L && posMs > 2_000L && (durMs - posMs) > 4_000L
          if (premature && activeId != null) {
            if (requestSourceRefresh(index, activeId, posMs)) return
            event("playback-queue-ended", mapOf(
              "premature" to true,
              "position" to posMs / 1000.0,
              "duration" to durMs / 1000.0,
              "trackId" to activeId,
              "index" to index,
            ))
            return
          }
          event("playback-queue-ended")
        }
      }
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        updateTrackedProgress()
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
        val index = player.currentMediaItemIndex
        val prevIndex = activeTrackedIndex
        val prevId = activeTrackedId
        val prevPosMs = activeLastPosMs
        val prevDurMs = activeLastDurMs
        val prevTrack = tracks.getOrNull(prevIndex)
        val prematureAutoAdvance = reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO &&
          !internalChange && !remoteSelection &&
          prevId != null && prevIndex in tracks.indices && prevIndex != index &&
          prevTrack != null && !isLocalTrack(prevTrack) &&
          prevDurMs > 15_000L && prevPosMs > 2_000L && (prevDurMs - prevPosMs) > 4_000L
        if (prematureAutoAdvance && prevId != null && requestSourceRefresh(prevIndex, prevId, prevPosMs)) {
          return
        }
        cancelSourceRequest()
        sourceResolutionFailure = null
        activeTrackedId = item?.mediaId ?: tracks.getOrNull(index)?.get("id")?.toString()
        activeTrackedIndex = index
        if (!refreshingCurrentSource) {
          activeLastPosMs = 0L
          activeLastDurMs = 0L
        }
        tracks.getOrNull(index)?.takeIf { item != null && it["id"] == item.mediaId }?.let {
          carLibrary.rememberSelection(it)
          catalogChanged?.invoke()
        }
        event("playback-active-track", mapOf("index" to index, "track" to tracks.getOrNull(index), "externalSelection" to remoteSelection))
        remoteSelection = false
        if (!refreshingCurrentSource) requestCurrentSource()
      }
      override fun onPlayerError(error: PlaybackException) {
        val index = player.currentMediaItemIndex
        val activeTrack = tracks.getOrNull(index)
        val trackId = activeTrack?.get("id")?.toString()
        val resumeMs = max(player.currentPosition.coerceAtLeast(0L), activeLastPosMs)
        if (!internalChange && player.playWhenReady && activeTrack != null && !isLocalTrack(activeTrack) &&
          isRecoverableStreamError(error) && trackId != null && requestSourceRefresh(index, trackId, resumeMs)) {
          return
        }
        internalChange = false
        player.pause()
        event("playback-error", mapOf("trackId" to trackId, "code" to error.errorCodeName, "message" to error.errorCodeName))
      }
      override fun onAudioSessionIdChanged(audioSessionId: Int) {
        releaseAudioEffects()
        if (audioSessionId != C.AUDIO_SESSION_ID_UNSET) {
          initAudioEffects(audioSessionId)
          runCatching { applyAudioEffects() }
        }
      }
    })
    handler.post(object : Runnable {
      override fun run() {
        updateTrackedProgress()
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
    "equalizerAvailable" to (dynamicsProcessing != null || equalizer != null), "sourceRequest" to pendingSourceRequest, "supportsSourceRequests" to true,
    "audioDiagnostics" to mapOf(
      "trackId" to player.currentMediaItem?.mediaId,
      "codec" to player.audioFormat?.sampleMimeType,
      "bitrate" to player.audioFormat?.bitrate,
      "sampleRate" to player.audioFormat?.sampleRate,
      "channelCount" to player.audioFormat?.channelCount,
      "volume" to player.volume,
      "originalSoundEnabled" to originalSoundEnabled,
      "equalizerActive" to (!originalSoundEnabled && eqEnabled && gains.any { abs(it) > 0.01 } && (dynamicsProcessing?.enabled == true || equalizer?.enabled == true)),
      "compressionActive" to (!originalSoundEnabled && normalizeVolume && dynamicsProcessing?.enabled == true)
    ))
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
  private fun releaseAudioEffects() {
    runCatching { dynamicsProcessing?.release() }
    dynamicsProcessing = null
    runCatching { equalizer?.release() }
    equalizer = null
  }

  private fun initAudioEffects(audioSessionId: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val created = runCatching {
        val config = DynamicsProcessing.Config.Builder(
          DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
          2,
          false, 0,
          true, 3,
          true, EQ_FREQUENCIES_HZ.size,
          true
        ).setPreferredFrameDuration(10.0f).build()
        DynamicsProcessing(0, audioSessionId, config)
      }.getOrNull()
      if (created != null) {
        dynamicsProcessing = created
        return
      }
    }
    runCatching { equalizer = Equalizer(0, audioSessionId) }
  }

  private fun applyAudioEffects() {
    if (originalSoundEnabled) {
      dynamicsProcessing?.enabled = false
      equalizer?.enabled = false
      return
    }
    val dp = dynamicsProcessing
    if (dp != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val hasEqBoost = eqEnabled && gains.any { abs(it) > 0.01 }
      val shouldEnable = hasEqBoost || normalizeVolume
      if (!shouldEnable) {
        dp.enabled = false
        return
      }
      val maxBoost = if (hasEqBoost) (gains.maxOfOrNull { it.coerceAtLeast(0.0) } ?: 0.0) else 0.0
      val preampDb = if (maxBoost > 0.0) (-maxBoost * 0.65).toFloat().coerceIn(-6.0f, 0.0f) else 0.0f
      dp.setInputGainAllChannelsTo(preampDb)

      val postEq = DynamicsProcessing.Eq(true, hasEqBoost, EQ_FREQUENCIES_HZ.size)
      for (i in EQ_FREQUENCIES_HZ.indices) {
        val gainDb = if (hasEqBoost) (gains.getOrNull(i) ?: 0.0).toFloat().coerceIn(-8.0f, 8.0f) else 0.0f
        postEq.setBand(i, DynamicsProcessing.EqBand(hasEqBoost, EQ_FREQUENCIES_HZ[i], gainDb))
      }
      dp.setPostEqAllChannelsTo(postEq)

      val mbc = DynamicsProcessing.Mbc(true, normalizeVolume, 3)
      val mbcCutoffs = floatArrayOf(220.0f, 2400.0f, 20000.0f)
      val mbcPostGains = floatArrayOf(1.5f, 2.0f, 1.5f)
      for (b in 0 until 3) {
        mbc.setBand(
          b,
          DynamicsProcessing.MbcBand(
            normalizeVolume,
            mbcCutoffs[b],
            15.0f,
            180.0f,
            1.6f,
            -18.0f,
            6.0f,
            -80.0f,
            1.0f,
            0.0f,
            mbcPostGains[b]
          )
        )
      }
      dp.setMbcAllChannelsTo(mbc)

      val limiter = DynamicsProcessing.Limiter(true, true, 0, 2.0f, 60.0f, 10.0f, -1.0f, 0.0f)
      dp.setLimiterAllChannelsTo(limiter)
      dp.enabled = true
      return
    }

    val eq = equalizer ?: return
    val frequencies = EQ_FREQUENCIES_HZ
    for (band in 0 until eq.numberOfBands.toInt()) {
      val center = eq.getCenterFreq(band.toShort()) / 1000.0
      val index = frequencies.indices.minByOrNull { abs(kotlin.math.ln(frequencies[it].toDouble() / center)) } ?: 0
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
        } else {
          activeTrackedId = null
          activeTrackedIndex = -1
          activeLastPosMs = 0L
          activeLastDurMs = 0L
          recoveryTrackId = null
          recoveryAttempts = 0
          player.setMediaSources(next.map(::source), index.coerceIn(0, next.lastIndex), (position * 1000).toLong()); player.prepare(); player.playWhenReady = playing
        }
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
      "skip" -> if (index in tracks.indices) {
        cancelSourceRequest(); sourceResolutionFailure = null
        activeTrackedId = tracks[index]["id"]?.toString(); activeTrackedIndex = index; activeLastPosMs = 0L; activeLastDurMs = 0L
        player.seekTo(index, (position * 1000).toLong()); player.prepare(); requestCurrentSource()
      }
      "begin" -> {
        if ((args["sourceRequestId"] as? Number)?.toLong() != pendingSourceRequest?.get("requestId")) cancelSourceRequest()
        internalChange = true
        player.pause()
      }
      "play" -> { sourceResolutionFailure = null; internalChange = false; if (player.playbackState == Player.STATE_ENDED) player.seekToDefaultPosition(); if (player.playbackState == Player.STATE_IDLE) player.prepare(); player.play(); requestCurrentSource() }
      "pause" -> { cancelCarResolution?.invoke(); cancelSourceRequest(); internalChange = false; player.pause() }
      "stop" -> { cancelCarResolution?.invoke(); cancelSourceRequest(); internalChange = false; player.pause(); player.seekTo(0) }
      "seek" -> { player.seekTo((position * 1000).toLong()); event("playback-progress", mapOf("position" to position, "duration" to duration(), "track" to player.currentMediaItemIndex, "trackId" to player.currentMediaItem?.mediaId)) }
      "reset" -> { cancelCarResolution?.invoke(); cancelSourceRequest(); sourceResolutionFailure = null; internalChange = false; activeTrackedId = null; activeTrackedIndex = -1; activeLastPosMs = 0L; activeLastDurMs = 0L; recoveryTrackId = null; recoveryAttempts = 0; player.stop(); player.clearMediaItems(); tracks.clear(); dynamicsProcessing?.enabled = false; equalizer?.enabled = false; publishQueue() }
      "repeat" -> player.repeatMode = when(args["mode"]) { "track" -> Player.REPEAT_MODE_ONE; "queue" -> Player.REPEAT_MODE_ALL; else -> Player.REPEAT_MODE_OFF }
      "volume" -> player.volume = ((args["volume"] as? Number)?.toFloat() ?: 1f).coerceIn(0f, 1f)
      "equalizer" -> {
        gains = (args["gains"] as? List<Number> ?: emptyList()).map { it.toDouble() }
        eqEnabled = args["enabled"] == true
        (args["normalizeVolume"] as? Boolean)?.let { normalizeVolume = it }
        (args["originalSoundEnabled"] as? Boolean)?.let { originalSoundEnabled = it }
        runCatching { applyAudioEffects() }
      }
      "normalizeVolume" -> {
        normalizeVolume = args["enabled"] == true
        runCatching { applyAudioEffects() }
      }
      "originalSound" -> {
        originalSoundEnabled = args["enabled"] == true
        applyAudioEffects()
      }
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
