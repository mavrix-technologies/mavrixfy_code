package com.mavrixfy.app.youtube

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.PromiseImpl
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Explicit, live-network emulator smoke test. Never part of normal offline tests. */
class YouTubeSmokeRunner : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
    private fun result(operation: (Promise) -> Unit): ReadableMap {
        val latch = CountDownLatch(1)
        var value: Any? = null
        var error: Any? = null
        operation(PromiseImpl(Callback { args -> value = args.firstOrNull(); latch.countDown() },
            Callback { args -> error = args.firstOrNull(); latch.countDown() }))
        check(latch.await(30, TimeUnit.SECONDS)) { "Native request exceeded its deadline" }
        check(error == null) { "Native request rejected: $error" }
        return value as ReadableMap
    }
    override fun onStart() {
        val report = Bundle()
        // Exercise playback as a foreground app; this emulator restricts background networking/audio.
        targetContext.startActivity(Intent(targetContext, com.mavrixfy.app.MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        SystemClock.sleep(1500)
        val module = MavrixfyYouTubeModule(BridgeReactContext(targetContext))
        var player: MediaPlayer? = null
        try {
            val search = result { module.search("Arijit Singh", "all", "smoke-search", it) }
            val songs = search.getArray("songs")!!
            val playlists = search.getArray("playlists")!!
            check(songs.size() > 0) { "No YouTube Music songs returned" }
            check(playlists.size() > 0) { "No YouTube Music playlists returned" }
            report.putInt("songResults", songs.size()); report.putInt("playlistResults", playlists.size())
            val collection = result { module.playlist(playlists.getMap(0)!!.getString("id")!!, "", "smoke-playlist", it) }
            check(collection.getArray("songs")!!.size() > 0) { "Playlist tracks did not load" }
            report.putInt("playlistSongs", collection.getArray("songs")!!.size())
            val videoId = songs.getMap(0)!!.getString("videoId")!!
            val started = SystemClock.elapsedRealtime()
            val stream = result { module.resolveStream(videoId, "medium", "smoke-stream", it) }
            report.putLong("resolveMs", SystemClock.elapsedRealtime() - started)
            check(stream.getDouble("expiresAt") > System.currentTimeMillis())
            val headers = stream.getMap("headers")!!.toHashMap().mapValues { it.value.toString() }
            player = MediaPlayer()
            player.setVolume(0f, 0f)
            player.setDataSource(targetContext, Uri.parse(stream.getString("url")), headers)
            val prepared = CountDownLatch(1)
            var mediaError: String? = null
            player.setOnPreparedListener { prepared.countDown() }
            player.setOnErrorListener { _, what, extra -> mediaError = "$what/$extra"; prepared.countDown(); true }
            player.prepareAsync()
            check(prepared.await(20, TimeUnit.SECONDS)) { "Media preparation timed out" }
            check(mediaError == null) { "Media preparation failed: $mediaError" }
            player.start()
            val deadline = SystemClock.elapsedRealtime() + 15000
            while (mediaError == null && player.currentPosition < 1500 && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(250)
            check(mediaError == null && player.currentPosition > 500) { "Audio did not advance: $mediaError" }
            report.putInt("playbackPositionMs", player.currentPosition)
            player.seekTo(10000)
            SystemClock.sleep(1500)
            check(player.currentPosition >= 9000) { "Audio seek failed" }
            report.putInt("seekPositionMs", player.currentPosition)
            report.putString("result", "PASS")
            finish(Activity.RESULT_OK, report)
        } catch (error: Throwable) {
            // Report class/message only. Never include signed URLs or extraction descriptors.
            report.putString("result", "FAIL")
            report.putString("reason", error.javaClass.simpleName + ": " + error.message.orEmpty().replace(Regex("https?://[^\\s]+"), "[redacted]").take(220))
            finish(Activity.RESULT_CANCELED, report)
        } finally { player?.release(); module.invalidate() }
    }
}
