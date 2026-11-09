package com.mavrixfy.playback

/** A delayed old React teardown may only detach the emitter it installed. */
internal class PlaybackBridgeBinding(private val emitter: (String, Map<String, Any?>) -> Unit) {
  @Volatile private var attached: PlaybackEngine? = null

  fun attach(engine: PlaybackEngine) {
    attached = engine
    engine.emit = emitter
  }

  fun detachAction(): () -> Unit {
    val previous = attached
    attached = null
    return {
      if (previous != null && previous.emit === emitter) previous.detachBridge()
    }
  }
}
