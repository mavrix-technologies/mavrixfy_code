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
import com.google.common.util.concurrent.SettableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.UUID
import android.os.Bundle
import android.app.PendingIntent
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionError
import androidx.media3.session.CommandButton

/** The OS service, rather than a React view, owns the native media session. */
class PlaybackService : MediaLibraryService() {
  private var session: MediaLibrarySession? = null
  private val handler = Handler(Looper.getMainLooper())
  private var pendingResolution: SettableFuture<MediaSession.MediaItemsWithStartPosition>? = null
  private var pendingId: String? = null
  private var nativeResolution: Future<*>? = null
  private val libraryExecutor = Executors.newFixedThreadPool(2)
  private val resolutionTimeout = Runnable { failResolution("Music is taking too long to load. Check your connection and try again.", true) }
  private fun failResolution(message: String, report: Boolean = false) {
    handler.removeCallbacks(resolutionTimeout)
    nativeResolution?.cancel(true)
    nativeResolution = null
    val future = pendingResolution
    pendingResolution = null
    pendingId = null
    if (future != null && report) session?.sendError(SessionError(SessionError.ERROR_IO, message))
    future?.setException(IllegalStateException(message))
  }
  private val engine by lazy(LazyThreadSafetyMode.NONE) { PlaybackEngine.get(this) }
  private fun item(id: String, title: String, artist: String? = null, cover: String? = null, browsable: Boolean = false): MediaItem =
    MediaItem.Builder().setMediaId(id).setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist(artist)
      .setMediaType(if (browsable) MediaMetadata.MEDIA_TYPE_FOLDER_MIXED else MediaMetadata.MEDIA_TYPE_MUSIC)
      .setArtworkUri(cover?.takeIf(String::isNotBlank)?.let(Uri::parse)).setIsBrowsable(browsable).setIsPlayable(!browsable).build()).build()
  private fun songItem(song: org.json.JSONObject) = item(song.optString("id"), song.optString("title"), song.optString("artist"), song.optString("coverUrl", song.optString("artwork")))
  private fun folder(id: String): MediaItem? = when {
    id == "root" -> item(id, "Mavrixfy Music", browsable = true)
    id == "browse" -> item(id, "Browse Music", browsable = true)
    id == "queue" -> item(id, "Queue", browsable = true)
    id == "favorites" -> item(id, "Liked Songs", browsable = true)
    id == "recent" -> item(id, "Recently Played", browsable = true)
    id.startsWith("browse:") -> CarMediaRepository.categories[id.removePrefix("browse:")]?.let { item(id, it, browsable = true) }
    else -> null
  }
  private fun <T : Any> libraryRequest(params: LibraryParams?, load: () -> LibraryResult<T>): ListenableFuture<LibraryResult<T>> {
    val future = SettableFuture.create<LibraryResult<T>>()
    var job: Future<*>? = null
    val timeout = Runnable {
      future.set(LibraryResult.ofError<T>(SessionError(SessionError.ERROR_IO, "Music is taking too long to load. Check your connection and try again.")))
      job?.cancel(true)
    }
    handler.postDelayed(timeout, 8000)
    job = libraryExecutor.submit {
      try { if (!future.isDone) future.set(load()) }
      catch (error: Exception) {
        val message = if (error is IllegalArgumentException) error.message ?: "This music item is unavailable." else "Music could not load. Check your connection and try again."
        future.set(LibraryResult.ofError<T>(SessionError(SessionError.ERROR_IO, message)))
      }
    }
    // Cancelling the worker from its own successful completion interrupts
    // Media3's direct Future listener and makes a valid folder look unavailable.
    future.addListener({ handler.removeCallbacks(timeout); if (future.isCancelled) job?.cancel(true) }, MoreExecutors.directExecutor())
    return future
  }
  private fun page(items: List<MediaItem>, page: Int, pageSize: Int): List<MediaItem> {
    require(page >= 0 && pageSize > 0) { "Invalid music page." }
    return items.drop((page.toLong() * pageSize).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()).take(pageSize.coerceAtMost(100))
  }
  override fun onCreate() {
    super.onCreate()
    engine.attachService()
    engine.cancelCarResolution = { failResolution("Song selection cancelled") }
    engine.carResolutionComplete = { args ->
      if (args["requestId"] == pendingId && pendingResolution != null) {
        val expectedId = args["mediaId"] as? String
        val player = engine.player
        if (args["error"] != null || player.mediaItemCount == 0 || player.currentMediaItem?.mediaId != expectedId || player.playerError != null) {
          failResolution("Selected song could not be resolved")
        } else {
          val result = MediaSession.MediaItemsWithStartPosition(
            (0 until player.mediaItemCount).map(player::getMediaItemAt), player.currentMediaItemIndex, player.currentPosition)
          val future = pendingResolution
          pendingResolution = null
          pendingId = null
          nativeResolution = null
          handler.removeCallbacks(resolutionTimeout)
          future?.set(result)
        }
      }
    }
    val remotePlayer = object : ForwardingPlayer(engine.player) {
      override fun play() { engine.internalChange = false; engine.event("remote-play"); engine.player.play() }
      override fun pause() { engine.cancelCarResolution?.invoke(); engine.internalChange = false; engine.event("remote-pause"); engine.player.pause() }
      override fun setPlayWhenReady(ready: Boolean) { if (!ready) engine.cancelCarResolution?.invoke(); engine.internalChange = false; engine.event(if (ready) "remote-play" else "remote-pause"); engine.player.playWhenReady = ready }
      override fun stop() { engine.cancelCarResolution?.invoke(); engine.internalChange = false; engine.event("remote-stop"); engine.player.stop() }
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
        for (action in listOf("shuffle", "repeat") + if (engine.carClientReady) listOf("like") else emptyList()) commands.add(SessionCommand(action, Bundle.EMPTY))
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailableSessionCommands(commands.build()).build()
      }
      override fun onCustomCommand(session: MediaSession, controller: MediaSession.ControllerInfo, customCommand: SessionCommand, args: Bundle): ListenableFuture<SessionResult> {
        if (engine.carClientReady) engine.event("car-action", mapOf("action" to customCommand.customAction, "id" to (engine.controls["id"] ?: "")))
        else when (customCommand.customAction) {
          "shuffle" -> { engine.player.shuffleModeEnabled = !engine.player.shuffleModeEnabled; engine.controls = engine.controls + ("shuffled" to engine.player.shuffleModeEnabled) }
          "repeat" -> {
            engine.player.repeatMode = when (engine.player.repeatMode) { androidx.media3.common.Player.REPEAT_MODE_OFF -> androidx.media3.common.Player.REPEAT_MODE_ALL; androidx.media3.common.Player.REPEAT_MODE_ALL -> androidx.media3.common.Player.REPEAT_MODE_ONE; else -> androidx.media3.common.Player.REPEAT_MODE_OFF }
            engine.controls = engine.controls + ("repeat" to when (engine.player.repeatMode) { androidx.media3.common.Player.REPEAT_MODE_ONE -> "one"; androidx.media3.common.Player.REPEAT_MODE_ALL -> "all"; else -> "off" })
          }
          else -> return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
        }
        engine.controlsChanged?.invoke()
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      override fun onGetLibraryRoot(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?): ListenableFuture<LibraryResult<MediaItem>> {
        val extras = Bundle().apply { putBoolean("android.media.browse.SEARCH_SUPPORTED", true) }
        return Futures.immediateFuture(LibraryResult.ofItem(folder("root")!!, LibraryParams.Builder().setExtras(extras).build()))
      }
      override fun onGetItem(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, mediaId: String): ListenableFuture<LibraryResult<MediaItem>> {
        val found = folder(mediaId) ?: engine.carLibrary.find(mediaId)?.let(::songItem)
        return Futures.immediateFuture(if (found != null) LibraryResult.ofItem(found, null) else LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
      }
      override fun onGetChildren(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, parentId: String, page: Int, pageSize: Int, params: LibraryParams?): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        return libraryRequest(params) {
          val children = when {
            parentId == "root" -> listOf(folder("browse")!!) + listOf("queue", "favorites", "recent").filter { engine.carLibrary.group(it).isNotEmpty() }.mapNotNull(::folder)
            parentId == "browse" -> CarMediaRepository.categories.keys.mapNotNull { folder("browse:$it") }
            parentId.startsWith("browse:") -> engine.carLibrary.category(parentId.removePrefix("browse:")).map(::songItem)
            parentId in listOf("queue", "favorites", "recent") -> engine.carLibrary.group(parentId).map(::songItem)
            else -> throw IllegalArgumentException("This music folder is unavailable.")
          }
          LibraryResult.ofItemList(this@PlaybackService.page(children, page, pageSize), params)
        }
      }
      override fun onSearch(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, params: LibraryParams?): ListenableFuture<LibraryResult<Void>> = libraryRequest(params) {
        val count = engine.carLibrary.search(query).size
        handler.post { if (this@PlaybackService.session === session) session.notifySearchResultChanged(browser, query, count, params) }
        LibraryResult.ofVoid(params)
      }
      override fun onGetSearchResult(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, page: Int, pageSize: Int, params: LibraryParams?): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = libraryRequest(params) {
        LibraryResult.ofItemList(this@PlaybackService.page(engine.carLibrary.search(query).map(::songItem), page, pageSize), params)
      }
      override fun onPlaybackResumption(session: MediaSession, controller: MediaSession.ControllerInfo): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
        val request = MediaItem.Builder().setRequestMetadata(MediaItem.RequestMetadata.Builder().setSearchQuery("").build()).build()
        return onSetMediaItems(session, controller, mutableListOf(request), 0, engine.carLibrary.resumePosition())
      }
      override fun onSetMediaItems(session: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
        failResolution("Song selection superseded")
        val requested = mediaItems.getOrNull(startIndex.coerceAtLeast(0))
          ?: return Futures.immediateFailedFuture(IllegalArgumentException("Empty song selection"))
        val id = UUID.randomUUID().toString()
        val future = SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
        pendingId = id
        pendingResolution = future
        handler.postDelayed(resolutionTimeout, 8500)
        val query = requested.requestMetadata.searchQuery
        if (engine.carClientReady) {
          if (query != null) engine.event("car-search", mapOf("query" to query, "requestId" to id))
          else engine.event("car-play-media", mapOf("id" to requested.mediaId, "requestId" to id))
        } else {
          val revision = engine.carLibrary.revision
          nativeResolution = libraryExecutor.submit {
            try {
              val selected = if (query != null && query.isNotBlank()) engine.carLibrary.search(query).firstOrNull()
                else if (query != null) engine.carLibrary.resumeItem() ?: engine.carLibrary.category("hindi").firstOrNull()
                else engine.carLibrary.find(requested.mediaId)
              val selection = engine.carLibrary.selection(selected ?: throw IllegalArgumentException("No songs found. Try another search."))
              handler.post {
                if (pendingId != id || engine.carLibrary.revision != revision) return@post
                engine.command("setQueue", mapOf("tracks" to selection.tracks, "index" to selection.index, "position" to startPositionMs.coerceAtLeast(0) / 1000.0))
                engine.carResolutionComplete?.invoke(mapOf("requestId" to id, "mediaId" to selection.tracks[selection.index]["id"]))
              }
            } catch (error: Exception) {
              val message = if (error is CarMediaException || error is IllegalArgumentException) error.message ?: "This song is unavailable." else "Could not load this song. Check your connection and try again."
              handler.post { if (pendingId == id) failResolution(message, true) }
            }
          }
        }
        // Media3 applies the resolved queue only after the shared controller
        // has completed selection. An empty immediate result clears that queue.
        return future
      }
    }).build()
    // JS controls the player directly, so no MediaController bind implicitly
    // registers this session. Register it for Media3's notification/FGS lifecycle.
    session?.let { addSession(it) }
    engine.catalogChanged = {
      session?.let { current ->
        current.notifyChildrenChanged("root", 1 + listOf("queue", "favorites", "recent").count { engine.carLibrary.group(it).isNotEmpty() }, null)
        for (group in listOf("queue", "favorites", "recent")) current.notifyChildrenChanged(group, engine.carLibrary.group(group).size, null)
      }
    }
    packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
      session?.setSessionActivity(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    engine.controlsChanged = {
      val controls = engine.controls
      val buttons = listOf(
        CommandButton.Builder(if (controls["shuffled"] == true) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF).setDisplayName("Shuffle").setSessionCommand(SessionCommand("shuffle", Bundle.EMPTY)).build(),
        CommandButton.Builder(when (controls["repeat"]) { "one" -> CommandButton.ICON_REPEAT_ONE; "all" -> CommandButton.ICON_REPEAT_ALL; else -> CommandButton.ICON_REPEAT_OFF }).setDisplayName("Repeat").setSessionCommand(SessionCommand("repeat", Bundle.EMPTY)).build()) +
        if (engine.carClientReady) listOf(CommandButton.Builder(if (controls["liked"] == true) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED).setDisplayName("Like").setSessionCommand(SessionCommand("like", Bundle.EMPTY)).build()) else emptyList()
      session?.setCustomLayout(buttons)
    }
    engine.controlsChanged?.invoke()
  }
  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session
  override fun onDestroy() {
    engine.carLibrary.rememberPosition(engine.player.currentMediaItem?.mediaId, engine.player.currentPosition)
    failResolution("Playback service stopped")
    engine.carResolutionComplete = null
    engine.cancelCarResolution = null
    engine.controlsChanged = null
    engine.catalogChanged = null
    libraryExecutor.shutdownNow()
    session?.release()
    session = null
    engine.detachService()
    super.onDestroy()
  }
}
