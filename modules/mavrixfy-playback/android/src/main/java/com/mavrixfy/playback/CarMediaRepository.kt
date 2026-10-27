package com.mavrixfy.playback

import android.content.Context
import android.net.Uri
import android.text.Html
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer

internal class CarMediaException(message: String) : IOException(message)
internal data class CarSelection(val tracks: List<Map<String, Any?>>, val index: Int)

/** A car connection must not require an Activity or a running React bridge. */
internal class CarMediaRepository(
  context: Context,
  private val request: (String) -> JSONObject = { address ->
    val connection = URL(address).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 3000
      connection.readTimeout = 4000
      connection.setRequestProperty("Accept", "application/json")
      if (connection.responseCode !in 200..299) throw CarMediaException("Music service unavailable. Check your connection and try again.")
      connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
    } finally { connection.disconnect() }
  },
) {
  companion object {
    val categories = linkedMapOf("hindi" to "Hindi", "english" to "English", "punjabi" to "Punjabi", "tamil" to "Tamil", "telugu" to "Telugu")
    private const val LIMIT = 100
    private const val CACHE_MS = 5 * 60 * 1000L
    private fun text(value: String) = Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY).toString()
    private fun normalized(value: String) = Normalizer.normalize(text(value), Normalizer.Form.NFKC).lowercase()
      .replace(Regex("\\b(?:official\\s+(?:music\\s+)?(?:audio|video)|lyric(?:al|s)?\\s+video|full\\s+song)\\b"), "")
      .replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    private fun artists(value: String) = value.split(Regex(",|&|\\bfeat\\.?\\b|\\bft\\.?\\b", RegexOption.IGNORE_CASE))
      .map(::normalized).filter { it.isNotBlank() && it !in listOf("unknown", "unknown artist", "youtube music", "various artists") }
  }

  private val preferences = context.getSharedPreferences("mavrixfy_car_library", Context.MODE_PRIVATE)
  private val lock = Any()
  private val apiBase = context.getString(R.string.mavrixfy_car_api_base_url).trimEnd('/').removeSuffix("/api") + "/api"
  private var catalog = runCatching { JSONObject(preferences.getString("catalog", "{}")!!) }.getOrDefault(JSONObject())
  private var sources = runCatching { JSONObject(preferences.getString("sources", "{}")!!) }.getOrDefault(JSONObject())
  private val publicLists = LinkedHashMap<String, Pair<Long, List<JSONObject>>>()
  @Volatile var revision = 0L; private set
  val owner: String get() = synchronized(lock) { catalog.optString("accountId", "guest") }
  private fun belongsToOwner(track: Map<String, Any?>) = track["accountId"] == null || track["accountId"] == owner

  fun updateCatalog(json: String): Boolean = synchronized(lock) {
    val next = JSONObject(json)
    val ownerChanged = catalog.optString("accountId") != next.optString("accountId")
    if (catalog.optString("streamingQuality") != next.optString("streamingQuality") || catalog.optBoolean("dataSaverEnabled") != next.optBoolean("dataSaverEnabled")) {
      // Expire search responses without losing IDs already displayed by the car.
      publicLists.replaceAll { _, cached -> 0L to cached.second }
    }
    if (ownerChanged) {
      sources = JSONObject(); revision++
      preferences.edit().remove("resumeId").remove("resumePosition").apply()
    }
    catalog = next
    save()
    ownerChanged
  }

  fun rememberSources(tracks: List<Map<String, Any?>>) = synchronized(lock) {
    for (track in tracks.take(LIMIT)) {
      if (!belongsToOwner(track)) continue
      val id = track["id"] as? String ?: continue
      if (track["url"] is String) {
        sources.remove(id)
        sources.put(id, JSONObject(track))
      }
    }
    while (sources.length() > LIMIT) sources.remove(sources.keys().next())
    save()
  }

  fun group(id: String): List<JSONObject> = synchronized(lock) {
    val songs = catalog.optJSONArray(id) ?: JSONArray()
    (0 until minOf(songs.length(), LIMIT)).mapNotNull { songs.optJSONObject(it) }.map { JSONObject(it.toString()) }
  }

  fun category(id: String): List<JSONObject> {
    val label = categories[id] ?: throw IllegalArgumentException("Unknown music category")
    return search("$label songs")
  }

  fun search(query: String): List<JSONObject> {
    val term = query.trim().take(200)
    require(term.isNotEmpty()) { "Enter a song or artist to search." }
    synchronized(lock) { publicLists[term]?.let { if (System.currentTimeMillis() - it.first < CACHE_MS) return it.second } }
    val result = request("$apiBase/search/songs?query=${Uri.encode(term)}&limit=30&page=1")
    val data = result.optJSONObject("data")
    val rows = data?.optJSONArray("results") ?: result.optJSONArray("results") ?: result.optJSONArray("data") ?: JSONArray()
    val songs = (0 until minOf(rows.length(), 30)).mapNotNull { rows.optJSONObject(it)?.let(::fromApi) }
    synchronized(lock) {
      if (publicLists.size >= 20) publicLists.remove(publicLists.keys.first())
      publicLists[term] = System.currentTimeMillis() to songs
    }
    return songs
  }

  fun find(id: String): JSONObject? = synchronized(lock) {
    for (group in listOf("queue", "favorites", "recent")) group(group).firstOrNull { it.optString("id") == id }?.let { return it }
    publicLists.values.forEach { (_, songs) -> songs.firstOrNull { it.optString("id") == id }?.let { return it } }
    sources.optJSONObject(id)?.let { JSONObject(it.toString()) }
  }

  fun isAppItem(id: String) = listOf("queue", "favorites", "recent").any { group(it).any { song -> song.optString("id") == id } }
  fun isPublicItem(id: String) = synchronized(lock) { publicLists.values.any { (_, songs) -> songs.any { it.optString("id") == id } } }

  fun rememberPosition(id: String?, position: Long) {
    if (!id.isNullOrBlank()) preferences.edit().putString("resumeId", id).putLong("resumePosition", position.coerceAtLeast(0)).apply()
  }

  fun resumeItem(): JSONObject? = preferences.getString("resumeId", null)?.let(::find) ?: group("recent").firstOrNull() ?: group("queue").firstOrNull()
  fun resumePosition(): Long {
    val song = resumeItem() ?: return 0
    val position = preferences.getLong("resumePosition", 0)
    val duration = (song.optDouble("duration", 0.0) * 1000).toLong()
    return if (song.optString("id") == preferences.getString("resumeId", null) && (duration <= 0 || position < duration - 1000)) position else 0
  }

  fun selection(song: JSONObject): CarSelection = queueSelection(song, resolve(song))

  /** Metadata handoff to the running app; this path never performs network I/O. */
  fun preparedSelection(id: String): CarSelection {
    val song = find(id) ?: throw CarMediaException("This song is no longer available. Refresh the car's music folder.")
    return queueSelection(song, prepared(song) ?: throw CarMediaException("This song expired. Refresh the car's music folder."))
  }

  private fun queueSelection(song: JSONObject, selected: Map<String, Any?>): CarSelection {
    val siblings = synchronized(lock) {
      publicLists.values.firstOrNull { (_, songs) -> songs.any { it.optString("id") == song.optString("id") } }?.second
        ?: listOf("queue", "favorites", "recent").asSequence().map(::group)
          .firstOrNull { songs -> songs.any { it.optString("id") == song.optString("id") } }.orEmpty()
    }
    val tracks = siblings.mapNotNull { sibling -> if (sibling.optString("id") == song.optString("id")) selected else prepared(sibling) }
    val at = tracks.indexOfFirst { it["id"] == selected["id"] }
    return if (at >= 0) CarSelection(tracks, at) else CarSelection(listOf(selected), 0)
  }

  private fun prepared(song: JSONObject): Map<String, Any?>? {
    val saved = synchronized(lock) { sources.optJSONObject(song.optString("id")) }
    val candidates = if (isPublicItem(song.optString("id"))) listOfNotNull(song, saved) else listOfNotNull(saved, song)
    for (candidate in candidates) {
      val url = audioUrl(candidate)
      if (url != null) return track(song, candidate, url)
    }
    return null
  }

  /** Preserve the recording identity. Never substitute the first search hit. */
  fun resolve(song: JSONObject): Map<String, Any?> {
    prepared(song)?.let { return it }
    val title = song.optString("title")
    val artist = song.optString("artist")
    val duration = song.optDouble("duration", 0.0)
    val performers = artists(artist)
    val matches = search("${normalized(title)} ${performers.joinToString(" ")}")
    val match = matches.firstOrNull { candidate ->
      candidate.optString("id") == song.optString("id") ||
        (normalized(title).isNotEmpty() && normalized(title) == normalized(candidate.optString("title")) && duration > 0 &&
          kotlin.math.abs(duration - candidate.optDouble("duration")) <= minOf(5.0, maxOf(2.0, duration * 0.01)) &&
          performers.any { it in artists(candidate.optString("artist")) })
    } ?: throw CarMediaException("This recording is unavailable in the car right now. Choose another song or try again later.")
    return track(song, match, audioUrl(match) ?: throw CarMediaException("No playable audio is available for this song."))
  }

  fun rememberSelection(track: Map<String, Any?>) = synchronized(lock) {
    if (!belongsToOwner(track)) return@synchronized
    val song = JSONObject(track).apply { put("coverUrl", optString("artwork")); put("audioUrl", optString("url")) }
    val previous = group("recent").filter { it.optString("id") != song.optString("id") }
    catalog.put("recent", JSONArray(listOf(song) + previous.take(49)))
    save()
  }

  fun rememberQueue(tracks: List<Map<String, Any?>>) = synchronized(lock) {
    catalog.put("queue", JSONArray(tracks.filter(::belongsToOwner).take(LIMIT).map { track ->
      JSONObject(track).apply { put("coverUrl", optString("artwork")); put("audioUrl", optString("url")) }
    }))
    save()
  }

  private fun save() { preferences.edit().putString("catalog", catalog.toString()).putString("sources", sources.toString()).apply() }

  private fun audioUrl(song: JSONObject): String? {
    val value = listOf("url", "audioUrl").map(song::optString).firstOrNull { address ->
      val uri = Uri.parse(address)
      val scheme = uri.scheme
      val host = uri.host.orEmpty().lowercase()
      val preview = listOf("preview.m4a", "audiopreview", "p.scdn.co/mp3-preview", "/preview/").any { address.lowercase().contains(it) }
      (scheme == "https" && !Regex("(^|\\.)(youtube\\.com|youtu\\.be|spotify\\.com|jiosaavn\\.com|music\\.apple\\.com)$").containsMatchIn(host) &&
        !host.contains("audio-ssl.itunes.apple.com") && !preview) || (scheme == "file" && java.io.File(uri.path.orEmpty()).isFile)
    } ?: return null
    val uri = Uri.parse(value)
    val expirations = listOf(song.optLong("youtubeAudioExpiresAt", 0), song.optLong("expiresAt", 0), (uri.getQueryParameter("expire")?.toLongOrNull() ?: 0) * 1000)
    if (expirations.any { it > 0 && it <= System.currentTimeMillis() + 120000 }) return null
    return value
  }

  private fun track(song: JSONObject, source: JSONObject, url: String): Map<String, Any?> {
    val headers = source.optJSONObject("headers")
    return mapOf("id" to song.optString("id"), "title" to song.optString("title", source.optString("title")),
      "artist" to song.optString("artist", source.optString("artist")), "artwork" to song.optString("coverUrl", song.optString("artwork")),
      "duration" to source.optDouble("duration", song.optDouble("duration", 0.0)), "url" to url,
      "source" to song.optString("source", source.optString("source")), "accountId" to synchronized(lock) { catalog.optString("accountId", "guest") },
      "headers" to (headers?.keys()?.asSequence()?.associateWith { headers.optString(it) } ?: emptyMap()),
      "youtubeAudioExpiresAt" to source.optLong("youtubeAudioExpiresAt", source.optLong("expiresAt", 0)))
  }

  private fun fromApi(raw: JSONObject): JSONObject? {
    val urls = raw.optJSONArray("downloadUrl") ?: return null
    val target = synchronized(lock) {
      if (catalog.optBoolean("dataSaverEnabled")) 48 else when (catalog.optString("streamingQuality", "medium")) { "high" -> 320; "low" -> 48; else -> 160 }
    }
    val options = (0 until urls.length()).mapNotNull { urls.optJSONObject(it) }.filter { it.optString("url").startsWith("https://") }.sortedByDescending {
      it.optString("quality").filter(Char::isDigit).toIntOrNull() ?: 0
    }
    val address = (options.firstOrNull { (it.optString("quality").filter(Char::isDigit).toIntOrNull() ?: 0) <= target } ?: options.lastOrNull())?.optString("url") ?: return null
    val primary = raw.optJSONObject("artists")?.optJSONArray("primary") ?: JSONArray()
    val artist = (0 until primary.length()).map { text(primary.optJSONObject(it)?.optString("name").orEmpty()) }.filter(String::isNotBlank).joinToString(", ")
    val images = raw.optJSONArray("image")
    val image = images?.optJSONObject(images.length() - 1)?.optString("url").orEmpty()
    return JSONObject().put("id", raw.optString("id")).put("title", text(raw.optString("name", raw.optString("title"))))
      .put("artist", artist).put("duration", raw.optDouble("duration", 0.0)).put("coverUrl", image).put("audioUrl", address).put("source", "jiosaavn")
      .takeIf { it.optString("id").isNotBlank() && it.optString("title").isNotBlank() && audioUrl(it) != null }
  }
}
