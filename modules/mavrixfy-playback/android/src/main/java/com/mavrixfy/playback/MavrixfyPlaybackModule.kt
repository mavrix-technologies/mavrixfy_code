package com.mavrixfy.playback

import android.content.Intent
import android.media.MediaRouter2
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues

class MavrixfyPlaybackModule : Module() {
  private val engine get() = PlaybackEngine.get(requireNotNull(appContext.reactContext))
  private val binding by lazy(LazyThreadSafetyMode.NONE) {
    PlaybackBridgeBinding { name, data -> sendEvent("playbackEvent", mapOf("name" to name, "data" to data)) }
  }
  override fun definition() = ModuleDefinition {
    Name("MavrixfyPlayback")
    Events("playbackEvent")
    AsyncFunction("setup") {
      binding.attach(engine)
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
    AsyncFunction("showAudioOutputPicker") {
      if (Build.VERSION.SDK_INT >= 34) {
        val activity = appContext.currentActivity ?: return@AsyncFunction false
        MediaRouter2.getInstance(activity).showSystemOutputSwitcher()
      } else false
    }.runOnQueue(Queues.MAIN)
    OnDestroy {
      val detach = binding.detachAction()
      Handler(Looper.getMainLooper()).post { detach() }
    }
  }
}
