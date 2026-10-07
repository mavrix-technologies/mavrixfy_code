package com.mavrixfy.app.youtube

// Descriptor boundary adapted from LastWave (GPL-3.0). See THIRD_PARTY.md.
data class YouTubeAudioStream(
    val videoId: String, val url: String, val itag: Int?, val mimeType: String?,
    val codec: String?, val bitrate: Int, val sampleRateHz: Int?, val durationMs: Long?,
    val contentLength: Long?, val isAdaptive: Boolean, val clientProfile: String,
    val authScope: String, val requestHeaders: Map<String, String> = emptyMap(),
    val expiresAtEpochMs: Long? = null,
)
