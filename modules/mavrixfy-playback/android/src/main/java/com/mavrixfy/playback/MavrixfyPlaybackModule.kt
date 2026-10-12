package com.mavrixfy.playback

import android.content.Intent
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues

class MavrixfyPlaybackModule : Module() {
  private val engine get() = PlaybackEngine.get(requireNotNull(appContext.reactContext))
  override fun definition() = ModuleDefinition {
    Name("MavrixfyPlayback")
    Events("playbackEvent")
    AsyncFunction("setup") {
      engine.emit = { name, data -> sendEvent("playbackEvent", mapOf("name" to name, "data" to data)) }
      val context = requireNotNull(appContext.reactContext)
      context.startService(Intent(context, PlaybackService::class.java))
      engine.snapshot()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("command") { name: String, args: Map<String, Any?> ->
      // Media3 may stop its service after a long paused session. A new Play
      // reconnects the OS session without replacing the process-wide player.
      if (name == "play") {
        val context = requireNotNull(appContext.reactContext)
        context.startService(Intent(context, PlaybackService::class.java))
      }
      engine.command(name, args)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("snapshot") { engine.snapshot() }.runOnQueue(Queues.MAIN)
    OnDestroy { Handler(Looper.getMainLooper()).post { PlaybackEngine.instance?.detachBridge() } }
  }
}
