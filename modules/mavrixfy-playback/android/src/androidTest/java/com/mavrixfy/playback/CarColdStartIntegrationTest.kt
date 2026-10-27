package com.mavrixfy.playback

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.browse.MediaBrowser
import android.media.session.MediaController
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.sin

/** Connect exactly as the legacy Android Auto client does, without an Activity. */
@RunWith(AndroidJUnit4::class)
class CarColdStartIntegrationTest {
  private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
  private val context get() = instrumentation.targetContext
  private var browser: MediaBrowser? = null
  private val remote = AtomicReference<MediaController>()
  private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)
  private fun await(timeout: Long = 10000, condition: () -> Boolean) {
    val end = System.currentTimeMillis() + timeout
    while (System.currentTimeMillis() < end) { if (condition()) return; Thread.sleep(50) }
    assertTrue("Car client did not settle within ${timeout}ms", condition())
  }
  private fun snapshot(): Map<String, Any?> {
    var result = emptyMap<String, Any?>()
    main { result = PlaybackEngine.instance?.snapshot().orEmpty() }
    return result
  }
  private fun disconnect() {
    main {
      browser?.disconnect(); browser = null; remote.set(null)
      PlaybackEngine.instance?.let { it.command("reset", emptyMap()); it.detachBridge() }
      context.stopService(Intent(context, PlaybackService::class.java))
    }
    await { PlaybackEngine.instance == null }
  }
  @Before fun resetState() {
    disconnect()
    context.getSharedPreferences("mavrixfy_car_library", Context.MODE_PRIVATE).edit().clear().commit()
  }
  @After fun releaseService() { disconnect() }
  private fun connect() {
    val failure = AtomicReference<String>()
    main {
      browser = MediaBrowser(context, ComponentName(context, PlaybackService::class.java), object : MediaBrowser.ConnectionCallback() {
        override fun onConnected() { remote.set(MediaController(context, browser!!.sessionToken)) }
        override fun onConnectionFailed() { failure.set("Car browser connection failed") }
      }, null)
      browser!!.connect()
    }
    await { remote.get() != null || failure.get() != null }
    assertNull(failure.get())
    main { assertNull("Cold car browsing must not require the React bridge", PlaybackEngine.instance!!.emit) }
  }
  private fun children(parent: String): List<MediaBrowser.MediaItem> {
    val loaded = AtomicReference<List<MediaBrowser.MediaItem>>()
    val failure = AtomicReference<String>()
    main { browser!!.subscribe(parent, object : MediaBrowser.SubscriptionCallback() {
      override fun onChildrenLoaded(parentId: String, children: MutableList<MediaBrowser.MediaItem>) { loaded.set(children.toList()) }
      override fun onError(parentId: String) { failure.set("Car folder failed: $parentId") }
    }) }
    await { loaded.get() != null || failure.get() != null }
    assertNull(failure.get())
    return loaded.get()
  }
  private fun tone(): String {
    val samples = 44100 * 30
    val data = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN)
    data.put("RIFF".toByteArray()); data.putInt(36 + samples * 2); data.put("WAVEfmt ".toByteArray()); data.putInt(16)
    data.putShort(1); data.putShort(1); data.putInt(44100); data.putInt(88200); data.putShort(2); data.putShort(16)
    data.put("data".toByteArray()); data.putInt(samples * 2)
    for (sample in 0 until samples) data.putShort((sin(2 * PI * 440 * sample / 44100) * 800).toInt().toShort())
    return File(context.cacheDir, "car-cold.wav").apply { writeBytes(data.array()) }.toURI().toString()
  }

  @Test fun coldServiceBrowsesAndPlaysTheSavedLibraryWithoutLaunchingThePhoneApp() {
    val record = JSONObject().put("id", "car-cold").put("title", "Saved car song").put("artist", "Test artist").put("duration", 30).put("audioUrl", tone())
    val next = JSONObject(record.toString()).put("id", "car-next").put("title", "Next saved song")
    CarMediaRepository(context).updateCatalog(JSONObject().put("accountId", "guest").put("favorites", JSONArray().put(record).put(next)).toString())
    repeat(2) { connection ->
      connect()
      assertTrue(children("root").any { it.mediaId == "browse" })
      assertEquals(listOf("car-cold", "car-next"), children("favorites").map { it.mediaId })
      main {
        if (connection == 0) remote.get().transportControls.playFromMediaId("car-cold", null)
        else remote.get().transportControls.play()
      }
      await { snapshot()["state"] == "playing" && (snapshot()["position"] as Number).toDouble() > 0.25 }
      assertEquals(2, (snapshot()["queue"] as List<*>).size)
      main {
        if (connection == 0) remote.get().transportControls.skipToNext()
        else remote.get().transportControls.skipToPrevious()
      }
      await { snapshot()["state"] == "playing" && snapshot()["index"] == if (connection == 0) 1 else 0 }
      main { remote.get().transportControls.pause() }
      await { snapshot()["playWhenReady"] == false }
      disconnect()
    }
  }

  @Test fun freshInstallHasBrowseContentWithoutAnExistingQueueOrLikes() {
    connect()
    val root = children("root")
    assertEquals(listOf("browse"), root.map { it.mediaId })
    val languages = children("browse")
    assertTrue(languages.size >= 2)
    assertTrue(languages.all { it.isBrowsable })
  }

  /** Run explicitly with -Pandroid.testInstrumentationRunnerArguments.carOnline=true. */
  @Test fun onlineColdServiceLoadsAndPlaysBrowseAndVoiceSelections() {
    assumeTrue(InstrumentationRegistry.getArguments().getString("carOnline") == "true")
    connect()
    val started = System.currentTimeMillis()
    val songs = children("browse:hindi")
    assertTrue("A fresh car user must have playable content", songs.isNotEmpty())
    assertTrue("Car content exceeded the 10 second quality limit", System.currentTimeMillis() - started < 10000)
    main { remote.get().transportControls.playFromMediaId(songs.first().mediaId, null) }
    await { snapshot()["state"] == "playing" && (snapshot()["position"] as Number).toDouble() > 0.5 }
    assertTrue("The native queue must appear after cold browse playback", children("root").any { it.mediaId == "queue" })
    assertTrue("Recent music must be available without opening the phone", children("root").any { it.mediaId == "recent" })
    main { remote.get().transportControls.pause() }
    await { snapshot()["playWhenReady"] == false }
    main { remote.get().transportControls.playFromSearch("Apna Bana Le", null) }
    Thread.sleep(100)
    main { remote.get().transportControls.pause() }
    Thread.sleep(1000)
    assertEquals("Explicit Pause must cancel a pending native search selection", false, snapshot()["playWhenReady"])
    main { remote.get().transportControls.playFromSearch("Apna Bana Le", null) }
    try {
      await { snapshot()["state"] == "playing" && (snapshot()["position"] as Number).toDouble() > 0.5 }
    } catch (error: AssertionError) {
      fail("Voice selection did not start: ${snapshot().filterKeys { it in listOf("state", "index", "position", "playWhenReady") }}; car error=${remote.get().playbackState?.errorMessage}")
    }
    main { assertNull(PlaybackEngine.instance!!.emit) }
  }
}
