package com.mavrixfy.app.auto

import android.content.Intent
import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import androidx.media.MediaBrowserServiceCompat

/**
 * MavrixfyAutoService — MediaBrowserService for Android Auto discovery.
 *
 * This service allows Android Auto to connect to the app and browse/play media.
 * Actual playback is delegated to react-native-track-player's MusicService.
 */
class MavrixfyAutoService : MediaBrowserServiceCompat() {

    override fun onCreate() {
        super.onCreate()
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot {
        // Allow all clients to connect (restrict in production if needed)
        return BrowserRoot("root", null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>
    ) {
        // Return empty list — playback is handled by TrackPlayer's MusicService
        result.sendResult(emptyList())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return super.onStartCommand(intent, flags, startId)
    }
}
