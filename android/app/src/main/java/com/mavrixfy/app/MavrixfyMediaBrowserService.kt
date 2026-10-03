package com.mavrixfy.app

import android.app.PendingIntent
import android.content.Context
import android.os.Bundle
import android.net.Uri
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media.MediaBrowserServiceCompat
import androidx.media.MediaSessionManager
import com.swmansion.audioapi.system.AudioEvent
import com.swmansion.audioapi.system.notification.PlaybackNotification
import com.swmansion.audioapi.system.notification.PlaybackNotificationReceiver
import org.json.JSONArray
import org.json.JSONObject

class MavrixfyMediaBrowserService : MediaBrowserServiceCompat() {
  companion object {
    const val ROOT = "mavrixfy_root"
    private var instance: MavrixfyMediaBrowserService? = null
    var catalog = JSONObject()
      private set

    fun updateCatalog(value: JSONObject) {
      catalog = value
      instance?.let { service ->
        service.notifyChildrenChanged(ROOT)
        listOf("queue", "favorites", "recent").forEach { service.notifyChildrenChanged(it) }
      }
    }

    fun description(song: JSONObject): MediaDescriptionCompat = MediaDescriptionCompat.Builder()
      .setMediaId(song.optString("id"))
      .setTitle(song.optString("title"))
      .setSubtitle(song.optString("artist"))
      .setIconUri(song.optString("coverUrl").takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
      .build()

    fun session(context: Context): MediaSessionCompat {
      PlaybackNotification.sharedMediaSession?.let { return it }
      val session = MediaSessionCompat(context, "MavrixfyMediaSession")
      PlaybackNotification.sharedMediaSession = session
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) session.setSessionActivity(PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE))
      session.setCallback(object : MediaSessionCompat.Callback() {
        private fun dispatch(event: AudioEvent, body: Map<String, Any> = emptyMap()) {
          val module = PlaybackNotificationReceiver.getAudioAPIModule()
          if (module != null) module.invokeHandlerWithEventNameAndEventBody(event.ordinal, body)
          else session.setPlaybackState(PlaybackStateCompat.Builder()
            .setState(PlaybackStateCompat.STATE_ERROR, 0, 0f)
            .setErrorMessage(PlaybackStateCompat.ERROR_CODE_APP_ERROR, "Open Mavrixfy on your phone to start playback.").build())
        }
        override fun onPlay() = dispatch(AudioEvent.PLAYBACK_NOTIFICATION_PLAY)
        override fun onPause() = dispatch(AudioEvent.PLAYBACK_NOTIFICATION_PAUSE)
        override fun onStop() = dispatch(AudioEvent.PLAYBACK_NOTIFICATION_STOP)
        override fun onSkipToNext() = dispatch(AudioEvent.PLAYBACK_NOTIFICATION_NEXT_TRACK)
        override fun onSkipToPrevious() = dispatch(AudioEvent.PLAYBACK_NOTIFICATION_PREVIOUS_TRACK)
        override fun onSeekTo(pos: Long) = dispatch(AudioEvent.PLAYBACK_NOTIFICATION_SEEK_TO, mapOf("value" to pos / 1000.0))
        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) { PlaybackNotification.onPlayMediaIdListener?.invoke(mediaId.orEmpty()) }
        override fun onPlayFromSearch(query: String?, extras: Bundle?) { PlaybackNotification.onPlaySearchListener?.invoke(query.orEmpty()) }
        override fun onSkipToQueueItem(id: Long) { PlaybackNotification.onSkipQueueItemListener?.invoke(id) }
        override fun onCustomAction(action: String?, extras: Bundle?) { if (action != null) PlaybackNotification.onCustomPlaybackActionListener?.invoke(action) }
      })
      session.setPlaybackState(PlaybackStateCompat.Builder()
        .setActions(PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH)
        .setState(PlaybackStateCompat.STATE_NONE, 0, 0f).build())
      session.isActive = true
      return session
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    // The browser and notification keep the same session token for their entire lifetime.
    setSessionToken(session(this).sessionToken)
  }

  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot? {
    val client = MediaSessionManager.RemoteUserInfo(clientPackageName, -1, clientUid)
    if (clientPackageName != packageName && !MediaSessionManager.getSessionManager(this).isTrustedForMediaControl(client)) return null
    val extras = Bundle().apply {
      putBoolean("android.media.browse.SEARCH_SUPPORTED", true)
      putInt("android.media.browse.CONTENT_STYLE_BROWSABLE_HINT", 1)
      putInt("android.media.browse.CONTENT_STYLE_PLAYABLE_HINT", 1)
    }
    return BrowserRoot(ROOT, extras)
  }

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaBrowserCompat.MediaItem>>) {
    val items = mutableListOf<MediaBrowserCompat.MediaItem>()
    if (parentId == ROOT) {
      listOf("queue" to "Queue", "favorites" to "Liked Songs", "recent" to "Recently Played").forEach { (id, title) ->
        if ((catalog.optJSONArray(id)?.length() ?: 0) > 0) {
          items.add(MediaBrowserCompat.MediaItem(MediaDescriptionCompat.Builder().setMediaId(id).setTitle(title).build(), MediaBrowserCompat.MediaItem.FLAG_BROWSABLE))
        }
      }
    } else {
      val songs = catalog.optJSONArray(parentId) ?: JSONArray()
      for (index in 0 until songs.length()) items.add(MediaBrowserCompat.MediaItem(description(songs.getJSONObject(index)), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE))
    }
    result.sendResult(items)
  }

  override fun onSearch(query: String, extras: Bundle?, result: Result<MutableList<MediaBrowserCompat.MediaItem>>) {
    val items = mutableListOf<MediaBrowserCompat.MediaItem>()
    val seen = mutableSetOf<String>()
    listOf("queue", "favorites", "recent").forEach { category ->
      val songs = catalog.optJSONArray(category) ?: JSONArray()
      for (index in 0 until songs.length()) {
        val song = songs.getJSONObject(index)
        if ((song.optString("title") + " " + song.optString("artist")).contains(query, ignoreCase = true) && seen.add(song.optString("id"))) {
          items.add(MediaBrowserCompat.MediaItem(description(song), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE))
        }
      }
    }
    result.sendResult(items)
  }

  override fun onDestroy() {
    instance = null
    // PlaybackNotification owns the shared session; disconnecting a browser must not release it.
    super.onDestroy()
  }
}
