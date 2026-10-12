package com.mavrixfy.playback

import androidx.media3.session.MediaSession
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.ForwardingPlayer
import android.os.Handler
import android.os.Looper
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.LibraryResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import android.os.Bundle
import android.app.PendingIntent
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.CommandButton

/** The OS service, rather than a React view, owns the native media session. */
class PlaybackService : MediaLibraryService() {
  private var session: MediaLibrarySession? = null
  private val engine get() = PlaybackEngine.get(this)
  private fun item(id: String, title: String, artist: String? = null, cover: String? = null, browsable: Boolean = false): MediaItem =
    MediaItem.Builder().setMediaId(id).setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist(artist)
      .setArtworkUri(cover?.let(Uri::parse)).setIsBrowsable(browsable).setIsPlayable(!browsable).build()).build()
  override fun onCreate() {
    super.onCreate()
    engine.attachService()
    val remotePlayer = object : ForwardingPlayer(engine.player) {
      override fun play() { engine.internalChange = false; engine.event("remote-play"); engine.player.play() }
      override fun pause() { engine.internalChange = false; engine.event("remote-pause"); engine.player.pause() }
      override fun setPlayWhenReady(ready: Boolean) { engine.internalChange = false; engine.event(if (ready) "remote-play" else "remote-pause"); engine.player.playWhenReady = ready }
      override fun stop() { engine.internalChange = false; engine.event("remote-stop"); engine.player.stop() }
      private fun select(action: () -> Unit) { val resume = engine.internalChange; engine.internalChange = false; engine.remoteSelection = true; action(); if (resume) engine.player.play(); Handler(Looper.getMainLooper()).post { engine.remoteSelection = false } }
      override fun seekToNext() { select { engine.player.seekToNext() } }
      override fun seekToPrevious() { select { engine.player.seekToPrevious() } }
      override fun seekToNextMediaItem() { select { engine.player.seekToNextMediaItem() } }
      override fun seekToPreviousMediaItem() { select { engine.player.seekToPreviousMediaItem() } }
      override fun seekTo(mediaItemIndex: Int, positionMs: Long) { select { engine.player.seekTo(mediaItemIndex, positionMs) } }
      override fun seekToDefaultPosition(mediaItemIndex: Int) { select { engine.player.seekToDefaultPosition(mediaItemIndex) } }
    }
    session = MediaLibrarySession.Builder(this, remotePlayer, object : MediaLibrarySession.Callback {
      override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
        val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
        for (action in listOf("shuffle", "repeat", "like")) commands.add(SessionCommand(action, Bundle.EMPTY))
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailableSessionCommands(commands.build()).build()
      }
      override fun onCustomCommand(session: MediaSession, controller: MediaSession.ControllerInfo, customCommand: SessionCommand, args: Bundle): ListenableFuture<SessionResult> {
        engine.event("car-action", mapOf("action" to customCommand.customAction, "id" to (engine.controls["id"] ?: "")))
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      override fun onGetLibraryRoot(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?): ListenableFuture<LibraryResult<MediaItem>> =
        Futures.immediateFuture(LibraryResult.ofItem(item("root", "Mavrixfy Music", browsable = true), params))
      override fun onGetChildren(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, parentId: String, page: Int, pageSize: Int, params: LibraryParams?): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val children = if (parentId == "root") listOf("queue" to "Queue", "favorites" to "Liked Songs", "recent" to "Recently Played").map { item(it.first, it.second, browsable = true) }
        else {
          val songs = engine.catalog.optJSONArray(parentId)
          (0 until (songs?.length() ?: 0)).map { index -> val song = songs!!.getJSONObject(index); item(song.optString("id"), song.optString("title"), song.optString("artist"), song.optString("coverUrl").takeIf { it.isNotBlank() }) }
        }
        return Futures.immediateFuture(LibraryResult.ofItemList(children.drop(page.coerceAtLeast(0) * pageSize.coerceAtLeast(1)).take(pageSize.coerceAtLeast(1)), params))
      }
      override fun onAddMediaItems(session: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>): ListenableFuture<MutableList<MediaItem>> {
        mediaItems.firstOrNull()?.let {
          val query = it.requestMetadata.searchQuery
          if (query != null) engine.event("car-search", mapOf("query" to query))
          else engine.event("car-play-media", mapOf("id" to it.mediaId))
        }
        return Futures.immediateFuture(mutableListOf())
      }
    }).build()
    // JS controls the player directly, so no MediaController bind implicitly
    // registers this session. Register it for Media3's notification/FGS lifecycle.
    session?.let { addSession(it) }
    packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
      session?.setSessionActivity(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    engine.controlsChanged = {
      val controls = engine.controls
      val buttons = listOf(
        CommandButton.Builder(if (controls["shuffled"] == true) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF).setDisplayName("Shuffle").setSessionCommand(SessionCommand("shuffle", Bundle.EMPTY)).build(),
        CommandButton.Builder(when (controls["repeat"]) { "one" -> CommandButton.ICON_REPEAT_ONE; "all" -> CommandButton.ICON_REPEAT_ALL; else -> CommandButton.ICON_REPEAT_OFF }).setDisplayName("Repeat").setSessionCommand(SessionCommand("repeat", Bundle.EMPTY)).build(),
        CommandButton.Builder(if (controls["liked"] == true) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED).setDisplayName("Like").setSessionCommand(SessionCommand("like", Bundle.EMPTY)).build())
      session?.setCustomLayout(buttons)
    }
  }
  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session
  override fun onDestroy() {
    engine.controlsChanged = null
    session?.release()
    session = null
    engine.detachService()
    super.onDestroy()
  }
}
