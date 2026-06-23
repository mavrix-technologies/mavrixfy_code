package com.mavrixfy.app.auto

import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.text.Html
import android.view.KeyEvent
import androidx.media.MediaBrowserServiceCompat
import java.lang.ref.WeakReference
import org.json.JSONArray
import org.json.JSONObject

class MavrixfyAutoService : MediaBrowserServiceCompat() {
  private lateinit var mediaSession: MediaSessionCompat
  private var browseState: AutoBrowseState = AutoBrowseState.empty()

  override fun onCreate() {
    super.onCreate()
    mediaSession = MediaSessionCompat(this, SESSION_TAG).apply {
      setCallback(mediaSessionCallback)
      setPlaybackState(buildPlaybackState(PlaybackStateCompat.STATE_PAUSED))
      isActive = true
    }
    sessionToken = mediaSession.sessionToken
    activeService = WeakReference(this)
    reloadBrowseState()
  }

  override fun onDestroy() {
    if (activeService?.get() === this) {
      activeService = null
    }
    mediaSession.release()
    super.onDestroy()
  }

  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): BrowserRoot {
    return BrowserRoot(ROOT_ID, contentStyleExtras())
  }

  override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    reloadBrowseState()

    val items = when (parentId) {
      ROOT_ID -> rootItems()
      SECTION_QUEUE -> songItems(browseState.queue, "queue")
      SECTION_QUICK -> songItems(browseState.quickPicks.ifEmpty { browseState.queue }, "quick")
      SECTION_LIKED -> songItems(browseState.likedSongs, "liked")
      SECTION_RECENT -> songItems(browseState.recentSongs.ifEmpty { browseState.queue }, "recent")
      else -> mutableListOf()
    }
    result.sendResult(items)
  }

  private val mediaSessionCallback = object : MediaSessionCompat.Callback() {
    override fun onPlay() {
      publishState(PlaybackStateCompat.STATE_PLAYING)
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY)
    }

    override fun onPause() {
      publishState(PlaybackStateCompat.STATE_PAUSED)
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_PAUSE)
    }

    override fun onStop() {
      publishState(PlaybackStateCompat.STATE_STOPPED)
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_STOP)
    }

    override fun onSkipToNext() {
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_NEXT)
    }

    override fun onSkipToPrevious() {
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS)
    }

    override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
      if (mediaId == null) return

      if (mediaId == RESUME_ID || mediaId == NOW_PLAYING_ID) {
        onPlay()
        return
      }

      if (mediaId.startsWith(PLAY_PREFIX)) {
        publishState(PlaybackStateCompat.STATE_PLAYING)
        if (!MavrixfyAutoMediaModule.emitPlayRequest(mediaId)) {
          playFromQueueIndex(mediaId)
        }
      }
    }
  }

  private fun rootItems(): MutableList<MediaBrowserCompat.MediaItem> {
    val items = mutableListOf<MediaBrowserCompat.MediaItem>()
    val currentSong = browseState.currentSong

    items.add(
      playableItem(
        id = NOW_PLAYING_ID,
        title = currentSong?.title ?: "Resume playback",
        subtitle = currentSong?.artist ?: "Mavrixfy",
        artwork = currentSong?.artwork
      )
    )

    items.add(sectionItem(SECTION_QUEUE, "Current queue", queueSubtitle(browseState.queue)))

    if (browseState.quickPicks.isNotEmpty()) {
      items.add(sectionItem(SECTION_QUICK, "Quick picks", queueSubtitle(browseState.quickPicks)))
    }
    if (browseState.recentSongs.isNotEmpty()) {
      items.add(sectionItem(SECTION_RECENT, "Recently played", queueSubtitle(browseState.recentSongs)))
    }
    if (browseState.likedSongs.isNotEmpty()) {
      items.add(sectionItem(SECTION_LIKED, "Liked songs", queueSubtitle(browseState.likedSongs)))
    }

    items.add(playableItem(RESUME_ID, "Play / Pause", "Use current Mavrixfy session", currentSong?.artwork))
    return items
  }

  private fun songItems(songs: List<AutoSong>, section: String): MutableList<MediaBrowserCompat.MediaItem> {
    return songs.mapIndexed { index, song ->
      playableItem(
        id = "$PLAY_PREFIX|$section|$index|${song.id}",
        title = song.title,
        subtitle = song.subtitle,
        artwork = song.artwork
      )
    }.toMutableList()
  }

  private fun sectionItem(id: String, title: String, subtitle: String): MediaBrowserCompat.MediaItem {
    val description = MediaDescriptionCompat.Builder()
      .setMediaId(id)
      .setTitle(title)
      .setSubtitle(subtitle)
      .setExtras(sectionExtras())
      .build()

    return MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
  }

  private fun playableItem(
    id: String,
    title: String,
    subtitle: String,
    artwork: String?
  ): MediaBrowserCompat.MediaItem {
    val builder = MediaDescriptionCompat.Builder()
      .setMediaId(id)
      .setTitle(title)
      .setSubtitle(subtitle)
      .setExtras(playableExtras())

    artwork?.takeIf { it.isNotBlank() }?.let {
      builder.setIconUri(Uri.parse(it))
    }

    return MediaBrowserCompat.MediaItem(builder.build(), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
  }

  private fun queueSubtitle(songs: List<AutoSong>): String {
    return when (songs.size) {
      0 -> "No songs yet"
      1 -> "1 song"
      else -> "${songs.size} songs"
    }
  }

  private fun publishState(state: Int) {
    mediaSession.setPlaybackState(buildPlaybackState(state))
  }

  private fun buildPlaybackState(state: Int): PlaybackStateCompat {
    return PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_STOP or
          PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
      )
      .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
      .build()
  }

  private fun reloadBrowseState() {
    browseState = AutoBrowseState.load(this)
    publishState(if (browseState.isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED)
    publishMetadata(browseState.currentSong)
  }

  private fun publishMetadata(song: AutoSong?) {
    val builder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, song?.title ?: "Mavrixfy")
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, song?.artist ?: "Mavrixfy")
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, song?.album ?: "")

    val durationMs = (song?.durationSeconds ?: 0L) * 1000L
    if (durationMs > 0) {
      builder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
    }

    song?.artwork?.takeIf { it.isNotBlank() }?.let {
      builder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, it)
      builder.putString(MediaMetadataCompat.METADATA_KEY_ART_URI, it)
    }

    mediaSession.setMetadata(builder.build())
  }

  private fun playFromQueueIndex(mediaId: String) {
    val parts = mediaId.split("|", limit = 4)
    val requestedIndex = parts.getOrNull(2)?.toIntOrNull() ?: return
    val activeIndex = browseState.queueIndex
    val diff = requestedIndex - activeIndex

    if (diff > 0) {
      repeat(diff.coerceAtMost(20)) { dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_NEXT) }
    } else if (diff < 0) {
      repeat((-diff).coerceAtMost(20)) { dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS) }
    }
    dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY)
  }

  private fun dispatchMediaKey(keyCode: Int) {
    val audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
  }

  private fun contentStyleExtras(): Bundle {
    return Bundle().apply {
      putBoolean(CONTENT_STYLE_SUPPORTED, true)
      putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_LIST_ITEM)
      putInt(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_LIST_ITEM)
    }
  }

  private fun sectionExtras(): Bundle {
    return Bundle().apply {
      putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_LIST_ITEM)
    }
  }

  private fun playableExtras(): Bundle {
    return Bundle().apply {
      putInt(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_LIST_ITEM)
    }
  }

  companion object {
    private const val SESSION_TAG = "MavrixfyAutoService"
    private const val ROOT_ID = "mavrixfy_root"
    private const val RESUME_ID = "mavrixfy_resume"
    private const val NOW_PLAYING_ID = "mavrixfy_now_playing"
    private const val SECTION_QUEUE = "section_queue"
    private const val SECTION_QUICK = "section_quick"
    private const val SECTION_LIKED = "section_liked"
    private const val SECTION_RECENT = "section_recent"
    private const val PLAY_PREFIX = "play"

    private const val CONTENT_STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED"
    private const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
    private const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    private const val CONTENT_STYLE_LIST_ITEM = 1

    private var activeService: WeakReference<MavrixfyAutoService>? = null

    fun refreshBrowsers() {
      activeService?.get()?.let { service ->
        service.reloadBrowseState()
        service.notifyChildrenChanged(ROOT_ID)
        service.notifyChildrenChanged(SECTION_QUEUE)
        service.notifyChildrenChanged(SECTION_QUICK)
        service.notifyChildrenChanged(SECTION_LIKED)
        service.notifyChildrenChanged(SECTION_RECENT)
      }
    }
  }
}

