package com.mavrixfy.app.auto

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule

class AutoMediaModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        instance = this
        lastReactContext = reactContext
        mainHandler.postDelayed({ flushQueuedCommands(reactContext) }, COMMAND_FLUSH_DELAY_MS)
    }

    override fun getName(): String = "MavrixfyAutoMedia"

    @ReactMethod
    fun syncPlayback(
        songId: String?,
        title: String?,
        artist: String?,
        album: String?,
        artUrl: String?,
        durationMs: Double,
        positionMs: Double,
        isPlaying: Boolean
    ) {
        val service = MavrixfyAutoService.instance
        if (service != null) {
            service.syncPlaybackDirect(songId, title, artist, album, artUrl, durationMs, positionMs, isPlaying)
        } else {
            try {
                val intent = Intent(reactContext, MavrixfyAutoService::class.java).apply {
                    action = MavrixfyAutoService.ACTION_SYNC_PHONE_PLAYBACK
                    putExtra(MavrixfyAutoService.EXTRA_SONG_ID, songId.orEmpty())
                    putExtra(MavrixfyAutoService.EXTRA_TITLE, title.orEmpty())
                    putExtra(MavrixfyAutoService.EXTRA_ARTIST, artist.orEmpty())
                    putExtra(MavrixfyAutoService.EXTRA_ALBUM, album.orEmpty())
                    putExtra(MavrixfyAutoService.EXTRA_ART_URL, artUrl.orEmpty())
                    putExtra(MavrixfyAutoService.EXTRA_DURATION_MS, durationMs.toLong())
                    putExtra(MavrixfyAutoService.EXTRA_POSITION_MS, positionMs.toLong())
                    putExtra(MavrixfyAutoService.EXTRA_IS_PLAYING, isPlaying)
                }
                reactContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service for syncPlayback", e)
            }
        }
    }

    @ReactMethod
    fun clearPlayback() {
        val service = MavrixfyAutoService.instance
        if (service != null) {
            service.clearPlaybackDirect()
        } else {
            try {
                val intent = Intent(reactContext, MavrixfyAutoService::class.java).apply {
                    action = MavrixfyAutoService.ACTION_CLEAR_PHONE_PLAYBACK
                }
                reactContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service for clearPlayback", e)
            }
        }
    }

    @ReactMethod
    fun syncQueue(songs: ReadableArray, activeIndex: Double) {
        val queueSongs = ArrayList<Bundle>()
        for (index in 0 until songs.size()) {
            val song = songs.getMap(index) ?: continue
            val id = song.getString("id").orEmpty()
            val title = song.getString("title").orEmpty()
            val audioUrl = song.getString("audioUrl").orEmpty()
            if (id.isBlank() || title.isBlank() || audioUrl.isBlank()) continue

            val bundle = Bundle().apply {
                putString("id", id)
                putString("title", title)
                putString("artist", song.getString("artist").orEmpty())
                putString("album", song.getString("album").orEmpty())
                putString("coverUrl", song.getString("coverUrl").orEmpty())
                putString("audioUrl", audioUrl)
                putDouble("duration", if (song.hasKey("duration")) song.getDouble("duration") else 0.0)
            }
            queueSongs.add(bundle)
        }

        val service = MavrixfyAutoService.instance
        if (service != null) {
            service.syncQueueDirect(queueSongs, activeIndex.toInt())
        } else {
            try {
                val intent = Intent(reactContext, MavrixfyAutoService::class.java).apply {
                    action = MavrixfyAutoService.ACTION_SYNC_PHONE_QUEUE
                    putParcelableArrayListExtra(MavrixfyAutoService.EXTRA_QUEUE_SONGS, queueSongs)
                    putExtra(MavrixfyAutoService.EXTRA_QUEUE_INDEX, activeIndex.toInt())
                }
                reactContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service for syncQueue", e)
            }
        }
    }

    @ReactMethod
    fun syncLikedSongs(songs: ReadableArray) {
        val likedSongs = ArrayList<Bundle>()
        for (index in 0 until songs.size()) {
            val song = songs.getMap(index) ?: continue
            val bundle = Bundle().apply {
                putString("id", song.getString("id").orEmpty())
                putString("title", song.getString("title").orEmpty())
                putString("artist", song.getString("artist").orEmpty())
                putString("album", song.getString("album").orEmpty())
                putString("coverUrl", song.getString("coverUrl").orEmpty())
                putString("audioUrl", song.getString("audioUrl").orEmpty())
                putDouble("duration", if (song.hasKey("duration")) song.getDouble("duration") else 0.0)
            }
            likedSongs.add(bundle)
        }

        val service = MavrixfyAutoService.instance
        if (service != null) {
            service.syncLikedSongsDirect(likedSongs)
        } else {
            try {
                val intent = Intent(reactContext, MavrixfyAutoService::class.java).apply {
                    action = MavrixfyAutoService.ACTION_SYNC_LIKED_SONGS
                    putParcelableArrayListExtra(MavrixfyAutoService.EXTRA_LIKED_SONGS, likedSongs)
                }
                reactContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service for syncLikedSongs", e)
            }
        }
    }

    companion object {
        private const val REMOTE_COMMAND_EVENT = "MavrixfyAutoRemoteCommand"
        private const val TAG = "MavrixfyAutoMedia"
        private const val COMMAND_FLUSH_DELAY_MS = 500L
        private var instance: AutoMediaModule? = null
        private var lastReactContext: ReactContext? = null
        private val mainHandler = Handler(Looper.getMainLooper())
        private val pendingCommands = ArrayList<PendingCommand>()
        private var isCreatingReactContext = false

        private data class PendingCommand(
            val command: String,
            val positionMs: Long?,
            val queueIndex: Int?,
            val song: Bundle?,
            val queue: List<Bundle>?
        )

        fun emitRemoteCommand(
            command: String,
            positionMs: Long? = null,
            queueIndex: Int? = null,
            song: Bundle? = null,
            queue: List<Bundle>? = null
        ) {
            val context = instance?.reactContext ?: lastReactContext
            if (context == null) {
                queueCommand(command, positionMs, queueIndex, song, queue)
                return
            }
            emitToReactContext(context, command, positionMs, queueIndex, song, queue)
        }

        fun emitRemoteCommand(
            context: Context,
            command: String,
            positionMs: Long? = null,
            queueIndex: Int? = null,
            song: Bundle? = null,
            queue: List<Bundle>? = null
        ) {
            val reactContext = instance?.reactContext ?: lastReactContext
            if (reactContext == null) {
                queueCommand(command, positionMs, queueIndex, song, queue)
                ensureReactRuntime(context)
                return
            }
            emitToReactContext(reactContext, command, positionMs, queueIndex, song, queue)
        }

        fun warmReactRuntime(context: Context) {
            if (instance?.reactContext != null || lastReactContext != null) return
            ensureReactRuntime(context)
        }

        private fun queueCommand(
            command: String,
            positionMs: Long?,
            queueIndex: Int?,
            song: Bundle?,
            queue: List<Bundle>?
        ) {
            synchronized(pendingCommands) {
                pendingCommands.add(PendingCommand(command, positionMs, queueIndex, song, queue))
                while (pendingCommands.size > 20) {
                    pendingCommands.removeAt(0)
                }
            }
        }

        private fun flushQueuedCommands(context: ReactContext) {
            val commands = synchronized(pendingCommands) {
                if (pendingCommands.isEmpty()) return
                pendingCommands.toList().also { pendingCommands.clear() }
            }
            commands.forEach { pending ->
                emitToReactContext(
                    context = context,
                    command = pending.command,
                    positionMs = pending.positionMs,
                    queueIndex = pending.queueIndex,
                    song = pending.song,
                    queue = pending.queue
                )
            }
        }

        private fun ensureReactRuntime(context: Context) {
            val application = context.applicationContext as? ReactApplication ?: return
            val reactInstanceManager = application.reactNativeHost.reactInstanceManager
            val currentContext = reactInstanceManager.currentReactContext
            if (currentContext != null) {
                lastReactContext = currentContext
                mainHandler.postDelayed({ flushQueuedCommands(currentContext) }, COMMAND_FLUSH_DELAY_MS)
                return
            }

            synchronized(this) {
                if (isCreatingReactContext) return
                isCreatingReactContext = true
            }

            val listener = object : ReactInstanceManager.ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                    reactInstanceManager.removeReactInstanceEventListener(this)
                    lastReactContext = context
                    synchronized(this@Companion) {
                        isCreatingReactContext = false
                    }
                    mainHandler.postDelayed({ flushQueuedCommands(context) }, COMMAND_FLUSH_DELAY_MS)
                }
            }

            reactInstanceManager.addReactInstanceEventListener(listener)
            mainHandler.post {
                try {
                    reactInstanceManager.createReactContextInBackground()
                } catch (error: Exception) {
                    Log.w(TAG, "Failed to create React context for Android Auto", error)
                    synchronized(this@Companion) {
                        isCreatingReactContext = false
                    }
                }
            }
        }

        private fun emitToReactContext(
            context: ReactContext,
            command: String,
            positionMs: Long?,
            queueIndex: Int?,
            song: Bundle?,
            queue: List<Bundle>?
        ) {
            val params = Arguments.createMap().apply {
                putString("command", command)
                positionMs?.let { putDouble("positionMs", it.toDouble()) }
                queueIndex?.let { putDouble("queueIndex", it.toDouble()) }
                song?.let { putMap("song", Arguments.fromBundle(it)) }
                queue?.let { items ->
                    val array = Arguments.createArray()
                    items.forEach { array.pushMap(Arguments.fromBundle(it)) }
                    putArray("queue", array)
                }
            }
            mainHandler.post {
                try {
                    context
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(REMOTE_COMMAND_EVENT, params)
                } catch (error: Exception) {
                    Log.w(TAG, "Failed to emit Android Auto command: $command", error)
                    queueCommand(command, positionMs, queueIndex, song, queue)
                }
            }
        }
    }
}
