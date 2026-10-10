package com.mavrixfy.app

import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.audioapi.system.notification.PlaybackNotification
import org.json.JSONObject

class MavrixfyMediaLibraryModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MavrixfyMediaLibrary"
  override fun initialize() {
    super.initialize()
    PlaybackNotification.onPlayMediaIdListener = { emit("MavrixfyPlayMediaId", "id", it) }
    PlaybackNotification.onPlaySearchListener = { emit("MavrixfyPlaySearch", "query", it) }
    PlaybackNotification.onCustomPlaybackActionListener = { action ->
      if (context.hasActiveReactInstance() && PlaybackNotification.customPlaybackActions.any { it.action == action }) {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("MavrixfyPlaybackAction", Arguments.createMap().apply {
            putString("action", action.substringBefore(":"))
            putString("id", action.substringAfter(":"))
          })
      }
    }
    PlaybackNotification.onSkipQueueItemListener = { index ->
      val queue = MavrixfyMediaBrowserService.catalog.optJSONArray("queue")
      val song = if (queue != null && index >= 0 && index < queue.length().toLong()) queue.optJSONObject(index.toInt()) else null
      if (song != null) emit("MavrixfyPlayMediaId", "id", song.optString("id"))
    }
  }
  private fun emit(event: String, key: String, value: String) {
    if (!context.hasActiveReactInstance()) return
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, Arguments.createMap().apply { putString(key, value) })
  }
  @ReactMethod fun addListener(event: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
  @ReactMethod fun updateControls(activeId: String, shuffled: Boolean, repeat: String, liked: Boolean) {
    context.runOnUiQueueThread {
      fun action(name: String, label: String, icon: Int) = PlaybackStateCompat.CustomAction.Builder("$name:$activeId", label, icon).build()
      PlaybackNotification.customPlaybackActions = if (activeId.isEmpty()) emptyList() else listOf(
        action("shuffle", if (shuffled) "Turn shuffle off" else "Turn shuffle on", if (shuffled) R.drawable.auto_shuffle_on else R.drawable.auto_shuffle),
        action("repeat", when (repeat) { "all" -> "Repeat one"; "one" -> "Turn repeat off"; else -> "Repeat all" }, when (repeat) { "all" -> R.drawable.auto_repeat_on; "one" -> R.drawable.auto_repeat_one; else -> R.drawable.auto_repeat }),
        action("like", if (liked) "Remove from Liked Songs" else "Add to Liked Songs", if (liked) R.drawable.auto_liked else R.drawable.auto_like)
      )
      val session = MavrixfyMediaBrowserService.session(context)
      session.setShuffleMode(if (shuffled) PlaybackStateCompat.SHUFFLE_MODE_ALL else PlaybackStateCompat.SHUFFLE_MODE_NONE)
      session.setRepeatMode(when (repeat) { "all" -> PlaybackStateCompat.REPEAT_MODE_ALL; "one" -> PlaybackStateCompat.REPEAT_MODE_ONE; else -> PlaybackStateCompat.REPEAT_MODE_NONE })
      PlaybackNotification.refreshPlaybackActions?.invoke()
    }
  }
  @ReactMethod fun updateCatalog(json: String, activeId: String) {
    val catalog = JSONObject(json)
    context.runOnUiQueueThread {
      MavrixfyMediaBrowserService.updateCatalog(catalog)
      val queue = catalog.optJSONArray("queue")
      val items = mutableListOf<MediaSessionCompat.QueueItem>()
      var activeIndex = -1L
      if (queue != null) for (index in 0 until queue.length()) {
        val song = queue.getJSONObject(index)
        items.add(MediaSessionCompat.QueueItem(MavrixfyMediaBrowserService.description(song), index.toLong()))
        if (song.optString("id") == activeId) activeIndex = index.toLong()
      }
      val session = MavrixfyMediaBrowserService.session(context)
      session.setQueue(items)
      session.setQueueTitle("Queue")
      PlaybackNotification.activeQueueItemId = activeIndex
      PlaybackNotification.refreshPlaybackActions?.invoke()
    }
  }
  @ReactMethod fun reportError(message: String) {
    context.runOnUiQueueThread {
      MavrixfyMediaBrowserService.session(context).setPlaybackState(android.support.v4.media.session.PlaybackStateCompat.Builder()
        .setState(android.support.v4.media.session.PlaybackStateCompat.STATE_ERROR, 0, 0f)
        .setErrorMessage(android.support.v4.media.session.PlaybackStateCompat.ERROR_CODE_APP_ERROR, message).build())
    }
  }
  override fun invalidate() {
    PlaybackNotification.onPlayMediaIdListener = null
    PlaybackNotification.onPlaySearchListener = null
    PlaybackNotification.onSkipQueueItemListener = null
    PlaybackNotification.onCustomPlaybackActionListener = null
    PlaybackNotification.customPlaybackActions = emptyList()
    PlaybackNotification.refreshPlaybackActions?.invoke()
    MavrixfyMediaBrowserService.updateCatalog(JSONObject())
    super.invalidate()
  }
}
