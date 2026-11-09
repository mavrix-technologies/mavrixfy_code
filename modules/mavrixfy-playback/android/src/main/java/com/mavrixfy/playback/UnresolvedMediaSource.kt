package com.mavrixfy.playback

import androidx.media3.common.MediaItem
import androidx.media3.datasource.TransferListener
import androidx.media3.exoplayer.source.BaseMediaSource
import androidx.media3.exoplayer.source.MediaPeriod
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.upstream.Allocator

/**
 * An unresolved queue entry is a pending source, never an invalid URL to open.
 * MaskingMediaSource holds its period until a real timeline is published. This
 * source intentionally stays unprepared until the shared resolver replaces it.
 */
internal class UnresolvedMediaSource(private val item: MediaItem) : BaseMediaSource() {
  override fun getMediaItem(): MediaItem = item
  override fun prepareSourceInternal(mediaTransferListener: TransferListener?) = Unit
  override fun maybeThrowSourceInfoRefreshError() = Unit
  override fun releaseSourceInternal() = Unit
  override fun createPeriod(id: MediaSource.MediaPeriodId, allocator: Allocator, startPositionUs: Long): MediaPeriod =
    error("An unresolved source has no published timeline or media period")
  override fun releasePeriod(mediaPeriod: MediaPeriod) = Unit
}
