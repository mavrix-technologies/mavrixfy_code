package com.mavrixfy.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
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
import java.lang.reflect.Field

/**
 * MavrixfyMediaBrowserService — Android Auto MediaBrowserService.
 *
 * Implements Android Auto MediaBrowserServiceCompat protocol and connects
 * Android Auto directly to react-native-track-player's active MediaSession.
 */
class MavrixfyMediaBrowserService : MediaBrowserServiceCompat() {

    private var musicServiceBinder: MusicService.MusicBinder? = null
    private var isBound = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var sessionBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.d(TAG, "Connected to MusicService")
            if (service is MusicService.MusicBinder) {
                musicServiceBinder = service
                isBound = true
                scheduleTokenExtraction()
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.d(TAG, "Disconnected from MusicService")
            musicServiceBinder = null
            isBound = false
            sessionBound = false
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate()")
        // Bind to TrackPlayer's MusicService to attach to the active MediaSession
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

    private fun scheduleTokenExtraction() {
        if (sessionBound) return

        val extracted = tryExtractSessionToken()
        if (extracted != null) {
            // Guard: setSessionToken can only be called once in MediaBrowserServiceCompat
            try {
                if (sessionToken == null) {
                    sessionToken = extracted
                    Log.d(TAG, "Successfully registered active TrackPlayer session token with Android Auto")
                }
                sessionBound = true
            } catch (e: Exception) {
                Log.e(TAG, "Failed setting session token", e)
            }
            return
        }

        // Retry every 500ms until TrackPlayer is initialized
        mainHandler.removeCallbacks(syncRunnable)
        mainHandler.postDelayed(syncRunnable, 500)
    }

    private val syncRunnable = Runnable {
        scheduleTokenExtraction()
    }

    private fun tryExtractSessionToken(): MediaSessionCompat.Token? {
        val binder = musicServiceBinder ?: return null
        return try {
            val musicService = binder.service

            val playerField = getFieldHierarchy(musicService.javaClass, "player") ?: return null
            playerField.isAccessible = true
            val player = playerField.get(musicService) ?: return null

            val mediaSessionField = getFieldHierarchy(player.javaClass, "mediaSession") ?: return null
            mediaSessionField.isAccessible = true
            val mediaSession = mediaSessionField.get(player) as? MediaSessionCompat
            mediaSession?.sessionToken
        } catch (e: Throwable) {
            Log.d(TAG, "MediaSession not ready yet: ${e.message}")
            null
        }
    }

    private fun getFieldHierarchy(clazz: Class<*>?, fieldName: String): Field? {
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
    ): BrowserRoot {
        Log.d(TAG, "onGetRoot called by: $clientPackageName")
        scheduleTokenExtraction()
        return BrowserRoot(MEDIA_ROOT_ID, null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>
    ) {
        Log.d(TAG, "onLoadChildren for parentId: $parentId")

        val mediaItems = ArrayList<MediaBrowserCompat.MediaItem>()

        if (parentId == MEDIA_ROOT_ID) {
            val nowPlaying = MediaDescriptionCompat.Builder()
                .setMediaId("mavrixfy_now_playing")
                .setTitle("Now Playing")
                .setSubtitle("Resume Mavrixfy playback")
                .build()
            mediaItems.add(
                MediaBrowserCompat.MediaItem(
                    nowPlaying,
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                )
            )

            val quickPicks = MediaDescriptionCompat.Builder()
                .setMediaId("mavrixfy_quick_picks")
                .setTitle("Quick Picks")
                .setSubtitle("Top music for your drive")
                .build()
            mediaItems.add(
                MediaBrowserCompat.MediaItem(
                    quickPicks,
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                )
            )

            val recent = MediaDescriptionCompat.Builder()
                .setMediaId("mavrixfy_recent")
                .setTitle("Recently Played")
                .setSubtitle("Your recent songs")
                .build()
            mediaItems.add(
                MediaBrowserCompat.MediaItem(
                    recent,
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
                )
            )
        }

        result.sendResult(mediaItems)
    }

    override fun onDestroy() {
        Log.d(TAG, "onDestroy()")
        mainHandler.removeCallbacksAndMessages(null)
        if (isBound) {
            try {
                unbindService(serviceConnection)
            } catch (e: Exception) {
                Log.e(TAG, "Error unbinding service", e)
            }
            isBound = false
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MavrixfyAutoService"
        const val MEDIA_ROOT_ID = "__MAVRIXFY_MEDIA_ROOT__"
    }
}
