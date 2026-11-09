package com.mavrixfy.playback

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlaybackBridgeBindingTest {
  @Test fun delayedOldBridgeTeardownKeepsTheNewEmitterAndServicePlayer() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    instrumentation.runOnMainSync {
      val engine = PlaybackEngine.get(instrumentation.targetContext)
      var oldEvents = 0
      var newEvents = 0
      val old = PlaybackBridgeBinding { _, _ -> oldEvents++ }
      val replacement = PlaybackBridgeBinding { _, _ -> newEvents++ }
      // A live service must retain playback after either React bridge detaches.
      engine.attachService()
      try {
        old.attach(engine)
        val queuedDestroy = old.detachAction()
        replacement.attach(engine)
        engine.carClientReady = true
        queuedDestroy()
        engine.event("binding-test")
        assertEquals(0, oldEvents)
        assertEquals(1, newEvents)
        assertTrue(engine.carClientReady)
        assertSame(engine, PlaybackEngine.instance)
        replacement.detachAction()()
        assertNull(engine.emit)
        assertFalse(engine.carClientReady)
        assertSame(engine, PlaybackEngine.instance)
      } finally {
        engine.detachBridge()
        engine.detachService()
      }
      assertNull(PlaybackEngine.instance)
    }
  }
}
