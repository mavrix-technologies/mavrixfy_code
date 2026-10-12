package com.mavrixfy.playback

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/** Debug-only host for module instrumentation; excluded from release builds. */
class PlaybackTestActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(TextView(this).apply { text = "Mavrixfy native playback verification" })
  }
}
