package com.mavrixfy.playback

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.browse.MediaBrowser
import android.media.session.MediaController
import androidx.media3.common.Player
import androidx.media3.exoplayer.source.ShuffleOrder.DefaultShuffleOrder
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.Closeable
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.sin

/** Exercises actual DataSource/MediaSession behavior rather than bridge snapshots. */
@RunWith(AndroidJUnit4::class)
class PlaybackSourceRefreshTest {
  private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
  private val context get() = instrumentation.targetContext
  private lateinit var scenario: ActivityScenario<PlaybackTestActivity>
  private lateinit var engine: PlaybackEngine
  private var browser: MediaBrowser? = null
  private var server: HeaderAudioServer? = null

  private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)
  private fun await(message: String, timeout: Long = 10000, condition: () -> Boolean) {
    val end = System.currentTimeMillis() + timeout
    while (System.currentTimeMillis() < end) {
      if (condition()) return
      Thread.sleep(50)
    }
    assertTrue(message, condition())
  }
  private fun snapshot(): Map<String, Any?> {
    var state = emptyMap<String, Any?>()
    main { state = engine.snapshot() }
    return state
  }
  private fun tone(seconds: Int = 30): ByteArray {
    val samples = 44100 * seconds
    val data = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN)
    data.put("RIFF".toByteArray()); data.putInt(36 + samples * 2)
    data.put("WAVEfmt ".toByteArray()); data.putInt(16)
    data.putShort(1); data.putShort(1); data.putInt(44100); data.putInt(88200)
    data.putShort(2); data.putShort(16); data.put("data".toByteArray()); data.putInt(samples * 2)
    repeat(samples) { sample -> data.putShort((sin(2 * PI * 440 * sample / 44100) * 800).toInt().toShort()) }
    return data.array()
  }
  private fun localTrack(id: String) = mapOf<String, Any?>("id" to id,
    "url" to File(context.cacheDir, "source-review-$id.wav").apply { writeBytes(tone()) }.toURI().toString())
  private fun remoteTrack(id: String, token: String) = mapOf<String, Any?>(
    "id" to id, "url" to requireNotNull(server).url, "headers" to mapOf("X-Mavrixfy-Test-Token" to token))

  @Before fun setUp() {
    main {
      PlaybackEngine.instance?.let { it.command("reset", emptyMap()); it.detachBridge() }
      context.stopService(Intent(context, PlaybackService::class.java))
    }
    await("Previous engine did not release") { PlaybackEngine.instance == null }
    scenario = ActivityScenario.launch(PlaybackTestActivity::class.java)
    main {
      engine = PlaybackEngine.get(context)
      engine.emit = { _, _ -> }
      context.startService(Intent(context, PlaybackService::class.java))
    }
  }
  @After fun tearDown() {
    main {
      browser?.disconnect(); browser = null
      if (::engine.isInitialized) { engine.command("reset", emptyMap()); engine.detachBridge() }
      context.stopService(Intent(context, PlaybackService::class.java))
    }
    server?.close(); server = null
    if (::scenario.isInitialized) scenario.close()
    await("Playback service retained its engine after test") { PlaybackEngine.instance == null }
  }

  @Test fun automaticAdvanceWaitsForUnresolvedSourceThenUsesResolvedAudio() {
    val events = CopyOnWriteArrayList<Pair<String, Map<String, Any?>>>()
    val first = localTrack("ready")
    val second = localTrack("pending")
    main {
      engine.emit = { name, data -> events.add(name to data) }
      engine.command("setQueue", mapOf("tracks" to listOf(first, mapOf("id" to "pending", "url" to ""))))
      engine.command("play", emptyMap())
    }
    await("First source did not start") { snapshot()["state"] == "playing" }
    main { engine.command("seek", mapOf("position" to 29.9)) }
    await("Unresolved successor was not requested") { events.any { it.first == "playback-source-required" && it.second["trackId"] == "pending" } }
    Thread.sleep(300)
    assertFalse("Unresolved entry attempted decoding", events.any { it.first == "playback-error" })
    assertNotNull(snapshot()["sourceRequest"])
    main { engine.command("update", mapOf("index" to 1, "expectedTrackId" to "pending", "onlyCurrent" to true, "metadata" to second)) }
    await("Resolved successor did not play") { snapshot()["state"] == "playing" }
    assertEquals(1, snapshot()["index"])
    assertNull(snapshot()["sourceRequest"])
  }

  @Test fun pendingSourceTokenFollowsReorderAndLateCompletionCannotCancelNewToken() {
    main {
      engine.command("setQueue", mapOf("tracks" to listOf(mapOf("id" to "pending", "url" to ""), localTrack("ready"))))
      engine.command("play", emptyMap())
    }
    val old = snapshot()["sourceRequest"] as Map<*, *>
    main { engine.command("move", mapOf("index" to 0, "to" to 1)) }
    val next = snapshot()["sourceRequest"] as Map<*, *>
    assertEquals(1, next["index"])
    assertNotEquals(old["requestId"], next["requestId"])
    main { engine.command("sourceRequestFinished", mapOf("requestId" to old["requestId"])) }
    assertEquals(next, snapshot()["sourceRequest"])
    main { engine.command("pause", emptyMap()) }
    assertNull(snapshot()["sourceRequest"])
    main { engine.command("play", emptyMap()) }
    val retried = snapshot()["sourceRequest"] as Map<*, *>
    assertNotEquals(next["requestId"], retried["requestId"])
  }

  @Test fun rebuildingPreservedUnresolvedQueueRestartsItsSourceRequest() {
    val queue = listOf(mapOf<String, Any?>("id" to "pending", "url" to ""))
    main {
      engine.command("setQueue", mapOf("tracks" to queue))
      engine.command("play", emptyMap())
    }
    val old = snapshot()["sourceRequest"] as Map<*, *>
    main { engine.command("setQueue", mapOf("tracks" to queue, "preserveCurrentTrack" to true)) }
    val next = snapshot()["sourceRequest"] as Map<*, *>
    assertNotEquals(old["requestId"], next["requestId"])
    assertEquals("pending", next["trackId"])
  }

  @Test fun sameUrlCurrentHeaderRefreshUsesNewHttpFactoryAndPreservesPausePosition() {
    server = HeaderAudioServer(tone())
    val initial = remoteTrack("current", "old")
    main {
      engine.command("setQueue", mapOf("tracks" to listOf(initial)))
      engine.command("play", emptyMap())
    }
    await("Original HTTP source did not play") { snapshot()["state"] == "playing" }
    assertTrue(server!!.requests.any { it.token == "old" && it.status in listOf(200, 206) })
    main { engine.command("pause", emptyMap()); engine.command("seek", mapOf("position" to 5.0)) }
    server!!.requiredToken = "new"
    main {
      engine.command("update", mapOf("index" to 0, "expectedTrackId" to "current", "onlyCurrent" to true,
        "metadata" to mapOf("headers" to mapOf("X-Mavrixfy-Test-Token" to "new"))))
    }
    await("Header-only source refresh did not issue an authenticated new request") {
      server!!.requests.any { it.token == "new" && it.status in listOf(200, 206) }
    }
    assertEquals(false, snapshot()["playWhenReady"])
    assertEquals(0, snapshot()["index"])
    assertEquals(5.0, (snapshot()["position"] as Number).toDouble(), 0.2)
    main { engine.command("play", emptyMap()) }
    await("Refreshed current source did not resume") { snapshot()["state"] == "playing" }
    await("Refreshed source clock did not advance") { (snapshot()["position"] as Number).toDouble() > 5.3 }
  }

  @Test fun shuffledCurrentHeaderRefreshDoesNotPublishAnotherSongOrQueueEnd() {
    server = HeaderAudioServer(tone())
    val events = CopyOnWriteArrayList<String>()
    val initial = remoteTrack("shuffle-current", "old")
    main {
      engine.command("setQueue", mapOf("tracks" to listOf(initial, localTrack("shuffle-b"), localTrack("shuffle-c"))))
      engine.command("play", emptyMap())
    }
    await("Shuffle test source did not start") { snapshot()["state"] == "playing" }
    main {
      engine.command("pause", emptyMap())
      engine.command("seek", mapOf("position" to 5.0))
      // The current physical index is last in shuffled playback order. Seed 0
      // inserts a replacement before it, exposing add/remove-based refreshes
      // that momentarily choose another item or end the queue before seeking.
      engine.player.setShuffleOrder(DefaultShuffleOrder(intArrayOf(1, 2, 0), 0L))
      engine.player.shuffleModeEnabled = true
      engine.emit = { name, data ->
        when (name) {
          "playback-active-track" -> events.add("active:${(data["track"] as? Map<*, *>)?.get("id")}")
          "playback-queue-ended" -> events.add("queue-ended")
        }
      }
    }
    server!!.requiredToken = "new"
    main {
      engine.command("update", mapOf("index" to 0, "expectedTrackId" to "shuffle-current", "onlyCurrent" to true,
        "metadata" to mapOf("headers" to mapOf("X-Mavrixfy-Test-Token" to "new"))))
    }
    await("Shuffled source refresh did not install the new HTTP headers") {
      server!!.requests.any { it.token == "new" && it.status in listOf(200, 206) }
    }
    assertTrue("Source refresh published a different song or queue end: $events",
      events.all { it == "active:shuffle-current" })
    assertEquals(0, snapshot()["index"])
    assertEquals(false, snapshot()["playWhenReady"])
    assertEquals(5.0, (snapshot()["position"] as Number).toDouble(), 0.2)
    var shuffled = false
    main { shuffled = engine.player.shuffleModeEnabled }
    assertTrue("Source refresh disabled the selected shuffle mode", shuffled)
  }

  private fun verifyUpcomingHeaderRefresh(reconcileQueue: Boolean) {
    server = HeaderAudioServer(tone())
    val first = localTrack("first")
    val next = remoteTrack("next", "old")
    main {
      engine.command("setQueue", mapOf("tracks" to listOf(first, next)))
      engine.command("play", emptyMap())
    }
    await("Current local source did not play") { snapshot()["state"] == "playing" }
    main { engine.command("pause", emptyMap()); engine.command("seek", mapOf("position" to 3.0)) }
    server!!.requiredToken = "new"
    main {
      if (reconcileQueue) {
        engine.command("setQueue", mapOf("tracks" to listOf(first, remoteTrack("next", "new")),
          "index" to 0, "position" to 3.0, "preserveCurrentTrack" to true))
      } else {
        engine.command("update", mapOf("index" to 1, "expectedTrackId" to "next", "onlyUpcoming" to true,
          "metadata" to mapOf("headers" to mapOf("X-Mavrixfy-Test-Token" to "new"))))
      }
    }
    assertEquals(false, snapshot()["playWhenReady"])
    assertEquals(0, snapshot()["index"])
    assertEquals(3.0, (snapshot()["position"] as Number).toDouble(), 0.2)
    main { engine.command("skip", mapOf("index" to 1)); engine.command("play", emptyMap()) }
    await("Upcoming source retained old headers after selection") {
      server!!.requests.any { it.token == "new" && it.status in listOf(200, 206) } && snapshot()["state"] == "playing"
    }
    assertEquals(1, snapshot()["index"])
    @Suppress("UNCHECKED_CAST")
    val queue = snapshot()["queue"] as List<Map<String, Any?>>
    assertEquals(listOf("first", "next"), queue.map { it["id"] })
  }
  @Test fun upcomingHeaderUpdateRebuildsThePreparedSourceWithoutRestartingCurrent() = verifyUpcomingHeaderRefresh(false)
  @Test fun queueReconciliationInstallsUpdatedUpcomingHeadersWithoutRestartingCurrent() = verifyUpcomingHeaderRefresh(true)

  @Test fun remoteStopThenPlayPreparesAndEndedQueueCanReplay() {
    val remote = AtomicReference<MediaController>()
    val failure = AtomicReference<String>()
    main {
      engine.command("setQueue", mapOf("tracks" to listOf(localTrack("transport"))))
      engine.command("play", emptyMap())
      browser = MediaBrowser(context, ComponentName(context, PlaybackService::class.java), object : MediaBrowser.ConnectionCallback() {
        override fun onConnected() { remote.set(MediaController(context, browser!!.sessionToken)) }
        override fun onConnectionFailed() { failure.set("Media browser connection failed") }
      }, null)
      browser!!.connect()
    }
    await("Media session did not connect") { remote.get() != null || failure.get() != null }
    assertNull(failure.get())
    await("Transport test did not start") { snapshot()["state"] == "playing" }
    main { remote.get().transportControls.stop() }
    await("Remote Stop did not enter idle") {
      var idle = false; main { idle = engine.player.playbackState == Player.STATE_IDLE }; idle
    }
    main { remote.get().transportControls.play() }
    await("Remote Play did not prepare the stopped decoder") { snapshot()["state"] == "playing" }
    main { engine.command("seek", mapOf("position" to 30.0)) }
    await("Audio did not reach its end") { snapshot()["state"] == "ended" }
    main { remote.get().transportControls.play() }
    await("Remote Play did not replay the ended queue") { snapshot()["state"] == "playing" }
    assertTrue("Replay did not reset the end position", (snapshot()["position"] as Number).toDouble() < 3.0)
  }

  @Test fun queueMutationsAndResetPublishTheSameOrderToTheColdCarLibrary() {
    val a = localTrack("queue-a"); val b = localTrack("queue-b"); val c = localTrack("queue-c")
    fun savedIds() = CarMediaRepository(context).group("queue").map { it.optString("id") }
    main { engine.command("setQueue", mapOf("tracks" to listOf(a, b))) }
    assertEquals(listOf("queue-a", "queue-b"), savedIds())
    main { engine.command("add", mapOf("tracks" to listOf(c), "index" to 1)) }
    assertEquals(listOf("queue-a", "queue-c", "queue-b"), savedIds())
    main { engine.command("move", mapOf("index" to 2, "to" to 0)) }
    assertEquals(listOf("queue-b", "queue-a", "queue-c"), savedIds())
    main { engine.command("remove", mapOf("index" to 1)) }
    assertEquals(listOf("queue-b", "queue-c"), savedIds())
    main { engine.command("update", mapOf("index" to 1, "metadata" to mapOf("title" to "Refreshed title"))) }
    assertEquals("Refreshed title", CarMediaRepository(context).group("queue")[1].optString("title"))
    main { engine.command("reset", emptyMap()) }
    assertTrue("Reset left a persisted car queue", savedIds().isEmpty())
  }

  private data class Request(val token: String?, val status: Int)
  private class HeaderAudioServer(private val body: ByteArray) : Closeable {
    private val socket = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
    @Volatile private var closed = false
    @Volatile var requiredToken = "old"
    val requests = CopyOnWriteArrayList<Request>()
    val url get() = "http://127.0.0.1:${socket.localPort}/same-audio.wav"
    private val thread = Thread({
      while (!closed) {
        try {
          socket.accept().use { client ->
            client.soTimeout = 2000
            val input = client.getInputStream().bufferedReader(Charsets.US_ASCII)
            val requestLine = input.readLine() ?: return@use
            val headers = mutableMapOf<String, String>()
            while (true) {
              val line = input.readLine() ?: break
              if (line.isEmpty()) break
              val colon = line.indexOf(':')
              if (colon > 0) headers[line.substring(0, colon).lowercase()] = line.substring(colon + 1).trim()
            }
            val token = headers["x-mavrixfy-test-token"]
            val allowed = token == requiredToken
            val range = headers["range"]?.let { Regex("bytes=(\\d+)-.*").matchEntire(it)?.groupValues?.get(1)?.toLongOrNull() }
            val start = (range ?: 0L).coerceIn(0, body.size.toLong()).toInt()
            val status = if (!allowed) 403 else if (range != null && start < body.size) 206 else if (start >= body.size) 416 else 200
            requests.add(Request(token, status))
            val length = if (status == 200 || status == 206) body.size - start else 0
            val response = buildString {
              append("HTTP/1.1 $status ${if (status == 200) "OK" else if (status == 206) "Partial Content" else "Rejected"}\r\n")
              append("Content-Type: audio/wav\r\nContent-Length: $length\r\nAccept-Ranges: bytes\r\nConnection: close\r\n")
              if (status == 206) append("Content-Range: bytes $start-${body.lastIndex}/${body.size}\r\n")
              append("\r\n")
            }
            val output = client.getOutputStream()
            output.write(response.toByteArray(Charsets.US_ASCII))
            if (length > 0 && !requestLine.startsWith("HEAD ")) output.write(body, start, length)
            output.flush()
          }
        } catch (error: Exception) {
          if (closed || error is SocketException && socket.isClosed) break
          // Decoder cancellation may close a prefetch connection mid-write.
        }
      }
    }, "Mavrixfy-header-audio-test").apply { isDaemon = true; start() }
    override fun close() { closed = true; socket.close(); thread.join(2500) }
  }
}
