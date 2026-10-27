package com.mavrixfy.playback

import android.content.Context
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException

@RunWith(AndroidJUnit4::class)
class CarMediaRepositoryTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
  @Before fun clearCatalog() { context.getSharedPreferences("mavrixfy_car_library", Context.MODE_PRIVATE).edit().clear().commit() }
  private fun recording(id: String = "catalog-a", artist: String = "Test Artist", duration: Int = 180) = JSONObject()
    .put("id", id).put("name", "Test &amp; Song").put("duration", duration)
    .put("artists", JSONObject().put("primary", JSONArray().put(JSONObject().put("name", artist))))
    .put("downloadUrl", JSONArray().put(JSONObject().put("quality", "160kbps").put("url", "https://media.example/song.mp4")))
  private fun response(vararg songs: JSONObject) = JSONObject().put("data", JSONObject().put("results", JSONArray(songs.toList())))

  @Test fun searchesEncodeTheQueryAndExposeOnlyPlayableDecodedMetadata() {
    var calls = 0
    val repository = CarMediaRepository(context) { address ->
      calls++
      assertEquals("A & B", Uri.parse(address).getQueryParameter("query"))
      response(recording(), JSONObject().put("id", "unplayable").put("name", "Missing audio"))
    }
    val songs = repository.search("A & B")
    assertEquals(1, songs.size)
    assertEquals("Test & Song", songs.first().getString("title"))
    assertEquals("Test Artist", songs.first().getString("artist"))
    assertEquals("catalog-a", repository.resolve(songs.first())["id"])
    repository.search("A & B")
    assertEquals("Browse and selection share a bounded search cache", 1, calls)
  }

  @Test fun aNewRepositoryRestoresTheLibraryAndResolvedHeadersWithoutReact() {
    val song = JSONObject().put("id", "saved").put("title", "Saved song").put("artist", "Artist").put("duration", 180)
    val original = CarMediaRepository(context) { throw AssertionError("Cached playback must not require a network resolver") }
    original.updateCatalog(JSONObject().put("accountId", "owner-a").put("favorites", JSONArray().put(song)).toString())
    original.rememberSources(listOf(mapOf("id" to "saved", "url" to "https://media.example/saved.mp4", "headers" to mapOf("X-Test" to "value"))))
    val restored = CarMediaRepository(context) { throw AssertionError("The phone app must not be required") }
    val track = restored.resolve(restored.group("favorites").single())
    assertEquals("owner-a", track["accountId"])
    assertEquals("https://media.example/saved.mp4", track["url"])
    assertEquals(mapOf("X-Test" to "value"), track["headers"])
  }

  @Test fun anAccountChangeCannotReuseThePreviousOwnersResolvedSource() {
    val song = JSONObject().put("id", "same-id").put("title", "Private song").put("artist", "Artist").put("duration", 180)
    val repository = CarMediaRepository(context) { response() }
    repository.updateCatalog(JSONObject().put("accountId", "owner-a").toString())
    repository.rememberSources(listOf(mapOf("id" to "same-id", "url" to "https://media.example/private.mp4")))
    repository.updateCatalog(JSONObject().put("accountId", "owner-b").put("favorites", JSONArray().put(song)).toString())
    // A late event from the old decoder/bridge cannot reintroduce its media.
    repository.rememberSources(listOf(mapOf("id" to "same-id", "accountId" to "owner-a", "url" to "https://media.example/private.mp4")))
    repository.rememberSelection(mapOf("id" to "same-id", "accountId" to "owner-a", "url" to "https://media.example/private.mp4"))
    assertTrue(repository.group("recent").isEmpty())
    assertThrows(IOException::class.java) { repository.resolve(song) }
  }

  @Test fun anExpiredSignedStreamNeverFallsBackToAnUnrelatedRecording() {
    val song = JSONObject().put("id", "youtube_saved").put("title", "Test & Song").put("artist", "Original Artist")
      .put("duration", 180).put("audioUrl", "https://media.example/expired.mp4").put("youtubeAudioExpiresAt", System.currentTimeMillis() - 1)
    val repository = CarMediaRepository(context) { response(recording(artist = "Different Artist")) }
    assertThrows(IOException::class.java) { repository.resolve(song) }
    song.put("youtubeAudioExpiresAt", System.currentTimeMillis() + 3600000)
      .put("audioUrl", "https://media.example/expired.mp4?expire=${System.currentTimeMillis() / 1000 - 1}")
    assertThrows("A stale URL expiry must override newer cached metadata", IOException::class.java) { repository.resolve(song) }
    song.remove("youtubeAudioExpiresAt")
    song.put("audioUrl", "https://p.scdn.co/mp3-preview/sample")
    assertThrows("A preview must not be passed off as full-song car playback", IOException::class.java) { repository.resolve(song) }
  }

  @Test fun anExactRecordingMatchRetainsTheOriginalLibraryIdentity() {
    val song = JSONObject().put("id", "youtube_saved").put("title", "Test & Song").put("artist", "Test Artist").put("duration", 180)
    val repository = CarMediaRepository(context) { response(recording(artist = "Wrong Artist"), recording("correct")) }
    val selected = repository.resolve(song)
    assertEquals("youtube_saved", selected["id"])
    assertEquals("Test Artist", selected["artist"])
    assertEquals("https://media.example/song.mp4", selected["url"])
  }

  @Test fun coldBrowseRespectsSavedStreamingQualityAndDataSaver() {
    val recording = recording().put("downloadUrl", JSONArray(listOf(48, 160, 320).map { bitrate ->
      JSONObject().put("quality", "${bitrate}kbps").put("url", "https://media.example/$bitrate.mp4")
    }))
    val repository = CarMediaRepository(context) { response(recording) }
    repository.updateCatalog(JSONObject().put("accountId", "guest").put("streamingQuality", "high").put("dataSaverEnabled", true).toString())
    assertEquals("https://media.example/48.mp4", repository.resolve(repository.search("song").single())["url"])
    repository.updateCatalog(JSONObject().put("accountId", "guest").put("streamingQuality", "high").put("dataSaverEnabled", false).toString())
    assertEquals("https://media.example/320.mp4", repository.resolve(repository.search("song").single())["url"])
  }

  @Test fun aColdSelectionRestoresTheWholePreparedQueueAndSelectedIndex() {
    val songs = listOf("a", "b", "c").map { id -> JSONObject().put("id", id).put("title", "Song $id")
      .put("artist", "Artist").put("audioUrl", "https://media.example/$id.mp4") }
    CarMediaRepository(context).updateCatalog(JSONObject().put("accountId", "guest").put("queue", JSONArray(songs)).toString())
    val restored = CarMediaRepository(context) { throw AssertionError("Prepared queue restoration must not require network access") }
    val selection = restored.selection(restored.find("b")!!)
    assertEquals(listOf("a", "b", "c"), selection.tracks.map { it["id"] })
    assertEquals(1, selection.index)
    assertEquals(selection, restored.preparedSelection("b"))
  }
}
