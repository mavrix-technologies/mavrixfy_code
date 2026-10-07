package com.mavrixfy.app.youtube

import okhttp3.Call
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Cancel blocking NewPipe IO when JS aborts, and enforce a deadline across its requests. */
internal object YouTubeRequests {
    val current = ThreadLocal<String?>()
    private data class State(val deadline: Long, val calls: MutableSet<Call> = ConcurrentHashMap.newKeySet())
    private val active = ConcurrentHashMap<String, State>()
    fun begin(id: String) { active[id] = State(System.currentTimeMillis() + 24_000) }
    fun register(call: Call) {
        val id = current.get() ?: return
        val state = active[id] ?: throw IOException("Request cancelled")
        val remaining = state.deadline - System.currentTimeMillis()
        if (remaining <= 0) throw IOException("Request timed out")
        state.calls.add(call)
        call.timeout().timeout(minOf(remaining, 10_000), TimeUnit.MILLISECONDS)
        if (active[id] !== state) { call.cancel(); throw IOException("Request cancelled") }
    }
    fun release(call: Call) { current.get()?.let { active[it]?.calls?.remove(call) } }
    fun cancel(id: String) { active.remove(id)?.calls?.forEach { it.cancel() } }
}