data class AutoSong(
  val id: String,
  val title: String,
  val artist: String,
  val album: String,
  val durationSeconds: Long,
  val artwork: String?
) {
  val subtitle: String
    get() = if (album.isBlank()) artist else "$artist • $album"

  companion object {
    private fun decode(value: String): String {
      val decoded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY).toString()
      } else {
        @Suppress("DEPRECATION")
        Html.fromHtml(value).toString()
      }
      return decoded.replace(Regex("\\s+"), " ").trim()
    }

    fun fromJson(raw: JSONObject?): AutoSong? {
      if (raw == null) return null
      val id = raw.optString("id").trim()
      val title = decode(raw.optString("title"))
      if (id.isBlank() || title.isBlank()) return null

      return AutoSong(
        id = id,
        title = title,
        artist = decode(raw.optString("artist", "Mavrixfy")).ifBlank { "Mavrixfy" },
        album = decode(raw.optString("album", "")),
        durationSeconds = raw.optLong("duration", 0L),
        artwork = raw.optString("artwork", "").takeIf { it.isNotBlank() }
      )
    }
  }
}

data class AutoBrowseState(
  val currentSong: AutoSong?,
  val queue: List<AutoSong>,
  val quickPicks: List<AutoSong>,
  val recentSongs: List<AutoSong>,
  val likedSongs: List<AutoSong>,
  val queueIndex: Int,
  val isPlaying: Boolean
) {
  companion object {
    fun empty(): AutoBrowseState {
      return AutoBrowseState(
        currentSong = null,
        queue = emptyList(),
        quickPicks = emptyList(),
        recentSongs = emptyList(),
        likedSongs = emptyList(),
        queueIndex = 0,
        isPlaying = false
      )
    }

    fun load(service: MavrixfyAutoService): AutoBrowseState {
      val prefs = service.getSharedPreferences(MavrixfyAutoMediaModule.PREFERENCES_NAME, 0)
      val json = prefs.getString(MavrixfyAutoMediaModule.KEY_BROWSE_STATE, null) ?: return empty()

      return try {
        val root = JSONObject(json)
        val current = AutoSong.fromJson(root.optJSONObject("currentSong"))
        val queue = parseSongs(root.optJSONArray("queue"))
        AutoBrowseState(
          currentSong = current ?: queue.firstOrNull(),
          queue = queue,
          quickPicks = parseSongs(root.optJSONArray("quickPicks")),
          recentSongs = parseSongs(root.optJSONArray("recentSongs")),
          likedSongs = parseSongs(root.optJSONArray("likedSongs")),
          queueIndex = root.optInt("queueIndex", 0).coerceAtLeast(0),
          isPlaying = root.optBoolean("isPlaying", false)
        )
      } catch (_: Exception) {
        empty()
      }
    }

    private fun parseSongs(array: JSONArray?): List<AutoSong> {
      if (array == null) return emptyList()
      val songs = mutableListOf<AutoSong>()
      for (index in 0 until array.length()) {
        AutoSong.fromJson(array.optJSONObject(index))?.let { songs.add(it) }
      }
      return songs
    }
  }
}
