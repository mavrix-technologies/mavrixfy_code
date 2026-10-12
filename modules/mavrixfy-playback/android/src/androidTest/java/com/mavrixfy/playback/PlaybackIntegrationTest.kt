package com.mavrixfy.playback

import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.*
import android.content.Intent
import android.app.ActivityManager
import android.content.Context
import android.media.AudioManager
import android.media.AudioFocusRequest
import android.media.AudioAttributes
import android.media.browse.MediaBrowser
import android.content.ComponentName
import java.util.concurrent.atomic.AtomicReference
import android.view.KeyEvent
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.PI
import kotlin.math.sin
import androidx.lifecycle.Lifecycle

@RunWith(AndroidJUnit4::class)
class PlaybackIntegrationTest {
  private fun tone(name: String, seconds: Int): String {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val samples = 44100 * seconds
    val data = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN)
    data.put("RIFF".toByteArray()); data.putInt(36 + samples * 2); data.put("WAVEfmt ".toByteArray()); data.putInt(16)
    data.putShort(1.toShort()); data.putShort(1.toShort()); data.putInt(44100); data.putInt(88200); data.putShort(2.toShort()); data.putShort(16.toShort())
    data.put("data".toByteArray()); data.putInt(samples * 2)
    for (sample in 0 until samples) data.putShort((sin(2 * PI * 440 * sample / 44100) * 800).toInt().toShort())
    val file = File(context.cacheDir, name); file.writeBytes(data.array()); return file.toURI().toString()
  }
  private fun onMain(action: () -> Unit) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action) }
  private fun state(engine: PlaybackEngine): Map<String, Any?> { var value = emptyMap<String, Any?>(); onMain { value = engine.snapshot() }; return value }
  private fun awaitCondition(timeout: Long = 10000, predicate: () -> Boolean) {
    val end = System.currentTimeMillis() + timeout
    while (System.currentTimeMillis() < end) { if (predicate()) return; Thread.sleep(100) }
    assertTrue("Native playback condition did not settle", predicate())
  }
  @Test fun nativeQueuePlaysTwoCompleteFilesWithoutReactRenderer() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val files = listOf(mapOf("id" to "a", "title" to "Native test A", "url" to tone("native-a.wav", 8)), mapOf("id" to "b", "title" to "Native test B", "url" to tone("native-b.wav", 8)))
    val scenario = ActivityScenario.launch(PlaybackTestActivity::class.java)
    lateinit var engine: PlaybackEngine
    val transitions = CopyOnWriteArrayList<Int>(); val errors = CopyOnWriteArrayList<Map<String, Any?>>()
    try {
      onMain {
        engine = PlaybackEngine.get(context)
        engine.emit = { name, data -> if (name == "playback-active-track") transitions.add((data["index"] as Number).toInt()); if (name == "playback-error") errors.add(data) }
        context.startService(Intent(context, PlaybackService::class.java))
        engine.command("setQueue", mapOf("tracks" to files, "index" to 0)); engine.command("play", emptyMap())
      }
      awaitCondition { state(engine)["state"] == "playing" }
      awaitCondition {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        @Suppress("DEPRECATION")
        manager.getRunningServices(Int.MAX_VALUE).any { it.service.className == PlaybackService::class.java.name && it.foreground }
      }
      scenario.moveToState(Lifecycle.State.CREATED)
      awaitCondition(25000) { state(engine)["state"] == "ended" }
      assertTrue("Native decoder errors: $errors", errors.isEmpty())
      assertEquals(listOf(0, 1), transitions.toList())
      assertEquals(1, (state(engine)["index"] as Number).toInt())
    } finally { onMain { engine.command("reset", emptyMap()); engine.emit = null }; scenario.close() }
  }
  @Test fun pauseSeekAndQueueReorderPreserveNativeIntentAndPosition() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val a = mapOf("id" to "a", "url" to tone("native-long.wav", 30))
    val b = mapOf("id" to "b", "url" to tone("native-next.wav", 8))
    val scenario = ActivityScenario.launch(PlaybackTestActivity::class.java)
    lateinit var engine: PlaybackEngine
    try {
      onMain { engine = PlaybackEngine.get(context); context.startService(Intent(context, PlaybackService::class.java)); engine.command("setQueue", mapOf("tracks" to listOf(a,b), "index" to 0)); engine.command("play", emptyMap()) }
      awaitCondition { state(engine)["state"] == "playing" }
      onMain { engine.command("pause", emptyMap()); engine.command("seek", mapOf("position" to 5.0)); engine.command("setQueue", mapOf("tracks" to listOf(b,a), "index" to 1, "position" to 5.0, "preserveCurrentTrack" to true)) }
      assertEquals(false, state(engine)["playWhenReady"])
      assertEquals(1, (state(engine)["index"] as Number).toInt())
      assertTrue((state(engine)["position"] as Number).toDouble() >= 4.9)
      onMain { engine.command("play", emptyMap()) }
      awaitCondition { state(engine)["state"] == "playing" }
    } finally { onMain { engine.command("reset", emptyMap()) }; scenario.close() }
  }
  @Test fun namedPlatformMediaKeysPauseResumeAndSelectNextWithoutCrashing() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val scenario = ActivityScenario.launch(PlaybackTestActivity::class.java)
    lateinit var engine: PlaybackEngine
    val events = CopyOnWriteArrayList<String>()
    val remote = AtomicReference<android.media.session.MediaController>()
    var browser: MediaBrowser? = null
    try {
      val files = listOf(mapOf("id" to "a", "url" to tone("keys-a.wav", 30)), mapOf("id" to "b", "url" to tone("keys-b.wav", 30)))
      onMain {
        engine = PlaybackEngine.get(context); engine.emit = { name, _ -> events.add(name) }
        context.startService(Intent(context, PlaybackService::class.java))
        engine.command("setQueue", mapOf("tracks" to files)); engine.command("play", emptyMap())
      }
      awaitCondition { state(engine)["state"] == "playing" }
      onMain {
        browser = MediaBrowser(context, ComponentName(context, PlaybackService::class.java), object : MediaBrowser.ConnectionCallback() {
          override fun onConnected() { remote.set(android.media.session.MediaController(context, browser!!.sessionToken)) }
        }, null)
        browser!!.connect()
      }
      awaitCondition { remote.get() != null }
      fun key(code: Int) { onMain { remote.get().dispatchMediaButtonEvent(KeyEvent(KeyEvent.ACTION_DOWN, code)); remote.get().dispatchMediaButtonEvent(KeyEvent(KeyEvent.ACTION_UP, code)) } }
      key(KeyEvent.KEYCODE_MEDIA_PAUSE)
      awaitCondition { state(engine)["playWhenReady"] == false }
      key(KeyEvent.KEYCODE_MEDIA_PLAY)
      awaitCondition { state(engine)["state"] == "playing" }
      key(KeyEvent.KEYCODE_MEDIA_NEXT)
      awaitCondition { state(engine)["index"] == 1 && state(engine)["state"] == "playing" }
      key(KeyEvent.KEYCODE_HEADSETHOOK)
      awaitCondition { state(engine)["playWhenReady"] == false }
      assertTrue(events.contains("remote-pause")); assertTrue(events.contains("remote-play"))
    } finally {
      onMain { browser?.disconnect(); engine.command("reset", emptyMap()); engine.emit = null }
      scenario.close()
    }
  }
  @Test fun transientAudioFocusResumesUnlessTheUserPausedDuringInterruption() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val scenario = ActivityScenario.launch(PlaybackTestActivity::class.java)
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      .setOnAudioFocusChangeListener { }.build()
    lateinit var engine: PlaybackEngine
    val interruptions = CopyOnWriteArrayList<Boolean>()
    try {
      val track = mapOf("id" to "focus", "url" to tone("focus.wav", 30))
      onMain {
        engine = PlaybackEngine.get(context)
        engine.emit = { name, data -> if (name == "playback-interruption") interruptions.add(data["resumed"] == true) }
        context.startService(Intent(context, PlaybackService::class.java))
        engine.command("setQueue", mapOf("tracks" to listOf(track))); engine.command("play", emptyMap())
      }
      awaitCondition { state(engine)["state"] == "playing" }
      assertEquals(AudioManager.AUDIOFOCUS_REQUEST_GRANTED, audio.requestAudioFocus(request))
      awaitCondition { interruptions.contains(false) && state(engine)["state"] == "paused" }
      assertEquals(true, state(engine)["playWhenReady"])
      audio.abandonAudioFocusRequest(request)
      awaitCondition { interruptions.contains(true) && state(engine)["state"] == "playing" }
      interruptions.clear()
      assertEquals(AudioManager.AUDIOFOCUS_REQUEST_GRANTED, audio.requestAudioFocus(request))
      awaitCondition { interruptions.contains(false) }
      onMain { engine.command("pause", emptyMap()) }
      audio.abandonAudioFocusRequest(request)
      Thread.sleep(750)
      assertEquals(false, state(engine)["playWhenReady"])
      assertEquals("paused", state(engine)["state"])
    } finally {
      audio.abandonAudioFocusRequest(request)
      onMain { engine.command("reset", emptyMap()); engine.emit = null }; scenario.close()
    }
  }

  @Test fun legacyBrowseSelectionWaitsForSharedControllerAndDoesNotClearItsQueue() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val scenario = ActivityScenario.launch(PlaybackTestActivity::class.java)
    val remote = AtomicReference<android.media.session.MediaController>()
    val requests = CopyOnWriteArrayList<Map<String, Any?>>()
    var browser: MediaBrowser? = null
    lateinit var engine: PlaybackEngine
    val files = listOf(mapOf("id" to "browse-a", "url" to tone("browse-a.wav", 30)), mapOf("id" to "browse-b", "url" to tone("browse-b.wav", 30)))
    try {
      onMain {
        engine = PlaybackEngine.get(context)
        engine.emit = { name, data ->
          if (name == "car-play-media") {
            requests.add(data)
            // Reproduce an asynchronous JS resolver finishing after the callback.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
              val id = data["id"]
              if (id == "missing") engine.command("carResolution", mapOf("requestId" to data["requestId"], "error" to "Unavailable"))
              else if (id != "cancelled") {
                val index = files.indexOfFirst { it["id"] == id }
                engine.command("setQueue", mapOf("tracks" to files, "index" to index))
                engine.command("play", emptyMap())
                engine.command("carResolution", mapOf("requestId" to data["requestId"], "mediaId" to id))
              }
            }, 300)
          }
        }
        context.startService(Intent(context, PlaybackService::class.java))
        engine.command("setQueue", mapOf("tracks" to files)); engine.command("play", emptyMap())
        browser = MediaBrowser(context, ComponentName(context, PlaybackService::class.java), object : MediaBrowser.ConnectionCallback() {
          override fun onConnected() { remote.set(android.media.session.MediaController(context, browser!!.sessionToken)) }
        }, null)
        browser!!.connect()
      }
      awaitCondition { remote.get() != null }
      for (id in listOf("browse-b", "browse-a", "browse-b")) {
        onMain { remote.get().transportControls.playFromMediaId(id, null) }
        awaitCondition { state(engine)["state"] == "playing" && (state(engine)["queue"] as List<*>).size == 2 && state(engine)["index"] == files.indexOfFirst { it["id"] == id } }
        Thread.sleep(600)
        assertEquals("playing", state(engine)["state"])
        assertTrue((state(engine)["position"] as Number).toDouble() > 0.1)
      }
      onMain { remote.get().transportControls.playFromMediaId("missing", null) }
      awaitCondition { requests.any { it["id"] == "missing" } }
      Thread.sleep(600)
      assertEquals("playing", state(engine)["state"])
      assertEquals(2, (state(engine)["queue"] as List<*>).size)
      onMain { remote.get().transportControls.playFromMediaId("cancelled", null) }
      awaitCondition { requests.any { it["id"] == "cancelled" } }
      onMain { engine.command("pause", emptyMap()) }
      val cancelled = requests.last()
      onMain { engine.command("carResolution", mapOf("requestId" to cancelled["requestId"], "mediaId" to "browse-b")) }
      Thread.sleep(600)
      assertEquals(false, state(engine)["playWhenReady"])
    } finally {
      onMain { browser?.disconnect(); engine.command("reset", emptyMap()); engine.emit = null }
      scenario.close()
    }
  }
}
